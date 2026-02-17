import { z } from 'zod';

export const listDevicesQuery = z.object({
  company_id: z.string().regex(/^\d+$/).transform(Number).optional(),
  location_id: z.string().regex(/^\d+$/).transform(Number).optional(),
  q: z.string().optional(),
  sort: z.enum(['id', 'device_serial', 'product', 'company_id', 'location_id', 'mfg_date']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  pageSize: z.string().regex(/^\d+$/).transform(Number).optional()
});

export const createDeviceBody = z.object({
  product: z.string().optional().default(''),
  device_serial: z.string().min(1),
  mfg_date: z.string().optional().nullable(),
  board: z.string().optional().default(''),
  description: z.string().optional().default(''),
  sw_rev: z.string().optional().default(''),
  location_id: z.number().int().optional(),
  company_id: z.number().int().optional()
});

export const updateDeviceBody = createDeviceBody.partial();

export const deviceIdParam = z.object({
  id: z.string().regex(/^\d+$/).transform(Number)
});

export const deviceSerialParam = z.object({
  deviceSerial: z.string().min(1)
});

export const deviceSettingIdParam = z.object({
  settingId: z.string().regex(/^\d+$/).transform(Number)
});

export const deviceSerialSettingIdParam = deviceSerialParam.merge(deviceSettingIdParam);

export const deviceOverviewQuery = z.object({
  days: z
    .union([z.string().regex(/^\d+$/).transform(Number), z.number()])
    .optional()
    .transform((v) => (v == null ? undefined : Number(v)))
    .refine((v) => v === undefined || [1, 7, 30, 365].includes(v), {
      message: 'days must be one of 1,7,30,365'
    })
});

export const deviceRangePagedQuery = z.object({
  range: z.enum(['24h', '7d', '30d']).optional().default('24h'),
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  pageSize: z.string().regex(/^\d+$/).transform(Number).optional()
});

export const updateDeviceSettingBody = z.object({
  threshold: z.number().int().optional(),
  airOnTime: z.number().int().optional(),
  airTimeout: z.number().int().optional(),
  delay: z.number().int().optional(),
  applyToAll: z.boolean().optional()
});
