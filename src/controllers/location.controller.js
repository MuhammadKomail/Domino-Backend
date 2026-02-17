import knex from '../../database/index.js';
import { jsonResponse } from '../utils/response.js';
import { parsePagination, buildMeta } from '../utils/pagination.js';

export async function list(req, res) {
  const { company_id, q, sort = 'id', order = 'asc' } = req.query || {};
  const { page, pageSize, offset, limit } = parsePagination(req.query);
  try {
    const base = knex('locations as l')
      .leftJoin('device as d', function() {
        this.on('d.location_id', '=', 'l.id');
        this.andOn('d.company_id', '=', knex.raw('l.comp_id'));
      })
      .modify((qb) => {
        if (company_id) qb.where('l.comp_id', company_id);
        qb.where(function(wb){
          wb.where('l.deleted', false).orWhereNull('l.deleted');
        });
        if (q) qb.andWhere(function(w){
          w.whereILike('l.address', `%${q}%`)
           .orWhereILike('l.city', `%${q}%`)
           .orWhereILike('l.state', `%${q}%`)
           .orWhereILike('l.zip', `%${q}%`)
           .orWhereILike('l.location', `%${q}%`);
        });
      })
      .groupBy('l.id');

    const totalRow = await knex('locations as l')
      .modify((qb) => {
        if (company_id) qb.where('l.comp_id', company_id);
        qb.where(function(wb){
          wb.where('l.deleted', false).orWhereNull('l.deleted');
        });
        if (q) qb.andWhere(function(w){
          w.whereILike('l.address', `%${q}%`)
           .orWhereILike('l.city', `%${q}%`)
           .orWhereILike('l.state', `%${q}%`)
           .orWhereILike('l.zip', `%${q}%`)
           .orWhereILike('l.location', `%${q}%`);
        });
      })
      .countDistinct({ cnt: 'l.id' }).first();
    const allowedSort = ['id', 'city', 'state', 'zip', 'address'];
    const sortCol = allowedSort.includes(sort) ? sort : 'id';

    const rows = await base
      .select('l.*')
      .select(knex.raw('COUNT(d.id)::int as total_pumps'))
      .orderBy(`l.${sortCol}`, order === 'desc' ? 'desc' : 'asc')
      .limit(limit)
      .offset(offset);

    return jsonResponse(res, { data: rows, meta: buildMeta({ page, pageSize, total: Number(totalRow?.cnt || 0) }) });
  } catch (e) {
    return jsonResponse(res, { error: 'Failed to list locations' }, 500);
  }
}

// List locations with their devices embedded
export async function listWithDevices(req, res) {
  const { company_id, q, sort = 'id', order = 'asc' } = req.query || {};
  const { page, pageSize, offset, limit } = parsePagination(req.query);
  try {
    const base = knex('locations as l')
      .leftJoin('device as d', function() {
        this.on('d.location_id', '=', 'l.id');
        this.andOn('d.company_id', '=', knex.raw('l.comp_id'));
      })
      .modify((qb) => {
        if (company_id) qb.where('l.comp_id', company_id);
        qb.where(function(wb){
          wb.where('l.deleted', false).orWhereNull('l.deleted');
        });
        if (q) qb.andWhere(function(w){
          w.whereILike('l.address', `%${q}%`)
           .orWhereILike('l.city', `%${q}%`)
           .orWhereILike('l.state', `%${q}%`)
           .orWhereILike('l.zip', `%${q}%`)
           .orWhereILike('l.location', `%${q}%`);
        });
      })
      .groupBy('l.id');

    const totalRow = await knex('locations as l')
      .modify((qb) => {
        if (company_id) qb.where('l.comp_id', company_id);
        qb.where(function(wb){
          wb.where('l.deleted', false).orWhereNull('l.deleted');
        });
        if (q) qb.andWhere(function(w){
          w.whereILike('l.address', `%${q}%`)
           .orWhereILike('l.city', `%${q}%`)
           .orWhereILike('l.state', `%${q}%`)
           .orWhereILike('l.zip', `%${q}%`)
           .orWhereILike('l.location', `%${q}%`);
        });
      })
      .countDistinct({ cnt: 'l.id' }).first();

    const allowedSort = ['id', 'city', 'state', 'zip', 'address', 'location'];
    const sortCol = allowedSort.includes(sort) ? sort : 'id';

    const locations = await base
      .select('l.*')
      .select(knex.raw('COUNT(d.id)::int as total_pumps'))
      .orderBy(`l.${sortCol}`, order === 'desc' ? 'desc' : 'asc')
      .limit(limit)
      .offset(offset);

    const locIds = locations.map(l => l.id);
    let devicesByLoc = {};
    if (locIds.length) {
      const devs = await knex('device as d')
        .whereIn('d.location_id', locIds)
        .modify((qb) => {
          if (company_id) qb.andWhere('d.company_id', company_id);
        })
        .select('d.*')
        .orderBy('d.id', 'asc');
      devicesByLoc = devs.reduce((acc, d) => {
        if (!acc[d.location_id]) acc[d.location_id] = [];
        acc[d.location_id].push(d);
        return acc;
      }, {});
    }

    const data = locations.map(l => ({
      ...l,
      devices: devicesByLoc[l.id] || []
    }));

    return jsonResponse(res, { data, meta: buildMeta({ page, pageSize, total: Number(totalRow?.cnt || 0) }) });
  } catch (e) {
    return jsonResponse(res, { error: 'Failed to list locations with devices' }, 500);
  }
}

