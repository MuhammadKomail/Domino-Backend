import knex from '../../database/index.js';
import { jsonResponse } from '../utils/response.js';
import { parsePagination, buildMeta } from '../utils/pagination.js';

export async function list(req, res) {
  const { q, sort = 'name', order = 'asc' } = req.query || {};
  const { page, pageSize, offset, limit } = parsePagination(req.query);
  try {
    const base = knex('company as c')
      .modify((qb) => {
        if (q) qb.whereILike('c.name', `%${q}%`);
        qb.where((w) => w.where('c.deleted', false).orWhereNull('c.deleted'));
      });

    const totalRow = await base.clone().countDistinct({ cnt: 'c.id' }).first();
    const allowedSort = ['name', 'created_at'];
    const sortCol = allowedSort.includes(sort) ? sort : 'name';

    const rows = await base
      .select('c.*')
      .orderBy(`c.${sortCol}`, order === 'desc' ? 'desc' : 'asc')
      .limit(limit)
      .offset(offset);

    return jsonResponse(res, { data: rows, meta: buildMeta({ page, pageSize, total: Number(totalRow?.cnt || 0) }) });
  } catch (e) {
    return jsonResponse(res, { error: 'Failed to list companies' }, 500);
  }

}

// Company location/site overview metrics for dashboard charts
export async function getCompanyLocationOverview(req, res) {
  const { id, locationId } = req.params;
  const {
    days,
    day,
    period,
    deviceIds,
    deviceId,
    includeEmpty = 'true',
    granularity,
    levelField = 'cur_adc',
    pressureField = 'high_adc',
    temperatureField = 'cur_adc'
  } = req.query || {};

  const resolvePeriod = ({ period, daysValue, granularity }) => {
    const p = String(period || '').toLowerCase();
    const hasDays = daysValue !== undefined && daysValue !== null && String(daysValue).trim() !== '';
    const hasGran = granularity !== undefined && granularity !== null && String(granularity).trim() !== '';

    const rawGran = String(granularity || '').toLowerCase();
    const normalizedGran = rawGran === 'daily' ? 'day' : rawGran;

    // Defaults
    let outDays = hasDays ? daysValue : 7;
    let outBucket = hasGran ? normalizedGran : 'total';

    if (p === 'weekly') {
      if (!hasDays) outDays = 7;
      if (!hasGran) outBucket = 'day';
    } else if (p === 'monthly') {
      if (!hasDays) outDays = 30;
      if (!hasGran) outBucket = 'week';
    } else if (p === 'yearly') {
      if (!hasDays) outDays = 365;
      if (!hasGran) outBucket = 'month';
    }

    // Allow only supported buckets
    const allowed = new Set(['total', 'day', 'week', 'month']);
    if (!allowed.has(outBucket)) outBucket = 'total';

    return { daysValue: outDays, bucket: outBucket, hasDays };
  };

  const { daysValue, bucket, hasDays } = resolvePeriod({ period, daysValue: (days ?? day), granularity });
  const deviceIdsValue = deviceIds ?? deviceId;

  const includeEmptyFlag = ['1', 'true', 'yes'].includes(String(includeEmpty).toLowerCase());
  const toIso = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString();
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  };

  const allowedPumpDataFields = new Set([
    'cycle_count',
    'bad_cycles',
    'volume_pumped',
    'batt_voltage',
    'cur_adc',
    'high_adc',
    'low_adc'
  ]);

  const validateField = (field, paramName) => {
    const f = String(field || '').trim();
    if (!allowedPumpDataFields.has(f)) {
      return jsonResponse(
        res,
        {
          error: 'Invalid field',
          field: paramName,
          value: f,
          allowed: Array.from(allowedPumpDataFields)
        },
        400
      );
    }
    return null;
  };

  const buildBucketIsoList = ({ from, to, anchorIso, maxPoints, bucket }) => {
    const fromD = new Date(from);
    const toD = new Date(to);
    const anchor = new Date(anchorIso);
    if (Number.isNaN(fromD.getTime()) || Number.isNaN(toD.getTime()) || Number.isNaN(anchor.getTime())) return null;

    const align = (d) => {
      if (bucket === 'month') {
        return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, anchor.getUTCHours(), anchor.getUTCMinutes(), 0, 0));
      }
      if (bucket === 'week') {
        // Align to Monday UTC (Postgres date_trunc('week') uses Monday)
        const wd = d.getUTCDay(); // 0-6 (Sun-Sat)
        const diff = (wd + 6) % 7; // days since Monday
        const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), anchor.getUTCHours(), anchor.getUTCMinutes(), 0, 0));
        monday.setUTCDate(monday.getUTCDate() - diff);
        return monday;
      }
      // day
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), anchor.getUTCHours(), anchor.getUTCMinutes(), 0, 0));
    };

    let cur = align(fromD);
    const end = align(toD);
    const list = [];
    while (cur.getTime() <= end.getTime()) {
      list.push(cur.toISOString());
      if (list.length > maxPoints) return { tooLarge: true, points: list.length };
      if (bucket === 'month') {
        cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1, cur.getUTCHours(), cur.getUTCMinutes(), 0, 0));
      } else if (bucket === 'week') {
        cur = new Date(cur.getTime() + 7 * 24 * 60 * 60 * 1000);
      } else {
        cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000);
      }
    }
    return { list, points: list.length };
  };

  const fillBucketSeriesByDevice = ({ devices, series, bucketIsoList, defaultValue = 0 }) => {
    const byDeviceByDay = new Map();
    for (const r of series || []) {
      if (!r || !r.device_id || !r.date) continue;
      if (!byDeviceByDay.has(r.device_id)) byDeviceByDay.set(r.device_id, new Map());
      byDeviceByDay.get(r.device_id).set(r.date, r);
    }

    const out = [];
    for (const d of devices) {
      const perDay = byDeviceByDay.get(d.id) || new Map();
      for (const iso of bucketIsoList) {
        const existing = perDay.get(iso);
        if (existing) {
          out.push(existing);
        } else {
          out.push({ device_id: d.id, device_serial: d.device_serial, date: iso, value: defaultValue });
        }
      }
    }
    return out;
  };

  const addBucketLabels = ({ series, bucket, rangeStart }) => {
    if (!Array.isArray(series)) return series;
    if (bucket !== 'day' && bucket !== 'week' && bucket !== 'month') return series;

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const startD = new Date(rangeStart);
    if (Number.isNaN(startD.getTime())) return series;

    const alignToMondayUtc = (d) => {
      const wd = d.getUTCDay();
      const diff = (wd + 6) % 7;
      const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
      monday.setUTCDate(monday.getUTCDate() - diff);
      return monday;
    };

    const weekZero = alignToMondayUtc(startD).getTime();
    const weekMs = 7 * 24 * 60 * 60 * 1000;

    return series.map((r) => {
      if (!r || !r.date) return r;
      const d = new Date(r.date);
      if (Number.isNaN(d.getTime())) return r;

      if (bucket === 'day') {
        return { ...r, label: d.toISOString().slice(0, 10) };
      }

      if (bucket === 'month') {
        const m = monthNames[d.getUTCMonth()] || '';
        const y = d.getUTCFullYear();
        return { ...r, label: `${m} ${y}`.trim() };
      }

      const monday = alignToMondayUtc(d).getTime();
      const idx = Math.floor((monday - weekZero) / weekMs) + 1;
      return { ...r, label: `Week ${idx}` };
    });
  };

  try {
    const levelFieldError = validateField(levelField, 'levelField');
    if (levelFieldError) return;
    const pressureFieldError = validateField(pressureField, 'pressureField');
    if (pressureFieldError) return;
    const temperatureFieldError = validateField(temperatureField, 'temperatureField');
    if (temperatureFieldError) return;

    const company = await knex('company').select('id', 'name').where({ id }).first();
    if (!company) return jsonResponse(res, { error: 'Not found' }, 404);

    const location = await knex('locations as l')
      .where('l.id', locationId)
      .andWhere('l.comp_id', id)
      .andWhere((w) => w.where('l.deleted', false).orWhereNull('l.deleted'))
      .select('l.id', 'l.location')
      .first();

    if (!location) return jsonResponse(res, { error: 'Not found' }, 404);

    // Resolve device list under this location
    const devBase = knex('device as d')
      .where('d.company_id', id)
      .andWhere('d.location_id', locationId);

    if (deviceIdsValue) {
      const ids = String(deviceIdsValue).split(',').map(s => s.trim()).filter(Boolean);
      if (ids.length) devBase.whereIn('d.id', ids);
    }

    const devices = await devBase.select('d.id', 'd.device_serial', 'd.location_id').orderBy('d.device_serial', 'asc');
    const deviceIdsArr = devices.map(d => d.id);
    const deviceById = devices.reduce((acc, d) => { acc[d.id] = d; return acc; }, {});

    const now = new Date();
    let from = new Date(now.getTime() - Number(daysValue) * 24 * 60 * 60 * 1000);
    const p = String(period || '').toLowerCase();
    if (!hasDays && p === 'weekly') {
      from = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    }
    if (!hasDays && p === 'monthly') {
      from = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        1,
        now.getUTCHours(),
        now.getUTCMinutes(),
        0,
        0
      ));
    }
    if (!hasDays && p === 'yearly') {
      from = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth() - 11,
        1,
        now.getUTCHours(),
        now.getUTCMinutes(),
        0,
        0
      ));
    }

    if (!deviceIdsArr.length) {
      return jsonResponse(res, {
        company_id: Number(id),
        company_name: company.name,
        location_id: Number(locationId),
        location_name: location.location,
        date_range: { from: from.toISOString(), to: now.toISOString() },
        gallons_pumped: [],
        liquid_level: [],
        temperature_realtime: [],
        focus_main_pressure: []
      });
    }

    // Latest pump_settings per device for vol_per_cycle
    const latestSettings = await knex
      .with('latest_settings', (qb) => {
        qb.select(knex.raw('distinct on (device_id) device_id, vol_per_cycle, created_at'))
          .from('pump_settings')
          .whereIn('device_id', deviceIdsArr)
          .orderBy([{ column: 'device_id', order: 'asc' }, { column: 'created_at', order: 'desc' }]);
      })
      .select('*')
      .from('latest_settings');
    const vpcByDevice = latestSettings.reduce((acc, r) => { acc[r.device_id] = Number(r.vol_per_cycle || 0); return acc; }, {});

    const gran = bucket;

    // Gallons Pumped
    const gallonsBase = knex('pump_data as pd')
      .whereIn('pd.device_id', deviceIdsArr)
      .andWhere('pd.created_at', '>=', from.toISOString())
      .select('pd.device_id')
      .select(knex.raw('SUM(pd.volume_pumped) as sum_volume'))
      .select(knex.raw('SUM(pd.cycle_count) as sum_cycles'));

    if (gran !== 'total') {
      gallonsBase
        .select(knex.raw(`date_trunc('${gran}', pd.created_at) as day`))
        .groupBy('pd.device_id')
        .groupByRaw(`date_trunc('${gran}', pd.created_at)`)
        .orderBy([{ column: 'device_id', order: 'asc' }, { column: 'day', order: 'asc' }]);
    } else {
      gallonsBase.groupBy('pd.device_id').orderBy([{ column: 'device_id', order: 'asc' }]);
    }

    const gallonsRows = await gallonsBase;
    let gallons_pumped = gallonsRows.map(r => {
      const vol = Number(r.sum_volume || 0);
      const cycles = Number(r.sum_cycles || 0);
      const vpc = Number(vpcByDevice[r.device_id] || 0);
      const value = vol > 0 ? vol : (cycles * vpc);
      const out = {
        device_id: r.device_id,
        device_serial: deviceById[r.device_id]?.device_serial,
        value
      };
      if (gran !== 'total') out.date = toIso(r.day);
      return out;
    });

    // Liquid Level
    const levelBase = knex('pump_data as pd')
      .whereIn('pd.device_id', deviceIdsArr)
      .andWhere('pd.created_at', '>=', from.toISOString())
      .select('pd.device_id')
      .select(knex.raw(`AVG(pd.${levelField}) as avg_level`));

    if (gran !== 'total') {
      levelBase
        .select(knex.raw(`date_trunc('${gran}', pd.created_at) as day`))
        .groupBy('pd.device_id')
        .groupByRaw(`date_trunc('${gran}', pd.created_at)`)
        .orderBy([{ column: 'device_id', order: 'asc' }, { column: 'day', order: 'asc' }]);
    } else {
      levelBase.groupBy('pd.device_id').orderBy([{ column: 'device_id', order: 'asc' }]);
    }

    const levelRows = await levelBase;
    let liquid_level = levelRows.map(r => ({
      device_id: r.device_id,
      device_serial: deviceById[r.device_id]?.device_serial,
      ...(gran !== 'total' ? { date: toIso(r.day) } : {}),
      value: Number(r.avg_level || 0)
    }));

    // Focus Main Pressure
    const pressureBase = knex('pump_data as pd')
      .whereIn('pd.device_id', deviceIdsArr)
      .andWhere('pd.created_at', '>=', from.toISOString())
      .select('pd.device_id')
      .select(knex.raw(`AVG(pd.${pressureField}) as avg_pressure`));

    if (gran !== 'total') {
      pressureBase
        .select(knex.raw(`date_trunc('${gran}', pd.created_at) as day`))
        .groupBy('pd.device_id')
        .groupByRaw(`date_trunc('${gran}', pd.created_at)`)
        .orderBy([{ column: 'device_id', order: 'asc' }, { column: 'day', order: 'asc' }]);
    } else {
      pressureBase.groupBy('pd.device_id').orderBy([{ column: 'device_id', order: 'asc' }]);
    }

    const pressureRows = await pressureBase;
    let focus_main_pressure = pressureRows.map(r => ({
      device_id: r.device_id,
      device_serial: deviceById[r.device_id]?.device_serial,
      ...(gran !== 'total' ? { date: toIso(r.day) } : {}),
      value: Number(r.avg_pressure || 0)
    }));

    // Temperature (Real-time): latest sample per device in window
    const latestTempRows = await knex
      .with('latest_pd', (qb) => {
        qb.select(knex.raw('distinct on (device_id) device_id, created_at, ' + temperatureField + ' as temp'))
          .from('pump_data')
          .whereIn('device_id', deviceIdsArr)
          .andWhere('created_at', '>=', from.toISOString())
          .orderBy([{ column: 'device_id', order: 'asc' }, { column: 'created_at', order: 'desc' }]);
      })
      .select('*')
      .from('latest_pd')
      .orderBy('device_id', 'asc');

    let temperature_realtime = latestTempRows.map(r => ({
      device_id: r.device_id,
      device_serial: deviceById[r.device_id]?.device_serial,
      value: Number(r.temp || 0),
      measured_at: toIso(r.created_at)
    }));

    if (includeEmptyFlag && gran !== 'total') {
      const anchorIso =
        gallons_pumped[0]?.date ||
        liquid_level[0]?.date ||
        focus_main_pressure[0]?.date ||
        now.toISOString();

      const maxFillPoints = 400;
      const bucketIsoListRes = buildBucketIsoList({ from, to: now, anchorIso, maxPoints: maxFillPoints, bucket: gran });
      if (bucketIsoListRes?.tooLarge) {
        return jsonResponse(
          res,
          { error: 'Range too large for includeEmpty', maxPoints: maxFillPoints, requestedPoints: bucketIsoListRes.points },
          400
        );
      }
      const bucketIsoList = bucketIsoListRes?.list || [];
      gallons_pumped = fillBucketSeriesByDevice({ devices, series: gallons_pumped, bucketIsoList, defaultValue: 0 });
      liquid_level = fillBucketSeriesByDevice({ devices, series: liquid_level, bucketIsoList, defaultValue: 0 });
      focus_main_pressure = fillBucketSeriesByDevice({ devices, series: focus_main_pressure, bucketIsoList, defaultValue: 0 });

      const tempByDevice = new Set(temperature_realtime.map(r => r.device_id));
      for (const d of devices) {
        if (!tempByDevice.has(d.id)) {
          temperature_realtime.push({ device_id: d.id, device_serial: d.device_serial, value: 0, measured_at: null });
        }
      }
      temperature_realtime.sort((a, b) => Number(a.device_id) - Number(b.device_id));
    }

    if (includeEmptyFlag && gran === 'total') {
      const byId = (arr) => new Map((arr || []).map(r => [r.device_id, r]));
      const fillTotals = (arr) => {
        const m = byId(arr);
        return devices.map(d => m.get(d.id) || ({ device_id: d.id, device_serial: d.device_serial, value: 0 }));
      };
      gallons_pumped = fillTotals(gallons_pumped);
      liquid_level = fillTotals(liquid_level);
      focus_main_pressure = fillTotals(focus_main_pressure);

      const tempByDevice = new Map((temperature_realtime || []).map(r => [r.device_id, r]));
      temperature_realtime = devices.map(d => tempByDevice.get(d.id) || ({ device_id: d.id, device_serial: d.device_serial, value: 0, measured_at: null }));
    }

    if (!includeEmptyFlag) {
      const devicesWithAny = new Set([
        ...gallons_pumped.map(r => r.device_id),
        ...liquid_level.map(r => r.device_id),
        ...focus_main_pressure.map(r => r.device_id),
        ...temperature_realtime.map(r => r.device_id)
      ]);
      const filterAny = (arr) => arr.filter(r => devicesWithAny.has(r.device_id));
      gallons_pumped = filterAny(gallons_pumped);
      liquid_level = filterAny(liquid_level);
      focus_main_pressure = filterAny(focus_main_pressure);
      temperature_realtime = temperature_realtime.filter(r => devicesWithAny.has(r.device_id));
    }

    gallons_pumped = addBucketLabels({ series: gallons_pumped, bucket: gran, rangeStart: from });
    liquid_level = addBucketLabels({ series: liquid_level, bucket: gran, rangeStart: from });
    focus_main_pressure = addBucketLabels({ series: focus_main_pressure, bucket: gran, rangeStart: from });

    return jsonResponse(res, {
      company_id: Number(id),
      company_name: company.name,
      location_id: Number(locationId),
      location_name: location.location,
      date_range: { from: from.toISOString(), to: now.toISOString() },
      gallons_pumped,
      liquid_level,
      temperature_realtime,
      focus_main_pressure
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Failed to build company location overview', {
      companyId: id,
      locationId,
      days: daysValue,
      deviceIds: deviceIdsValue,
      includeEmpty,
      granularity: bucket,
      levelField,
      pressureField,
      temperatureField,
      error: e?.message,
      stack: e?.stack
    });
    return jsonResponse(res, { error: 'Failed to build company location overview' }, 500);
  }
}

