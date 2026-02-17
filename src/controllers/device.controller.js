import knex from '../../database/index.js';
import { jsonResponse } from '../utils/response.js';
import { parsePagination, buildMeta } from '../utils/pagination.js';

export async function list(req, res) {
  const { company_id, location_id, q, sort = 'id', order = 'asc' } = req.query || {};
  const { page, pageSize, offset, limit } = parsePagination(req.query);
  try {
    const base = knex('device as d')
      .leftJoin('company as c', 'c.id', 'd.company_id')
      .leftJoin('locations as l', 'l.id', 'd.location_id')
      .modify((qb) => {
        if (company_id) qb.where('d.company_id', company_id);
        if (location_id) qb.where('d.location_id', location_id);
        if (q) qb.andWhere(function (w) {
          w.whereILike('d.device_serial', `%${q}%`)
            .orWhereILike('d.product', `%${q}%`)
            .orWhereILike('d.description', `%${q}%`)
            .orWhereILike('d.board', `%${q}%`)
            .orWhereILike('d.sw_rev', `%${q}%`)
            .orWhereILike('c.name', `%${q}%`)
            .orWhereILike('l.location', `%${q}%`);
        });
      });

    const totalRow = await knex('device as d')
      .leftJoin('company as c', 'c.id', 'd.company_id')
      .leftJoin('locations as l', 'l.id', 'd.location_id')
      .modify((qb) => {
        if (company_id) qb.where('d.company_id', company_id);
        if (location_id) qb.where('d.location_id', location_id);
        if (q) qb.andWhere(function (w) {
          w.whereILike('d.device_serial', `%${q}%`)
            .orWhereILike('d.product', `%${q}%`)
            .orWhereILike('d.description', `%${q}%`)
            .orWhereILike('d.board', `%${q}%`)
            .orWhereILike('d.sw_rev', `%${q}%`)
            .orWhereILike('c.name', `%${q}%`)
            .orWhereILike('l.location', `%${q}%`);
        });
      })
      .count({ cnt: 'd.id' })
      .first();

    const allowedSort = ['id', 'device_serial', 'product', 'company_id', 'location_id', 'mfg_date'];
    const sortCol = allowedSort.includes(sort) ? sort : 'id';

    const rows = await base
      .select('d.*')
      .select(
        knex.raw("COALESCE(c.name, '') as company_name"),
        knex.raw("COALESCE(l.location, '') as site_name")
      )
      .orderBy(`d.${sortCol}`, order === 'desc' ? 'desc' : 'asc')
      .limit(limit)
      .offset(offset);

    return jsonResponse(res, { data: rows, meta: buildMeta({ page, pageSize, total: Number(totalRow?.cnt || 0) }) });
  } catch (e) {
    return jsonResponse(res, { error: 'Failed to list devices' }, 500);
  }
}

export async function create(req, res) {
  const body = req.body || {};
  try {
    const [row] = await knex('device').insert(body).returning('*');
    return jsonResponse(res, row || body, 201);
  } catch (e) {
    return jsonResponse(res, { error: 'Failed to create device' }, 500);
  }
}

export async function get(req, res) {
  const { id } = req.params;
  try {
    const row = await knex('device as d')
      .leftJoin('company as c', 'c.id', 'd.company_id')
      .leftJoin('locations as l', 'l.id', 'd.location_id')
      .where('d.id', id)
      .select(
        'd.*',
        knex.raw("COALESCE(c.name, '') as company_name"),
        knex.raw("COALESCE(l.location, '') as site_name")
      )
      .first();
    if (!row) return jsonResponse(res, { error: 'Not found' }, 404);
    return jsonResponse(res, row);
  } catch (e) {
    return jsonResponse(res, { error: 'Failed to get device' }, 500);
  }
}

export async function update(req, res) {
  const { id } = req.params;
  const body = req.body || {};
  try {
    const [row] = await knex('device').where({ id }).update(body).returning('*');
    if (!row) return jsonResponse(res, { error: 'Not found' }, 404);
    return jsonResponse(res, row);
  } catch (e) {
    return jsonResponse(res, { error: 'Failed to update device' }, 500);
  }
}

