import knex from '../../database/index.js';
import crypto from 'crypto';
import { jsonResponse } from '../utils/response.js';
import { parsePagination, buildMeta } from '../utils/pagination.js';

async function resolveRoleId(roleInput) {
  if (roleInput == null) return null;
  const raw = `${roleInput}`.trim();
  if (!raw) return null;

  const byId = await knex('roles').select(['id']).where({ id: raw }).first();
  if (byId) return byId.id;

  const byName = await knex('roles')
    .select(['id'])
    .whereRaw('lower(name) = lower(?)', [raw])
    .first();
  return byName?.id || null;
}

function hashPasswordInto(toInsert, cols, password) {
  if (!password) return { ok: true };

  if (cols.password_salt && cols.password_hash) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    toInsert.password_salt = salt;
    toInsert.password_hash = hash;
    return { ok: true };
  }

  if (cols.salt && cols.password_hash) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    toInsert.salt = salt;
    toInsert.password_hash = hash;
    return { ok: true };
  }

  if (cols.password) {
    toInsert.password = password;
    return { ok: true };
  }

  return { ok: false, error: 'Auth schema unsupported: missing password columns' };
}

function pickUser(row, currentUsername) {
  if (!row) return row;
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    full_name: row.full_name ?? null,
    role: row.role ?? null,
    is_active: row.is_active ?? null,
    company_id: row.company_id ?? null,
    company_name: row.company_name ?? null,
    site_id: row.site_id ?? null,
    site_name: row.site_name ?? null,
    is_current_user: Boolean(currentUsername && row.username === currentUsername),
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null
  };
}

export async function list(req, res) {
  const { q, role, site_id } = req.query || {};
  const qTerm = typeof q === 'string' ? q.trim() : q;
  const roleTerm = typeof role === 'string' ? role.trim() : role;
  const siteId = site_id != null && site_id !== '' ? Number(site_id) : null;
  const currentUsername = req.user?.username;
  const { page, pageSize, offset, limit } = parsePagination(req.query);
  try {
    let roleIdFilter = null;
    if (roleTerm) {
      roleIdFilter = await resolveRoleId(roleTerm);
      if (!roleIdFilter) {
        return jsonResponse(res, {
          data: [],
          meta: buildMeta({ page, pageSize, total: 0 })
        });
      }
    }

    const base = knex('auth_users as u')
      .leftJoin('locations as l', 'l.id', 'u.site_id')
      .leftJoin('company as c', 'c.id', 'l.comp_id')
      .modify((qb) => {
        if (siteId != null && !Number.isNaN(siteId)) qb.andWhere('u.site_id', siteId);
        if (roleIdFilter) qb.andWhere('u.role', roleIdFilter);
        if (qTerm) {
          qb.where((w) => {
            w.whereILike('u.username', `%${qTerm}%`)
              .orWhereILike('u.email', `%${qTerm}%`)
              .orWhereILike('u.full_name', `%${qTerm}%`)
              .orWhereILike('u.role', `%${qTerm}%`)
              .orWhereILike('l.location', `%${qTerm}%`)
              .orWhereILike('c.name', `%${qTerm}%`);
          });
        }
      });

    const totalRow = await base.clone().countDistinct({ cnt: 'u.id' }).first();

    const rows = await base
      .select(
        'u.id',
        'u.username',
        'u.email',
        'u.full_name',
        'u.role',
        'u.is_active',
        'u.site_id',
        'u.created_at',
        'u.updated_at',
        knex.raw('COALESCE(l.location, \'\') as site_name'),
        knex.raw('COALESCE(c.id, NULL)::int as company_id'),
        knex.raw('COALESCE(c.name, \'\') as company_name')
      )
      .orderBy('u.id', 'desc')
      .limit(limit)
      .offset(offset);

    return jsonResponse(res, {
      data: rows.map((r) => pickUser(r, currentUsername)),
      meta: buildMeta({ page, pageSize, total: Number(totalRow?.cnt || 0) })
    });
  } catch (e) {
    return jsonResponse(res, { error: 'Failed to list users' }, 500);
  }
}

export async function get(req, res) {
  const { id } = req.params;
  try {
    const currentUsername = req.user?.username;
    const row = await knex('auth_users as u')
      .leftJoin('locations as l', 'l.id', 'u.site_id')
      .leftJoin('company as c', 'c.id', 'l.comp_id')
      .where('u.id', id)
      .select(
        'u.id',
        'u.username',
        'u.email',
        'u.full_name',
        'u.role',
        'u.is_active',
        'u.site_id',
        'u.created_at',
        'u.updated_at',
        knex.raw('COALESCE(l.location, \'\') as site_name'),
        knex.raw('COALESCE(c.id, NULL)::int as company_id'),
        knex.raw('COALESCE(c.name, \'\') as company_name')
      )
      .first();
    if (!row) return jsonResponse(res, { error: 'Not found' }, 404);
    return jsonResponse(res, pickUser(row, currentUsername));
  } catch (e) {
    return jsonResponse(res, { error: 'Failed to get user' }, 500);
  }
}