// Company overview metrics for dashboard charts
export async function getCompanyOverview(req, res) {
  const { id } = req.params; // company id
  const {
    days,
    day,
    period,
    locationId,
    deviceIds,
    deviceId,
    includeEmpty = 'true',
    granularity,
    // Optional field overrides: defaults assume schema shown in screenshot
    levelField = 'cur_adc', // liquid level
    pressureField = 'high_adc', // focus main pressure
    temperatureField = 'cur_adc' // temperature
  } = req.query || {};

  const resolvePeriod = ({ period, daysValue, granularity }) => {
    const p = String(period || '').toLowerCase();
    const hasDays = daysValue !== undefined && daysValue !== null && String(daysValue).trim() !== '';
    const hasGran = granularity !== undefined && granularity !== null && String(granularity).trim() !== '';

    const rawGran = String(granularity || '').toLowerCase();
    const normalizedGran = rawGran === 'daily' ? 'day' : rawGran;

    // Defaults
    let outDays = hasDays ? daysValue : 7;
    let outBucket = hasGran ? normalizedGran : 'total';

    if (p === 'weekly') {
      if (!hasDays) outDays = 7;
      if (!hasGran) outBucket = 'day';
    } else if (p === 'monthly') {
      if (!hasDays) outDays = 30;
      if (!hasGran) outBucket = 'week';
    } else if (p === 'yearly') {
      if (!hasDays) outDays = 365;
      if (!hasGran) outBucket = 'month';
    }

    const allowed = new Set(['total', 'day', 'week', 'month']);
    if (!allowed.has(outBucket)) outBucket = 'total';

    return { daysValue: outDays, bucket: outBucket, hasDays };
  };

  const { daysValue, bucket, hasDays } = resolvePeriod({ period, daysValue: (days ?? day), granularity });
  const deviceIdsValue = deviceIds ?? deviceId;

  const includeEmptyFlag = ['1', 'true', 'yes'].includes(String(includeEmpty).toLowerCase());
  const toIso = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString();
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  };

  const allowedPumpDataFields = new Set([
    'cycle_count',
    'bad_cycles',
    'volume_pumped',
    'batt_voltage',
    'cur_adc',
    'high_adc'
  ]);

  const validateField = (field, paramName) => {
    const f = String(field || '').trim();
    if (!allowedPumpDataFields.has(f)) {
      return jsonResponse(
        res,
        {
          error: 'Invalid field',
          field: paramName,
          value: f,
          allowed: Array.from(allowedPumpDataFields)
        },
        400
      );
    }
    return null;
  };

  const buildBucketIsoList = ({ from, to, anchorIso, maxPoints, bucket }) => {
    const fromD = new Date(from);
    const toD = new Date(to);
    const anchor = new Date(anchorIso);
    if (Number.isNaN(fromD.getTime()) || Number.isNaN(toD.getTime()) || Number.isNaN(anchor.getTime())) return null;

    const align = (d) => {
      if (bucket === 'month') {
        return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, anchor.getUTCHours(), anchor.getUTCMinutes(), 0, 0));
      }
      if (bucket === 'week') {
        const wd = d.getUTCDay();
        const diff = (wd + 6) % 7;
        const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), anchor.getUTCHours(), anchor.getUTCMinutes(), 0, 0));
        monday.setUTCDate(monday.getUTCDate() - diff);
        return monday;
      }
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), anchor.getUTCHours(), anchor.getUTCMinutes(), 0, 0));
    };

    let cur = align(fromD);
    const end = align(toD);
    const list = [];
    while (cur.getTime() <= end.getTime()) {
      list.push(cur.toISOString());
      if (list.length > maxPoints) return { tooLarge: true, points: list.length };
      if (bucket === 'month') {
        cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1, cur.getUTCHours(), cur.getUTCMinutes(), 0, 0));
      } else if (bucket === 'week') {
        cur = new Date(cur.getTime() + 7 * 24 * 60 * 60 * 1000);
      } else {
        cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000);
      }
    }
    return { list, points: list.length };
  };

  const fillBucketSeriesByDevice = ({ devices, series, bucketIsoList, defaultValue = 0 }) => {
    const byDeviceByDay = new Map();
    for (const r of series || []) {
      if (!r || !r.device_id || !r.date) continue;
      if (!byDeviceByDay.has(r.device_id)) byDeviceByDay.set(r.device_id, new Map());
      byDeviceByDay.get(r.device_id).set(r.date, r);
    }

    const out = [];
    for (const d of devices) {
      const perDay = byDeviceByDay.get(d.id) || new Map();
      for (const iso of bucketIsoList) {
        const existing = perDay.get(iso);
        if (existing) {
          out.push(existing);
        } else {
          out.push({ device_id: d.id, device_serial: d.device_serial, date: iso, value: defaultValue });
        }
      }
    }
    return out;
  };

  const addBucketLabels = ({ series, bucket, rangeStart }) => {
    if (!Array.isArray(series)) return series;
    if (bucket !== 'day' && bucket !== 'week' && bucket !== 'month') return series;

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const startD = new Date(rangeStart);
    if (Number.isNaN(startD.getTime())) return series;

    const alignToMondayUtc = (d) => {
      const wd = d.getUTCDay();
      const diff = (wd + 6) % 7;
      const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
      monday.setUTCDate(monday.getUTCDate() - diff);
      return monday;
    };

    const weekZero = alignToMondayUtc(startD).getTime();
    const weekMs = 7 * 24 * 60 * 60 * 1000;

    return series.map((r) => {
      if (!r || !r.date) return r;
      const d = new Date(r.date);
      if (Number.isNaN(d.getTime())) return r;

      if (bucket === 'day') {
        return { ...r, label: d.toISOString().slice(0, 10) };
      }

      if (bucket === 'month') {
        const m = monthNames[d.getUTCMonth()] || '';
        const y = d.getUTCFullYear();
        return { ...r, label: `${m} ${y}`.trim() };
      }

      const monday = alignToMondayUtc(d).getTime();
      const idx = Math.floor((monday - weekZero) / weekMs) + 1;
      return { ...r, label: `Week ${idx}` };
    });
  };

  try {
    const levelFieldError = validateField(levelField, 'levelField');
    if (levelFieldError) return;
    const pressureFieldError = validateField(pressureField, 'pressureField');
    if (pressureFieldError) return;
    const temperatureFieldError = validateField(temperatureField, 'temperatureField');
    if (temperatureFieldError) return;

    const company = await knex('company').select('id','name').where({ id }).first();
    if (!company) return jsonResponse(res, { error: 'Not found' }, 404);

    // Resolve device list under company with optional filters
    const devBase = knex('device as d')
      .join('locations as l', 'l.id', 'd.location_id')
      .where('d.company_id', id)
      .andWhere(function(w){ w.where('l.deleted', false).orWhereNull('l.deleted'); });

    if (locationId) devBase.andWhere('d.location_id', locationId);
    if (deviceIdsValue) {
      const ids = String(deviceIdsValue).split(',').map(s => s.trim()).filter(Boolean);
      if (ids.length) devBase.whereIn('d.id', ids);
    }

    const devices = await devBase.select('d.id','d.device_serial','d.location_id').orderBy('d.device_serial','asc');
    const deviceIdsArr = devices.map(d => d.id);
    const deviceById = devices.reduce((acc,d)=>{ acc[d.id]=d; return acc; }, {});

    const now = new Date();
    let from = new Date(now.getTime() - Number(daysValue) * 24 * 60 * 60 * 1000);
    const p = String(period || '').toLowerCase();
    if (!hasDays && p === 'weekly') {
      // exactly 7 daily buckets (today + previous 6 days)
      from = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    }
    if (!hasDays && p === 'monthly') {
      from = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        1,
        now.getUTCHours(),
        now.getUTCMinutes(),
        0,
        0
      ));
    }
    if (!hasDays && p === 'yearly') {
      // exactly 12 month buckets: first day of the month 11 months ago
      from = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth() - 11,
        1,
        now.getUTCHours(),
        now.getUTCMinutes(),
        0,
        0
      ));
    }

    if (!deviceIdsArr.length) {
      return jsonResponse(res, {
        company_id: Number(id),
        company_name: company.name,
        date_range: { from: from.toISOString(), to: now.toISOString() },
        gallons_pumped: [],
        liquid_level: [],
        temperature_realtime: [],
        focus_main_pressure: []
      });
    }

    // Latest pump_settings per device for vol_per_cycle
    const latestSettings = await knex
      .with('latest_settings', (qb) => {
        qb.select(knex.raw('distinct on (device_id) device_id, vol_per_cycle, created_at'))
          .from('pump_settings')
          .orderBy([{ column: 'device_id', order: 'asc' }, { column: 'created_at', order: 'desc' }]);
      })
      .select('*')
      .from('latest_settings');
    const vpcByDevice = latestSettings.reduce((acc, r) => { acc[r.device_id] = Number(r.vol_per_cycle || 0); return acc; }, {});

    const gran = bucket;

    // Gallons Pumped
    const gallonsBase = knex('pump_data as pd')
      .whereIn('pd.device_id', deviceIdsArr)
      .andWhere('pd.created_at', '>=', from.toISOString())
      .select('pd.device_id')
      .select(knex.raw('SUM(pd.volume_pumped) as sum_volume'))
      .select(knex.raw('SUM(pd.cycle_count) as sum_cycles'));

    if (gran !== 'total') {
      gallonsBase
        .select(knex.raw(`date_trunc('${gran}', pd.created_at) as day`))
        .groupBy('pd.device_id')
        .groupByRaw(`date_trunc('${gran}', pd.created_at)`)
        .orderBy([{ column: 'device_id', order: 'asc' }, { column: 'day', order: 'asc' }]);
    } else {
      gallonsBase.groupBy('pd.device_id').orderBy([{ column: 'device_id', order: 'asc' }]);
    }

    const gallonsRows = await gallonsBase;

    let gallons_pumped = gallonsRows.map(r => {
      const vol = Number(r.sum_volume || 0);
      const cycles = Number(r.sum_cycles || 0);
      const vpc = Number(vpcByDevice[r.device_id] || 0);
      const value = vol > 0 ? vol : (cycles * vpc);
      const out = {
        device_id: r.device_id,
        device_serial: deviceById[r.device_id]?.device_serial,
        value
      };
      if (gran !== 'total') out.date = toIso(r.day);
      return out;
    });

    // Liquid Level
    const levelBase = knex('pump_data as pd')
      .whereIn('pd.device_id', deviceIdsArr)
      .andWhere('pd.created_at', '>=', from.toISOString())
      .select('pd.device_id')
      .select(knex.raw(`AVG(pd.${levelField}) as avg_level`));

    if (gran !== 'total') {
      levelBase
        .select(knex.raw(`date_trunc('${gran}', pd.created_at) as day`))
        .groupBy('pd.device_id')
        .groupByRaw(`date_trunc('${gran}', pd.created_at)`)
        .orderBy([{ column: 'device_id', order: 'asc' }, { column: 'day', order: 'asc' }]);
    } else {
      levelBase.groupBy('pd.device_id').orderBy([{ column: 'device_id', order: 'asc' }]);
    }

    const levelRows = await levelBase;

    let liquid_level = levelRows.map(r => ({
      device_id: r.device_id,
      device_serial: deviceById[r.device_id]?.device_serial,
      ...(gran !== 'total' ? { date: toIso(r.day) } : {}),
      value: Number(r.avg_level || 0)
    }));

    // Focus Main Pressure
    const pressureBase = knex('pump_data as pd')
      .whereIn('pd.device_id', deviceIdsArr)
      .andWhere('pd.created_at', '>=', from.toISOString())
      .select('pd.device_id')
      .select(knex.raw(`AVG(pd.${pressureField}) as avg_pressure`));

    if (gran !== 'total') {
      pressureBase
        .select(knex.raw(`date_trunc('${gran}', pd.created_at) as day`))
        .groupBy('pd.device_id')
        .groupByRaw(`date_trunc('${gran}', pd.created_at)`)
        .orderBy([{ column: 'device_id', order: 'asc' }, { column: 'day', order: 'asc' }]);
    } else {
      pressureBase.groupBy('pd.device_id').orderBy([{ column: 'device_id', order: 'asc' }]);
    }

    const pressureRows = await pressureBase;

    let focus_main_pressure = pressureRows.map(r => ({
      device_id: r.device_id,
      device_serial: deviceById[r.device_id]?.device_serial,
      ...(gran !== 'total' ? { date: toIso(r.day) } : {}),
      value: Number(r.avg_pressure || 0)
    }));

    // Temperature (Real-time): latest sample per device in window
    const latestTempRows = await knex
      .with('latest_pd', (qb) => {
        qb.select(knex.raw('distinct on (device_id) device_id, created_at, ' + temperatureField + ' as temp'))
          .from('pump_data')
          .whereIn('device_id', deviceIdsArr)
          .andWhere('created_at', '>=', from.toISOString())
          .orderBy([{ column: 'device_id', order: 'asc' }, { column: 'created_at', order: 'desc' }]);
      })
      .select('*')
      .from('latest_pd')
      .orderBy('device_id','asc');

    let temperature_realtime = latestTempRows.map(r => ({
      device_id: r.device_id,
      device_serial: deviceById[r.device_id]?.device_serial,
      value: Number(r.temp || 0),
      measured_at: toIso(r.created_at)
    }));

    if (includeEmptyFlag && gran !== 'total') {
      const anchorIso =
        gallons_pumped[0]?.date ||
        liquid_level[0]?.date ||
        focus_main_pressure[0]?.date ||
        now.toISOString();

      const maxFillPoints = 400;
      const bucketIsoListRes = buildBucketIsoList({ from, to: now, anchorIso, maxPoints: maxFillPoints, bucket: gran });
      if (bucketIsoListRes?.tooLarge) {
        return jsonResponse(
          res,
          { error: 'Range too large for includeEmpty', maxPoints: maxFillPoints, requestedPoints: bucketIsoListRes.points },
          400
        );
      }
      const bucketIsoList = bucketIsoListRes?.list || [];
      gallons_pumped = fillBucketSeriesByDevice({ devices, series: gallons_pumped, bucketIsoList, defaultValue: 0 });
      liquid_level = fillBucketSeriesByDevice({ devices, series: liquid_level, bucketIsoList, defaultValue: 0 });
      focus_main_pressure = fillBucketSeriesByDevice({ devices, series: focus_main_pressure, bucketIsoList, defaultValue: 0 });

      const tempByDevice = new Set(temperature_realtime.map(r => r.device_id));
      for (const d of devices) {
        if (!tempByDevice.has(d.id)) {
          temperature_realtime.push({ device_id: d.id, device_serial: d.device_serial, value: 0, measured_at: null });
        }
      }
      temperature_realtime.sort((a, b) => Number(a.device_id) - Number(b.device_id));
    }

    if (includeEmptyFlag && gran === 'total') {
      const byId = (arr) => new Map((arr || []).map(r => [r.device_id, r]));
      const fillTotals = (arr) => {
        const m = byId(arr);
        return devices.map(d => m.get(d.id) || ({ device_id: d.id, device_serial: d.device_serial, value: 0 }));
      };
      gallons_pumped = fillTotals(gallons_pumped);
      liquid_level = fillTotals(liquid_level);
      focus_main_pressure = fillTotals(focus_main_pressure);

      const tempByDevice = new Map((temperature_realtime || []).map(r => [r.device_id, r]));
      temperature_realtime = devices.map(d => tempByDevice.get(d.id) || ({ device_id: d.id, device_serial: d.device_serial, value: 0, measured_at: null }));
    }

    if (!includeEmptyFlag) {
      // Remove devices with no data points in the window
      const devicesWithAny = new Set([
        ...gallons_pumped.map(r=>r.device_id),
        ...liquid_level.map(r=>r.device_id),
        ...focus_main_pressure.map(r=>r.device_id),
        ...temperature_realtime.map(r=>r.device_id)
      ]);
      const filterAny = (arr) => arr.filter(r => devicesWithAny.has(r.device_id));
      gallons_pumped = filterAny(gallons_pumped);
      liquid_level = filterAny(liquid_level);
      focus_main_pressure = filterAny(focus_main_pressure);
      temperature_realtime = temperature_realtime.filter(r => devicesWithAny.has(r.device_id));
    }

    gallons_pumped = addBucketLabels({ series: gallons_pumped, bucket: gran, rangeStart: from });
    liquid_level = addBucketLabels({ series: liquid_level, bucket: gran, rangeStart: from });
    focus_main_pressure = addBucketLabels({ series: focus_main_pressure, bucket: gran, rangeStart: from });

    // Contract: company overview arrays should be keyed by device_serial with value only
    const toCompact = (arr) => (arr || []).map(r => ({ device_serial: r.device_serial, value: r.value }));

    return jsonResponse(res, {
      company_id: Number(id),
      company_name: company.name,
      date_range: { from: from.toISOString(), to: now.toISOString() },
      gallons_pumped: toCompact(gallons_pumped),
      liquid_level: toCompact(liquid_level),
      temperature_realtime: toCompact(temperature_realtime),
      focus_main_pressure: toCompact(focus_main_pressure)
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Failed to build company overview', {
      companyId: id,
      days: daysValue,
      locationId,
      deviceIds: deviceIdsValue,
      includeEmpty,
      period,
      granularity: bucket,
      levelField,
      pressureField,
      temperatureField,
      error: e?.message,
      stack: e?.stack
    });
    return jsonResponse(res, { error: 'Failed to build company overview' }, 500);
  }
}