export async function create(req, res) {
  const body = req.body;
  try {
    if (body?.comp_id) {
      const company = await knex('company').select('id').where({ id: body.comp_id }).first();
      if (!company) {
        return jsonResponse(res, { error: 'Company not found' }, 400);
      }
    }
    const [row] = await knex('locations').insert(body).returning('*');
    return jsonResponse(res, row || body, 201);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('create location error:', e.message || e);
    return jsonResponse(res, { error: 'Failed to create location' }, 500);
  }
}

export async function get(req, res) {
  const { id } = req.params;
  try {
    const row = await knex('locations').where({ id }).first();
    if (!row) return jsonResponse(res, { error: 'Not found' }, 404);
    return jsonResponse(res, row);
  } catch (e) {
    return jsonResponse(res, { error: 'Failed to get location' }, 500);
  }
}

export async function update(req, res) {
  const { id } = req.params;
  const body = req.body;
  try {
    const [row] = await knex('locations').where({ id }).update(body).returning('*');
    if (!row) return jsonResponse(res, { error: 'Not found' }, 404);
    return jsonResponse(res, row);
  } catch (e) {
    return jsonResponse(res, { error: 'Failed to update location' }, 500);
  }
}

export async function remove(req, res) {
  const { id } = req.params;
  try {
    const count = await knex('locations').where({ id }).del();
    if (!count) return jsonResponse(res, { error: 'Not found' }, 404);
    return jsonResponse(res, { success: true });
  } catch (e) {
    return jsonResponse(res, { error: 'Failed to delete location' }, 500);
  }
}