export async function create(req, res) {
  const { username, email, fullName, role, site_id, password } = req.body;
  try {
    const currentUsername = req.user?.username;
    const cols = await knex('auth_users').columnInfo();

    const existing = await knex('auth_users').where('username', username).orWhere('email', email).first();
    if (existing) return jsonResponse(res, { error: 'Username or email already exists' }, 409);

    const roleId = await resolveRoleId(role);
    if (!roleId) return jsonResponse(res, { error: 'Role not found' }, 404);

    if (site_id != null) {
      const site = await knex('locations').select('id').where({ id: site_id }).first();
      if (!site) return jsonResponse(res, { error: 'Site not found' }, 404);
    }

    const toInsert = { username, email };
    if (cols.full_name) toInsert.full_name = fullName || null;
    if (cols.role) toInsert.role = roleId;
    if (cols.site_id) toInsert.site_id = site_id ?? null;
    if (cols.is_active) toInsert.is_active = true;

    const pass = password || crypto.randomBytes(10).toString('hex');
    const passRes = hashPasswordInto(toInsert, cols, pass);
    if (!passRes.ok) return jsonResponse(res, { error: passRes.error }, 500);

    const rows = await knex('auth_users').insert(toInsert).returning(['id']);
    const id = rows?.[0]?.id;

    const created = await knex('auth_users as u')
      .leftJoin('locations as l', 'l.id', 'u.site_id')
      .where('u.id', id)
      .select(
        'u.id',
        'u.username',
        'u.email',
        'u.full_name',
        'u.role',
        'u.is_active',
        'u.site_id',
        'u.created_at',
        'u.updated_at',
        knex.raw('COALESCE(l.location, \'\') as site_name')
      )
      .first();

    return jsonResponse(
      res,
      {
        success: true,
        message: 'User created successfully',
        data: pickUser(created || { id, ...toInsert }, currentUsername)
      },
      201
    );
  } catch (e) {
    return jsonResponse(res, { error: 'Failed to create user' }, 500);
  }
}

export async function update(req, res) {
  const { id } = req.params;
  const { username, email, fullName, role, site_id, is_active, password } = req.body;
  try {
    const currentUsername = req.user?.username;
    const cols = await knex('auth_users').columnInfo();

    const existing = await knex('auth_users').where({ id }).first();
    if (!existing) return jsonResponse(res, { error: 'Not found' }, 404);

    if (username !== undefined) {
      const usernameExists = await knex('auth_users').where({ username }).andWhereNot({ id }).first();
      if (usernameExists) return jsonResponse(res, { error: 'Username already exists' }, 409);
    }
    if (email !== undefined) {
      const emailExists = await knex('auth_users').where({ email }).andWhereNot({ id }).first();
      if (emailExists) return jsonResponse(res, { error: 'Email already exists' }, 409);
    }

    const updates = {};
    if (username !== undefined) updates.username = username;
    if (email !== undefined) updates.email = email;
    if (cols.full_name && fullName !== undefined) updates.full_name = fullName;

    if (role !== undefined) {
      const roleId = await resolveRoleId(role);
      if (!roleId) return jsonResponse(res, { error: 'Role not found' }, 404);
      if (cols.role) updates.role = roleId;
    }

    if (site_id !== undefined) {
      if (site_id != null) {
        const site = await knex('locations').select('id').where({ id: site_id }).first();
        if (!site) return jsonResponse(res, { error: 'Site not found' }, 404);
      }
      if (cols.site_id) updates.site_id = site_id;
    }

    if (cols.is_active && is_active !== undefined) updates.is_active = is_active;

    if (cols.updated_at) updates.updated_at = knex.fn.now();

    if (password !== undefined) {
      const passRes = hashPasswordInto(updates, cols, password);
      if (!passRes.ok) return jsonResponse(res, { error: passRes.error }, 500);
    }

    const rows = await knex('auth_users').where({ id }).update(updates).returning(['id']);
    if (!rows.length) return jsonResponse(res, { error: 'Not found' }, 404);

    const updated = await knex('auth_users as u')
      .leftJoin('locations as l', 'l.id', 'u.site_id')
      .where('u.id', id)
      .select(
        'u.id',
        'u.username',
        'u.email',
        'u.full_name',
        'u.role',
        'u.is_active',
        'u.site_id',
        'u.created_at',
        'u.updated_at',
        knex.raw('COALESCE(l.location, \'\') as site_name')
      )
      .first();

    return jsonResponse(res, {
      success: true,
      message: 'User updated successfully',
      data: pickUser(updated, currentUsername)
    });
  } catch (e) {
    return jsonResponse(res, { error: 'Failed to update user' }, 500);
  }
}

export async function remove(req, res) {
  const { id } = req.params;
  try {
    const count = await knex('auth_users').where({ id }).del();
    if (!count) return jsonResponse(res, { error: 'Not found' }, 404);
    return jsonResponse(res, { success: true, message: 'User deleted successfully' });
  } catch (e) {
    return jsonResponse(res, { error: 'Failed to delete user' }, 500);
  }
}
