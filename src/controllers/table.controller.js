import { jsonResponse } from '../utils/response.js';
import { isSafeIdentifier } from '../services/db.js';
import { knex, hasTable, getColumns } from '../services/knex.js';

export async function listTables(_req, res) {
  try {
    const result = await knex
      .select('tablename as name')
      .from('pg_catalog.pg_tables')
      .whereNotIn('schemaname', ['pg_catalog', 'information_schema'])
      .orderBy('tablename');
    return jsonResponse(res, result.map(r => r.name));
  } catch (e) {
    return jsonResponse(res, { error: 'Failed to list tables' }, 500);
  }
}

export async function getTable(req, res) {
  const table = req.params.name;
  if (!isSafeIdentifier(table)) return jsonResponse(res, { error: 'Invalid table name' }, 400);
  try {
    if (!(await hasTable(table))) return jsonResponse(res, { error: 'Table not found' }, 404);
    const rows = await knex.select('*').from(table).limit(500);
    const normalized = rows.map((row) => {
      const o = {};
      for (const [k, v] of Object.entries(row)) {
        o[k] = v == null ? '' : typeof v === 'object' ? String(v) : String(v);
      }
      return o;
    });
    return jsonResponse(res, normalized);
  } catch (e) {
    return jsonResponse(res, { error: 'Failed to fetch table data' }, 500);
  }
}

export async function insertRecord(req, res) {
  const table = req.params.name;
  if (!isSafeIdentifier(table)) return jsonResponse(res, { error: 'Invalid table name' }, 400);
  const { data } = req.body;
  try {
    if (!(await hasTable(table))) return jsonResponse(res, { error: 'Table not found' }, 404);
    const allowed = await getColumns(table);
    const entries = Object.entries(data).filter(([k]) => allowed.includes(k));
    if (entries.length === 0) return jsonResponse(res, { error: 'No valid columns in data' }, 400);
    const cols = entries.map(([k]) => k);
    const vals = entries.map(([_, v]) => v);
    const toInsert = Object.fromEntries(cols.map((k, i) => [k, vals[i]]));
    const rows = await knex(table).insert(toInsert).returning('*');
    return jsonResponse(res, { status: 'success', affected: rows.length, record: rows[0] });
  } catch (e) {
    return jsonResponse(res, { error: 'Insert failed' }, 500);
  }
}

export async function updateRecord(req, res) {
  const table = req.params.name;
  if (!isSafeIdentifier(table)) return jsonResponse(res, { error: 'Invalid table name' }, 400);
  const { data, where } = req.body;
  try {
    if (!(await hasTable(table))) return jsonResponse(res, { error: 'Table not found' }, 404);
    const allowed = await getColumns(table);
    const setEntries = Object.entries(data).filter(([k]) => allowed.includes(k));
    const whereEntries = Object.entries(where).filter(([k]) => allowed.includes(k));
    if (setEntries.length === 0) return jsonResponse(res, { error: 'No valid columns in data' }, 400);
    if (whereEntries.length === 0) return jsonResponse(res, { error: 'No valid where conditions' }, 400);
    const setObj = Object.fromEntries(setEntries);
    const whereObj = Object.fromEntries(whereEntries);
    const rows = await knex(table).update(setObj).where(whereObj).returning('*');
    return jsonResponse(res, { status: 'success', affected: rows.length, records: rows });
  } catch (e) {
    return jsonResponse(res, { error: 'Update failed' }, 500);
  }
}

export async function deleteRecord(req, res) {
  const table = req.params.name;
  if (!isSafeIdentifier(table)) return jsonResponse(res, { error: 'Invalid table name' }, 400);
  const { where } = req.body;
  try {
    if (!(await hasTable(table))) return jsonResponse(res, { error: 'Table not found' }, 404);
    const allowed = await getColumns(table);
    const whereEntries = Object.entries(where).filter(([k]) => allowed.includes(k));
    if (whereEntries.length === 0) return jsonResponse(res, { error: 'No valid where conditions' }, 400);
    const whereObj = Object.fromEntries(whereEntries);
    const result = await knex(table).where(whereObj).del();
    return jsonResponse(res, { status: 'success', affected: result });
  } catch (e) {
    return jsonResponse(res, { error: 'Delete failed' }, 500);
  }
}