export async function createWithDevices(req, res) {
  const { comp_id, location, address = '', city = '', state = '', zip = '', devices = [] } = req.body || {};
  try {
    if (comp_id) {
      const company = await knex('company').select('id').where({ id: comp_id }).first();
      if (!company) {
        return jsonResponse(res, { error: 'Company not found', field: 'comp_id', value: comp_id }, 400);
      }
    }

    const deviceCompanyIds = Array.from(
      new Set(
        (devices || [])
          .map((d) => d.company_id)
          .filter((v) => v !== undefined && v !== null)
          .map((v) => Number(v))
      )
    );
    if (deviceCompanyIds.length) {
      const rows = await knex('company').select('id').whereIn('id', deviceCompanyIds);
      const found = new Set(rows.map((r) => Number(r.id)));
      const missing = deviceCompanyIds.filter((id) => !found.has(id));
      if (missing.length) {
        return jsonResponse(res, { error: 'Device company not found', field: 'devices.company_id', value: missing }, 400);
      }
    }

    const result = await knex.transaction(async (trx) => {
      let loc;
      await trx.raw('SAVEPOINT sp_loc_insert');
      try {
        [loc] = await trx('locations').insert({ comp_id, location, address, city, state, zip }).returning('*');
        await trx.raw('RELEASE SAVEPOINT sp_loc_insert');
      } catch (err) {
        const msg = (err && (err.detail || err.message || String(err))) || '';
        if (err?.code === '23505' && msg.includes('Key (id)=(')) {
          await trx.raw('ROLLBACK TO SAVEPOINT sp_loc_insert');
          const row = await trx('locations').max({ max: 'id' }).first();
          const nextId = (row?.max || 0) + 1;
          [loc] = await trx('locations').insert({ id: nextId, comp_id, location, address, city, state, zip }).returning('*');
          await trx.raw('RELEASE SAVEPOINT sp_loc_insert');
        } else {
          throw err;
        }
      }
      const toInsert = devices.map((d) => ({
        company_id: d.company_id || comp_id,
        location_id: loc.id,
        product: d.product || '',
        device_serial: d.device_serial,
        description: d.description || '',
        mfg_date: d.mfg_date || null,
        board: d.board || '',
        sw_rev: d.sw_rev || '',
        well_id: d.well_id || 1
      }));
      let inserted = [];
      if (toInsert.length) {
        await trx.raw('SAVEPOINT sp_device_insert');
        try {
          inserted = await trx('device').insert(toInsert).returning('*');
          await trx.raw('RELEASE SAVEPOINT sp_device_insert');
        } catch (err) {
          const msg = (err && (err.detail || err.message || String(err))) || '';
          if (err?.code === '23505' && msg.includes('Key (id)=(')) {
            await trx.raw('ROLLBACK TO SAVEPOINT sp_device_insert');
            const row = await trx('device').max({ max: 'id' }).first();
            let nextId = (row?.max || 0) + 1;
            const withIds = toInsert.map((d) => ({ ...d, id: nextId++ }));
            inserted = await trx('device').insert(withIds).returning('*');
            await trx.raw('RELEASE SAVEPOINT sp_device_insert');
          } else {
            throw err;
          }
        }
      }
      return { location: loc, devices: inserted };
    });
    return jsonResponse(res, result, 201);
  } catch (e) {
    if (e?.code === '23503') {
      return jsonResponse(res, { error: 'Invalid reference (foreign key)', detail: e.detail || undefined }, 400);
    }
    if (e?.code === '23505') {
      return jsonResponse(res, { error: 'Duplicate record', detail: e.detail || undefined }, 409);
    }
    // eslint-disable-next-line no-console
    console.error('createWithDevices error:', e);
    const debug = process.env.NODE_ENV !== 'production'
      ? {
        code: e?.code,
        detail: e?.detail,
        constraint: e?.constraint,
        message: e?.message
      }
      : undefined;
    return jsonResponse(res, { error: 'Failed to create site with devices', debug }, 500);
  }
}