// All companies with their sites and devices (nested)
export async function listAllCompaniesWithSitesDevices(req, res) {
  const { q, includeEmpty = 'false' } = req.query || {};
  const includeEmptyFlag = ['1', 'true', 'yes'].includes(String(includeEmpty).toLowerCase());
  try {
    const username = req.user?.username;
    const role = String(req.user?.role || '').toLowerCase();
    const isAdmin = role === 'admin';

    // Non-admin users should only see their assigned site (auth_users.site_id)
    let userSiteId = null;
    if (!isAdmin && username) {
      const u = await knex('auth_users').select('site_id').where({ username }).first();
      userSiteId = u?.site_id ?? null;
    }

    if (!isAdmin && userSiteId == null) {
      return jsonResponse(res, { data: [] });
    }

    // Companies (not deleted)
    let companiesQuery = knex('company as c')
      .select('c.id', 'c.name')
      .where((w) => w.where('c.deleted', false).orWhereNull('c.deleted'));

    if (!isAdmin && userSiteId != null) {
      const loc = await knex('locations as l').select('l.comp_id').where('l.id', userSiteId).first();
      if (loc?.comp_id != null) companiesQuery = companiesQuery.where('c.id', loc.comp_id);
      else companiesQuery = companiesQuery.whereRaw('1=0');
    }

    const companies = await companiesQuery.orderBy('c.name', 'asc');

    if (!companies.length) return jsonResponse(res, { data: [] });

    const companyIds = companies.map(c => c.id);
    // Locations per company
    const locations = await knex('locations as l')
      .whereIn('l.comp_id', companyIds)
      .modify((qb) => {
        if (!isAdmin && userSiteId != null) qb.andWhere('l.id', userSiteId);
      })
      .andWhere((w) => w.where('l.deleted', false).orWhereNull('l.deleted'))
      .select('l.*');

    const locIds = locations.map(l => l.id);

    const now = new Date();
    const from24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Aggregate last 24h metrics per site (location)
    let metrics24hByLoc = {};
    let latestReadingByLoc = {};
    if (locIds.length) {
      const rows24h = await knex('pump_data as pd')
        .join('device as d', 'd.id', 'pd.device_id')
        .whereIn('d.location_id', locIds)
        .andWhere('pd.created_at', '>=', from24h.toISOString())
        .groupBy('d.location_id')
        .select(
          'd.location_id',
          knex.raw('COALESCE(SUM(pd.volume_pumped), 0)::float as pumped_last_24h_gal'),
          knex.raw('COALESCE(SUM(pd.bad_cycles), 0)::int as timeouts_last_24h')
        );

      metrics24hByLoc = (rows24h || []).reduce((acc, r) => {
        acc[r.location_id] = {
          pumped_last_24h_gal: Number(r.pumped_last_24h_gal || 0),
          timeouts_last_24h: Number(r.timeouts_last_24h || 0)
        };
        return acc;
      }, {});

      // Latest reading per site (location) across all its devices
      // Assumption: temperature_f from cur_adc, vacuum_inwc from high_adc
      const latestRows = await knex('pump_data as pd')
        .join('device as d', 'd.id', 'pd.device_id')
        .whereIn('d.location_id', locIds)
        .select(
          knex.raw('distinct on (d.location_id) d.location_id as location_id'),
          'pd.created_at',
          'pd.cur_adc',
          'pd.high_adc'
        )
        .orderBy([
          { column: 'd.location_id', order: 'asc' },
          { column: 'pd.created_at', order: 'desc' }
        ]);

      latestReadingByLoc = (latestRows || []).reduce((acc, r) => {
        acc[r.location_id] = {
          temperature_f: r.cur_adc === null || r.cur_adc === undefined ? null : Number(r.cur_adc),
          vacuum_inwc: r.high_adc === null || r.high_adc === undefined ? null : Number(r.high_adc),
          as_of: r.created_at ? new Date(r.created_at).toISOString() : null
        };
        return acc;
      }, {});
    }

    // Devices for these locations (respect company match)
    let devices = [];
    if (locIds.length) {
      devices = await knex('device as d')
        .whereIn('d.location_id', locIds)
        .whereIn('d.company_id', companyIds)
        .select('d.*')
        .orderBy('d.device_serial', 'asc');
    }

    // Option A: filter out malformed/empty device entries before grouping
    devices = (devices || []).filter((d) => d && d.id && d.device_serial);

    // Group devices by location
    const devicesByLoc = devices.reduce((acc, d) => {
      if (!acc[d.location_id]) acc[d.location_id] = [];
      acc[d.location_id].push(d);
      return acc;
    }, {});

    const toGeoString = (g) => {
      if (!g) return null;
      if (typeof g === 'string') return g;
      if (Array.isArray(g) && g.length >= 2) return `(${g[0]},${g[1]})`;
      if (typeof g === 'object') {
        if (g.x !== undefined && g.y !== undefined) return `(${g.x},${g.y})`;
        if (g.longitude !== undefined && g.latitude !== undefined) return `(${g.longitude},${g.latitude})`;
        if (Array.isArray(g.coordinates) && g.coordinates.length >= 2) return `(${g.coordinates[0]},${g.coordinates[1]})`;
      }
      return null;
    };

    const toGeoArray = (g) => {
      if (!g) return null;
      if (Array.isArray(g) && g.length >= 2) return [Number(g[0]), Number(g[1])];
      if (typeof g === 'string') {
        const m = g.match(/\((-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)/);
        if (m) return [Number(m[1]), Number(m[2])];
        return null;
      }
      if (typeof g === 'object') {
        if (g.x !== undefined && g.y !== undefined) return [Number(g.x), Number(g.y)];
        if (g.longitude !== undefined && g.latitude !== undefined) return [Number(g.longitude), Number(g.latitude)];
        if (Array.isArray(g.coordinates) && g.coordinates.length >= 2) return [Number(g.coordinates[0]), Number(g.coordinates[1])];
      }
      return null;
    };

    const locToGeoString = (l) => {
      // Primary: geolocation column
      const direct = toGeoString(l?.geolocation);
      if (direct) return direct;
      // Fallbacks: separate lng/lat fields with common aliases
      const lng = l?.lng ?? l?.long ?? l?.lon ?? l?.longitude;
      const lat = l?.lat ?? l?.latitude;
      if (lng !== undefined && lat !== undefined) return `(${lng},${lat})`;
      // Fallback: geojson column
      if (l?.geojson) {
        const gj = typeof l.geojson === 'string' ? (()=>{ try { return JSON.parse(l.geojson); } catch { return null; } })() : l.geojson;
        const s = toGeoString(gj);
        if (s) return s;
      }
      return null;
    };

    const devToGeoString = (d) => {
      const direct = toGeoString(d?.geolocation);
      if (direct) return direct;
      const lng = d?.lng ?? d?.long ?? d?.lon ?? d?.longitude;
      const lat = d?.lat ?? d?.latitude;
      if (lng !== undefined && lat !== undefined) return `(${lng},${lat})`;
      if (d?.geojson) {
        const gj = typeof d.geojson === 'string' ? (()=>{ try { return JSON.parse(d.geojson); } catch { return null; } })() : d.geojson;
        const s = toGeoString(gj);
        if (s) return s;
      }
      return null;
    };

    const locToGeoArray = (l) => {
      const direct = toGeoArray(l?.geolocation) || toGeoArray(l?.geojson);
      if (direct) return direct;
      const lng = l?.lng ?? l?.long ?? l?.lon ?? l?.longitude;
      const lat = l?.lat ?? l?.latitude;
      if (lng !== undefined && lat !== undefined) return [Number(lng), Number(lat)];
      if (l?.geojson) {
        const gj = typeof l.geojson === 'string' ? (()=>{ try { return JSON.parse(l.geojson); } catch { return null; } })() : l.geojson;
        const arr = toGeoArray(gj);
        if (arr) return arr;
      }
      return null;
    };

    const devToGeoArray = (d) => {
      const direct = toGeoArray(d?.geolocation) || toGeoArray(d?.geojson);
      if (direct) return direct;
      const lng = d?.lng ?? d?.long ?? d?.lon ?? d?.longitude;
      const lat = d?.lat ?? d?.latitude;
      if (lng !== undefined && lat !== undefined) return [Number(lng), Number(lat)];
      if (d?.geojson) {
        const gj = typeof d.geojson === 'string' ? (()=>{ try { return JSON.parse(d.geojson); } catch { return null; } })() : d.geojson;
        const arr = toGeoArray(gj);
        if (arr) return arr;
      }
      return null;
    };

    // Group sites by company
    const sitesByCompany = locations.reduce((acc, l) => {
      const m24 = metrics24hByLoc[l.id] || { pumped_last_24h_gal: 0, timeouts_last_24h: 0 };
      const latest = latestReadingByLoc[l.id] || { temperature_f: null, vacuum_inwc: null, as_of: null };
      const site = {
        location_id: l.id,
        site_name: l.location || '',
        address: l.address,
        city: l.city,
        state: l.state,
        zip: l.zip,
        well_id: l.well_id,
        geolocation: locToGeoArray(l),
        total_pumps: (devicesByLoc[l.id]?.length) || 0,
        metrics: {
          pumped_last_24h_gal: m24.pumped_last_24h_gal,
          timeouts_last_24h: m24.timeouts_last_24h,
          temperature_f: latest.temperature_f,
          vacuum_inwc: latest.vacuum_inwc,
          as_of: latest.as_of
        },
        devices: (devicesByLoc[l.id] || []).map(d => {
          const siteGeo = locToGeoArray(l);
          const devGeo = devToGeoArray(d);
          return { ...d, geolocation: siteGeo || devGeo };
        })
      };
      if (!includeEmptyFlag && site.total_pumps === 0) return acc; // skip empty sites if requested
      if (!acc[l.comp_id]) acc[l.comp_id] = [];
      acc[l.comp_id].push(site);
      return acc;
    }, {});

    // Build final list and apply optional q filter
    let data = companies.map(c => ({
      company_id: c.id,
      company_name: c.name,
      sites: sitesByCompany[c.id] || []
    }));

    // If includeEmpty is false, drop companies that have no remaining sites
    if (!includeEmptyFlag) {
      data = data.filter(item => (item.sites && item.sites.length > 0));
    }

    if (q) {
      const term = String(q).toLowerCase();
      data = data.filter(item => {
        if (item.company_name?.toLowerCase().includes(term)) return true;
        return item.sites?.some(s => (s.site_name || '').toLowerCase().includes(term));
      });
    }

    return jsonResponse(res, { data });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('listAllCompaniesWithSitesDevices error:', e?.message, e?.stack);
    return jsonResponse(res, { error: 'Failed to list companies with sites and devices' }, 500);
  }
}

// Company sites with devices: returns all locations (not deleted) for a company
// with devices array and total_pumps for each site. Intended for sidebar/menu.
export async function listCompanySitesWithDevices(req, res) {
  const { id } = req.params; // company id
  try {
    const company = await knex('company').select('id','name').where({ id }).first();
    if (!company) return jsonResponse(res, { error: 'Not found' }, 404);
    // Fetch locations for company
    const locations = await knex('locations as l')
      .where('l.comp_id', id)
      .andWhere(function(w){ w.where('l.deleted', false).orWhereNull('l.deleted'); })
      .select('l.id', 'l.location', 'l.address', 'l.city', 'l.state', 'l.zip', 'l.well_id', 'l.geolocation')
      .orderBy([{ column: 'l.location', order: 'asc' }, { column: 'l.id', order: 'asc' }]);

    const locIds = locations.map(l => l.id);
    let devicesByLoc = {};
    if (locIds.length) {
      const devs = await knex('device as d')
        .whereIn('d.location_id', locIds)
        .andWhere('d.company_id', id)
        .select('d.id', 'd.device_serial', 'd.product', 'd.description', 'd.well_id', 'd.location_id')
        .orderBy('d.device_serial', 'asc');
      devicesByLoc = devs.reduce((acc, d) => {
        if (!acc[d.location_id]) acc[d.location_id] = [];
        acc[d.location_id].push(d);
        return acc;
      }, {});
    }

    const data = locations.map(l => ({
      location_id: l.id,
      site_name: l.location || '',
      address: l.address,
      city: l.city,
      state: l.state,
      zip: l.zip,
      well_id: l.well_id,
      geolocation: l.geolocation,
      total_pumps: (devicesByLoc[l.id]?.length) || 0,
      devices: devicesByLoc[l.id] || []
    }));

    return jsonResponse(res, { company_id: Number(id), company_name: company.name, sites: data });
  } catch (e) {
    return jsonResponse(res, { error: 'Failed to list company sites with devices' }, 500);
  }
}

export async function create(req, res) {
  try {
    const [row] = await knex('company').insert(req.body).returning('*');
    return jsonResponse(res, row || req.body, 201);
  } catch (e) {
    return jsonResponse(res, { error: 'Failed to create company' }, 500);
  }
}

export async function get(req, res) {
  const { id } = req.params;
  try {
    const row = await knex('company').where({ id }).first();
    if (!row) return jsonResponse(res, { error: 'Not found' }, 404);
    return jsonResponse(res, row);
  } catch (e) {
    return jsonResponse(res, { error: 'Failed to get company' }, 500);
  }
}

export async function update(req, res) {
  const { id } = req.params;
  try {
    const [row] = await knex('company').where({ id }).update(req.body).returning('*');
    if (!row) return jsonResponse(res, { error: 'Not found' }, 404);
    return jsonResponse(res, row);
  } catch (e) {
    return jsonResponse(res, { error: 'Failed to update company' }, 500);
  }
}

export async function remove(req, res) {
  const { id } = req.params;
  try {
    const count = await knex('company').where({ id }).del();
    if (!count) return jsonResponse(res, { error: 'Not found' }, 404);
    return jsonResponse(res, { success: true });
  } catch (e) {
    return jsonResponse(res, { error: 'Failed to delete company' }, 500);
  }
}

export async function listCompanyLocations(req, res) {
  const { id } = req.params;
  const { page, pageSize, offset, limit } = parsePagination(req.query);
  try {
    const filters = (qb) => {
      qb.where('l.comp_id', id);
      qb.where((w) => w.where('l.deleted', false).orWhereNull('l.deleted'));
    };

    const base = knex('locations as l')
      .leftJoin('device as d', function() {
        this.on('d.location_id', '=', 'l.id').andOn('d.company_id', '=', 'l.comp_id');
      })
      .modify(filters)
      .groupBy('l.id');

    const totalRow = await knex('locations as l').modify(filters).countDistinct({ cnt: 'l.id' }).first();

    const rows = await base
      .select('l.*')
      .select(knex.raw('COUNT(d.id) as total_pumps'))
      .orderBy('l.id', 'asc')
      .limit(limit)
      .offset(offset);

    return jsonResponse(res, { data: rows, meta: buildMeta({ page, pageSize, total: Number(totalRow?.cnt || 0) }) });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('listCompanyLocations error:', e.message || e);
    return jsonResponse(res, { error: 'Failed to list company locations' }, 500);
  }
}
