import { z } from 'zod';

export const listLocationsQuery = z.object({
  company_id: z.coerce.number().int().positive().optional(),
  q: z.string().optional(),
  page: z.string().optional(),
  pageSize: z.string().optional(),
  sort: z.enum(['location', 'created_at']).optional(),
  order: z.enum(['asc', 'desc']).optional()
});

export const createLocationBody = z.object({
  comp_id: z.coerce.number().int().positive(),
  location: z.string().min(1),
  address: z.string().optional().default(''),
  city: z.string().optional().default(''),
  state: z.string().optional().default(''),
  zip: z.string().optional().default(''),
  deleted: z.boolean().optional().default(false)
});

export const updateLocationBody = z.object({
  comp_id: z.coerce.number().int().positive().optional(),
  location: z.string().min(1).optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  deleted: z.boolean().optional()
});

export const locationIdParam = z.object({ id: z.coerce.number().int().positive() });

export const createWithDevicesBody = z.object({
  comp_id: z.coerce.number().int().positive(),
  location: z.string().min(1),
  address: z.string().optional().default(''),
  city: z.string().optional().default(''),
  state: z.string().optional().default(''),
  zip: z.string().optional().default(''),
  devices: z.array(
    z.object({
      product: z.string().optional().default(''),
      device_serial: z.string().min(1),
      description: z.string().optional().default(''),
      mfg_date: z.string().optional().default(''),
      board: z.string().optional().default(''),
      sw_rev: z.string().optional().default(''),
      company_id: z.coerce.number().int().positive().optional(),
      well_id: z.coerce.number().int().positive().optional(),
    })
  ).min(1)
});

export const updateWithDevicesBody = z.object({
  comp_id: z.coerce.number().int().positive().optional(),
  location: z.string().min(1).optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  devices: z.array(
    z.object({
      id: z.coerce.number().int().positive().optional(),
      product: z.string().optional(),
      device_serial: z.string().min(1),
      description: z.string().optional(),
      mfg_date: z.string().optional(),
      board: z.string().optional(),
      sw_rev: z.string().optional(),
      company_id: z.coerce.number().int().positive().optional(),
      well_id: z.coerce.number().int().positive().optional()
    })
  ).optional(),
  deleteDeviceIds: z.array(z.coerce.number().int().positive()).optional()
});