export async function updateWithDevices(req, res) {
  const { id } = req.params; // location id
  const {
    comp_id,
    location,
    address,
    city,
    state,
    zip,
    devices,
    deleteDeviceIds = []
  } = req.body || {};

  try {
    const result = await knex.transaction(async (trx) => {
      const existingLoc = await trx('locations').where({ id }).first();
      if (!existingLoc) {
        return { notFound: true };
      }

      const nextCompId = comp_id !== undefined ? comp_id : existingLoc.comp_id;
      if (nextCompId) {
        const company = await trx('company').select('id').where({ id: nextCompId }).first();
        if (!company) {
          return { badRequest: { error: 'Company not found', field: 'comp_id', value: nextCompId } };
        }
      }

      const locUpdates = {};
      if (comp_id !== undefined) locUpdates.comp_id = comp_id;
      if (location !== undefined) locUpdates.location = location;
      if (address !== undefined) locUpdates.address = address;
      if (city !== undefined) locUpdates.city = city;
      if (state !== undefined) locUpdates.state = state;
      if (zip !== undefined) locUpdates.zip = zip;

      let updatedLoc = existingLoc;
      if (Object.keys(locUpdates).length) {
        const [row] = await trx('locations').where({ id }).update(locUpdates).returning('*');
        updatedLoc = row || (await trx('locations').where({ id }).first());
      }

      const effectiveCompanyId = updatedLoc.comp_id;

      // Delete requested devices (hard delete), scoped to this location
      if (Array.isArray(deleteDeviceIds) && deleteDeviceIds.length) {
        await trx('device')
          .whereIn('id', deleteDeviceIds)
          .andWhere('location_id', id)
          .del();
      }

      // Upsert devices
      if (Array.isArray(devices) && devices.length) {
        // Validate company_id references from devices if provided
        const deviceCompanyIds = Array.from(
          new Set(
            devices
              .map((d) => d?.company_id)
              .filter((v) => v !== undefined && v !== null)
              .map((v) => Number(v))
          )
        );
        if (deviceCompanyIds.length) {
          const rows = await trx('company').select('id').whereIn('id', deviceCompanyIds);
          const found = new Set(rows.map((r) => Number(r.id)));
          const missing = deviceCompanyIds.filter((cid) => !found.has(cid));
          if (missing.length) {
            return { badRequest: { error: 'Device company not found', field: 'devices.company_id', value: missing } };
          }
        }

        for (const d of devices) {
          if (!d) continue;
          const payload = {
            company_id: d.company_id || effectiveCompanyId,
            location_id: Number(id),
            product: d.product ?? '',
            device_serial: d.device_serial,
            description: d.description ?? '',
            mfg_date: d.mfg_date || null,
            board: d.board ?? '',
            sw_rev: d.sw_rev ?? '',
            well_id: d.well_id ?? 1
          };

          if (d.id) {
            // Update only if device belongs to this location
            const existingDev = await trx('device').where({ id: d.id, location_id: id }).first();
            if (existingDev) {
              await trx('device').where({ id: d.id }).update(payload);
              continue;
            }
          }

          // If no id (or not found), try to update by device_serial within this location
          const existingBySerial = await trx('device').where({ device_serial: d.device_serial, location_id: id }).first();
          if (existingBySerial) {
            await trx('device').where({ id: existingBySerial.id }).update(payload);
          } else {
            await trx('device').insert(payload);
          }
        }
      }

      const finalDevices = await trx('device')
        .where({ location_id: id })
        .andWhere('company_id', effectiveCompanyId)
        .select('*')
        .orderBy('id', 'asc');

      return { location: updatedLoc, devices: finalDevices };
    });

    if (result?.notFound) return jsonResponse(res, { error: 'Not found' }, 404);
    if (result?.badRequest) return jsonResponse(res, result.badRequest, 400);
    return jsonResponse(res, result);
  } catch (e) {
    if (e?.code === '23503') {
      return jsonResponse(res, { error: 'Invalid reference (foreign key)', detail: e.detail || undefined }, 400);
    }
    if (e?.code === '23505') {
      return jsonResponse(res, { error: 'Duplicate record', detail: e.detail || undefined }, 409);
    }
    // eslint-disable-next-line no-console
    console.error('updateWithDevices error:', e);
    return jsonResponse(res, { error: 'Failed to update site with devices' }, 500);
  }
}

// Fetch a single location with its devices
export async function getWithDevices(req, res) {
  const { id } = req.params;
  try {
    const location = await knex('locations as l')
      .leftJoin('company as c', 'c.id', 'l.comp_id')
      .where('l.id', id)
      .select(
        'l.*',
        knex.raw('COALESCE(c.name, \'\') as company_name')
      )
      .first();
    if (!location) return jsonResponse(res, { error: 'Not found' }, 404);

    const devices = await knex('device as d')
      .where('d.location_id', id)
      .modify((qb) => {
        if (location.comp_id) qb.andWhere('d.company_id', location.comp_id);
      })
      .select('d.*')
      .orderBy('d.id', 'asc');

    const total_pumps = devices.length;
    return jsonResponse(res, { ...location, total_pumps, devices });
  } catch (e) {
    return jsonResponse(res, { error: 'Failed to get location with devices' }, 500);
  }
}