export async function getOverviewBySerial(req, res) {
  const { deviceSerial } = req.params;
  const { days = 7 } = req.query || {};
  try {
    const device = await knex('device').select('id', 'device_serial').where({ device_serial: deviceSerial }).first();
    if (!device) return jsonResponse(res, { error: 'Not found' }, 404);

    const now = new Date();
    const from = new Date(now.getTime() - Number(days) * 24 * 60 * 60 * 1000);

    const latestSettings = await knex
      .with('latest_settings', (qb) => {
        qb.select(knex.raw('distinct on (device_id) device_id, vol_per_cycle, created_at'))
          .from('pump_settings')
          .where('device_id', device.id)
          .orderBy([{ column: 'device_id', order: 'asc' }, { column: 'created_at', order: 'desc' }]);
      })
      .select('*')
      .from('latest_settings')
      .first();
    const vpc = Number(latestSettings?.vol_per_cycle || 0);

    const tempRows = await knex('pump_data')
      .where('device_id', device.id)
      .andWhere('created_at', '>=', from.toISOString())
      .select('created_at as ts', 'cur_adc as value')
      .orderBy('created_at', 'asc');

    const pressRows = await knex('pump_data')
      .where('device_id', device.id)
      .andWhere('created_at', '>=', from.toISOString())
      .select('created_at as ts', 'high_adc as value')
      .orderBy('created_at', 'asc');

    const levelRows = await knex('pump_data')
      .where('device_id', device.id)
      .andWhere('created_at', '>=', from.toISOString())
      .select('created_at as ts', 'low_adc as value')
      .orderBy('created_at', 'asc');

    const gallonsRows = await knex('pump_data as pd')
      .where('pd.device_id', device.id)
      .andWhere('pd.created_at', '>=', from.toISOString())
      .select(knex.raw("date_trunc('day', pd.created_at) as day"))
      .select(knex.raw('SUM(pd.volume_pumped) as sum_volume'))
      .select(knex.raw('SUM(pd.cycle_count) as sum_cycles'))
      .groupByRaw("date_trunc('day', pd.created_at)")
      .orderBy('day', 'asc');

    const gallons = gallonsRows.map(r => {
      const vol = Number(r.sum_volume || 0);
      const cycles = Number(r.sum_cycles || 0);
      const value = vol > 0 ? vol : (cycles * vpc);
      return { ts: new Date(r.day).toISOString().slice(0, 10), value };
    });

    return jsonResponse(res, {
      temperature: tempRows.map(r => ({ ts: new Date(r.ts).toISOString(), value: Number(r.value || 0) })),
      focus_main_pressure: pressRows.map(r => ({ ts: new Date(r.ts).toISOString(), value: Number(r.value || 0) })),
      liquid_level: levelRows.map(r => ({ ts: new Date(r.ts).toISOString(), value: Number(r.value || 0) })),
      gallons_pumped: gallons
    });
  } catch (e) {
    return jsonResponse(res, { error: 'Failed to build device overview' }, 500);
  }
}

export async function getHistoryBySerial(req, res) {
  const { deviceSerial } = req.params;
  const { range = '24h' } = req.query || {};
  const { page, pageSize, offset, limit } = parsePagination(req.query);
  try {
    const device = await knex('device').select('id').where({ device_serial: deviceSerial }).first();
    if (!device) return jsonResponse(res, { rows: [], total: 0 });

    const now = new Date();
    const ms = range === '7d' ? 7 * 24 * 60 * 60 * 1000 : range === '30d' ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    const from = new Date(now.getTime() - ms);

    const base = knex('pump_data as pd')
      .where('pd.device_id', device.id)
      .andWhere('pd.created_at', '>=', from.toISOString());

    const totalRow = await base.clone().count({ cnt: 'pd.id' }).first();

    const rows = await base
      .select(
        knex.raw("to_char(pd.created_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') as ts"),
        knex.raw('COALESCE(pd.volume_pumped, 0)::float as gallons'),
        knex.raw('COALESCE(pd.cycle_count, 0)::int as cycle'),
        knex.raw('COALESCE(pd.bad_cycles, 0)::int as timeouts'),
        knex.raw('SUM(COALESCE(pd.volume_pumped, 0)) OVER (ORDER BY pd.created_at ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)::float as "totalGallons"'),
        knex.raw('SUM(COALESCE(pd.cycle_count, 0)) OVER (ORDER BY pd.created_at ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)::int as "totalCycles"'),
        knex.raw('SUM(COALESCE(pd.bad_cycles, 0)) OVER (ORDER BY pd.created_at ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)::int as "totalTimeouts"'),
        knex.raw('COALESCE(pd.batt_voltage, 0)::float as battery')
      )
      .orderBy('pd.created_at', 'desc')
      .limit(limit)
      .offset(offset);

    return jsonResponse(res, { rows, total: Number(totalRow?.cnt || 0) });
  } catch (e) {
    return jsonResponse(res, { error: 'Failed to get device history' }, 500);
  }
}

