import knex from '../../database/index.js';
import { jsonResponse } from '../utils/response.js';

export async function list(req, res) {
  const { company_id, q } = req.query || {};
  try {
    const rows = await knex('locations as l')
      .modify((qb) => {
        qb.where((w) => w.where('l.deleted', false).orWhereNull('l.deleted'));
        if (company_id) qb.andWhere('l.comp_id', company_id);
        if (q) qb.andWhere((w) => w.whereILike('l.location', `%${q}%`));
      })
      .select('l.id', 'l.comp_id', 'l.location')
      .orderBy('l.location', 'asc');

    const data = rows.map((r) => ({ id: r.id, company_id: r.comp_id, site_name: r.location || '' }));
    return jsonResponse(res, { data });
  } catch (e) {
    return jsonResponse(res, { error: 'Failed to list sites' }, 500);
  }
}
