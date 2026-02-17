import knex from '../../database/index.js';
import { jsonResponse } from '../utils/response.js';

function pgTextArrayToJs(val) {
  if (Array.isArray(val)) {
    // Handle driver returning ["{\"a\",\"b\"}"]
    if (val.length === 1 && typeof val[0] === 'string') {
      const s0 = val[0].trim();
      if (s0.startsWith('{') && s0.endsWith('}')) {
        const inner = s0.slice(1, -1);
        if (!inner) return [];
        return inner
          .split(',')
          .map((x) => x.trim().replace(/^"|"$/g, ''))
          .filter((x) => x.length > 0);
      }
    }
    return val;
  }
  if (val == null) return [];
  if (typeof val !== 'string') return [];
  // Expect format: {"a","b"} or {a,b}
  const s = val.trim();
  if (!s.startsWith('{') || !s.endsWith('}')) return [];
  const inner = s.slice(1, -1);
  if (!inner) return [];
  return inner
    .split(',')
    .map((x) => x.trim().replace(/^"|"$/g, ''))
    .filter((x) => x.length > 0);
}

function normalizeRole(row) {
  if (!row) return row;
  return {
    ...row,
    allowed_tables: pgTextArrayToJs(row.allowed_tables),
    allowed_routes: pgTextArrayToJs(row.allowed_routes)
  };
}

export async function list(req, res) {
  try {
    const rows = await knex('roles').select('*').orderBy('id');
    return jsonResponse(res, rows.map(normalizeRole));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('roles.list error:', e.message || e);
    return jsonResponse(res, { error: 'Failed to list roles', details: e.message || undefined }, 500);
  }
}

export async function get(req, res) {
  const { id } = req.params;
  try {
    const row = await knex('roles').where({ id }).first();
    if (!row) return jsonResponse(res, { error: 'Not found' }, 404);
    return jsonResponse(res, normalizeRole(row));
  } catch (e) {
    return jsonResponse(res, { error: 'Failed to get role' }, 500);
  }
}

function castArray(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return knex.raw('ARRAY[]::text[]');
  const placeholders = arr.map(() => '?').join(',');
  return knex.raw(`ARRAY[${placeholders}]::text[]`, arr);
}

export async function create(req, res) {
  const { id, name, description = '', allowed_tables = [], allowed_routes = [] } = req.body;
  try {
    const exists = await knex('roles').where({ id }).first();
    if (exists) return jsonResponse(res, { error: 'Role id already exists' }, 409);
    if (name) {
      const nameExists = await knex('roles').where({ name }).first();
      if (nameExists) return jsonResponse(res, { error: 'Role name already exists' }, 409);
    }
    const payload = {
      id,
      name,
      description,
      allowed_tables: castArray(allowed_tables),
      allowed_routes: castArray(allowed_routes)
    };
    const rows = await knex('roles').insert(payload).returning('*');
    const created = rows[0] || payload;
    return jsonResponse(res, normalizeRole(created), 201);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('roles.create error:', e.message || e);
    if (e && (e.code === '23505' || /duplicate key value/i.test(String(e.message)))) {
      const msg = /roles_name_unique/.test(String(e.message)) ? 'Role name already exists' : 'Role already exists';
      return jsonResponse(res, { error: msg, details: e.detail || e.message }, 409);
    }
    return jsonResponse(res, { error: 'Failed to create role', details: e.message || undefined }, 500);
  }
}

export async function update(req, res) {
  const { id } = req.params;
  const { name, description, allowed_tables, allowed_routes } = req.body;
  try {
    // If updating name, ensure uniqueness (excluding this role)
    if (name !== undefined) {
      const nameExists = await knex('roles').where('name', name).andWhereNot('id', id).first();
      if (nameExists) return jsonResponse(res, { error: 'Role name already exists' }, 409);
    }
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (allowed_tables !== undefined) updates.allowed_tables = castArray(allowed_tables);
    if (allowed_routes !== undefined) updates.allowed_routes = castArray(allowed_routes);
    const rows = await knex('roles').where({ id }).update(updates).returning('*');
    if (!rows.length) return jsonResponse(res, { error: 'Not found' }, 404);
    return jsonResponse(res, normalizeRole(rows[0]));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('roles.update error:', e.message || e);
    if (e && (e.code === '23505' || /duplicate key value/i.test(String(e.message)))) {
      const msg = /roles_name_unique/.test(String(e.message)) ? 'Role name already exists' : 'Role already exists';
      return jsonResponse(res, { error: msg, details: e.detail || e.message }, 409);
    }
    return jsonResponse(res, { error: 'Failed to update role', details: e.message || undefined }, 500);
  }
}

export async function remove(req, res) {
  const { id } = req.params;
  try {
    const count = await knex('roles').where({ id }).del();
    if (!count) return jsonResponse(res, { error: 'Not found' }, 404);
    return jsonResponse(res, { success: true });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('roles.remove error:', e.message || e);
    return jsonResponse(res, { error: 'Failed to delete role', details: e.message || undefined }, 500);
  }
}