export async function getSettingsBySerial(req, res) {
  const { deviceSerial } = req.params;
  const { range = '24h' } = req.query || {};
  const { page, pageSize, offset, limit } = parsePagination(req.query);
  try {
    const role = String(req.user?.role || '').toLowerCase();
    const isAdmin = role === 'admin';
    const username = req.user?.username;

    let userSiteId = null;
    if (!isAdmin && username) {
      const u = await knex('auth_users').select('site_id').where({ username }).first();
      userSiteId = u?.site_id ?? null;
    }

    if (!isAdmin && userSiteId == null) {
      return jsonResponse(res, { rows: [], total: 0 });
    }

    const device = await knex('device as d')
      .modify((qb) => {
        if (!isAdmin && userSiteId != null) qb.andWhere('d.location_id', userSiteId);
      })
      .select('d.id')
      .where({ device_serial: deviceSerial })
      .first();
    if (!device) return jsonResponse(res, { rows: [], total: 0 });

    const now = new Date();
    const ms = range === '7d' ? 7 * 24 * 60 * 60 * 1000 : range === '30d' ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    const from = new Date(now.getTime() - ms);

    const base = knex('pump_settings as ps')
      .where('ps.device_id', device.id)
      .andWhere('ps.created_at', '>=', from.toISOString());

    const totalRow = await base.clone().count({ cnt: 'ps.id' }).first();

    const rows = await base
      .select(
        'ps.id as setting_id',
        knex.raw("to_char(ps.created_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') as ts"),
        knex.raw('COALESCE(pd.high_adc, NULL)::float as "highAdc"'),
        knex.raw('COALESCE(ps.thres, NULL)::float as "threshold"'),
        knex.raw('COALESCE(pd.cur_adc, NULL)::float as "currentAdc"'),
        knex.raw('COALESCE(pd.low_adc, NULL)::float as "lowAdc"'),
        knex.raw('COALESCE(ps.hold, NULL)::int as "airOnTime"'),
        knex.raw('COALESCE(ps.max_idle, NULL)::int as "airTimeout"'),
        knex.raw('COALESCE(ps.rest, NULL)::int as "delay"')
      )
      .joinRaw(
        `LEFT JOIN LATERAL (
          SELECT p2.high_adc, p2.low_adc, p2.cur_adc
          FROM pump_data p2
          WHERE p2.device_id = ps.device_id AND p2.created_at <= ps.created_at
          ORDER BY p2.created_at DESC
          LIMIT 1
        ) pd ON TRUE`
      )
      .orderBy('ps.created_at', 'desc')
      .limit(limit)
      .offset(offset);

    return jsonResponse(res, { rows, total: Number(totalRow?.cnt || 0) });
  } catch (e) {
    return jsonResponse(res, { error: 'Failed to get device settings' }, 500);
  }
}

export async function updateSettingBySerial(req, res) {
  const { deviceSerial, settingId } = req.params;
  const body = req.body || {};
  try {
    const role = String(req.user?.role || '').toLowerCase();
    const isAdmin = role === 'admin';
    const username = req.user?.username;

    let userSiteId = null;
    if (!isAdmin && username) {
      const u = await knex('auth_users').select('site_id').where({ username }).first();
      userSiteId = u?.site_id ?? null;
    }

    if (!isAdmin && userSiteId == null) {
      return jsonResponse(res, { error: 'Not found' }, 404);
    }

    const device = await knex('device as d')
      .modify((qb) => {
        if (!isAdmin && userSiteId != null) qb.andWhere('d.location_id', userSiteId);
      })
      .select('d.id')
      .where({ device_serial: deviceSerial })
      .first();
    if (!device) return jsonResponse(res, { error: 'Not found' }, 404);

    const psRow = await knex('pump_settings as ps')
      .where('ps.id', settingId)
      .andWhere('ps.device_id', device.id)
      .select('ps.id', 'ps.device_id')
      .first();

    if (!psRow) return jsonResponse(res, { error: 'Not found' }, 404);

    const update = {};
    if (body.threshold !== undefined) update.thres = body.threshold;
    if (body.airOnTime !== undefined) update.hold = body.airOnTime;
    if (body.airTimeout !== undefined) update.max_idle = body.airTimeout;
    if (body.delay !== undefined) update.rest = body.delay;

    if (!Object.keys(update).length) {
      return jsonResponse(res, { error: 'No fields to update' }, 400);
    }

    const applyToAll = body.applyToAll === true;
    if (applyToAll) {
      const affected = await knex('pump_settings')
        .where({ device_id: device.id })
        .update(update);
      return jsonResponse(res, { success: true, setting_id: Number(settingId), affected });
    }

    const [updated] = await knex('pump_settings')
      .where({ id: settingId, device_id: device.id })
      .update(update)
      .returning(['id']);

    return jsonResponse(res, { success: true, setting_id: updated?.id ?? Number(settingId) });
  } catch (e) {
    return jsonResponse(res, { error: 'Failed to update device setting' }, 500);
  }
}

export async function remove(req, res) {
  const { id } = req.params;
  try {
    const count = await knex('device').where({ id }).del();
    if (!count) return jsonResponse(res, { error: 'Not found' }, 404);
    return jsonResponse(res, { success: true });
  } catch (e) {
    return jsonResponse(res, { error: 'Failed to delete device' }, 500);
  }
}
