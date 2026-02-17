import { z } from 'zod';

export const listCompaniesQuery = z.object({
  q: z.string().optional(),
  page: z.string().optional(),
  pageSize: z.string().optional(),
  sort: z.enum(['name', 'created_at']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  deleted: z.coerce.boolean().optional()
});

export const createCompanyBody = z.object({
  name: z.string().min(1),
  address: z.string().optional().default(''),
  city: z.string().optional().default(''),
  state: z.string().optional().default(''),
  zip: z.string().optional().default(''),
  deleted: z.boolean().optional().default(false)
});

export const updateCompanyBody = z.object({
  name: z.string().min(1).optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  deleted: z.boolean().optional()
});

export const companyIdParam = z.object({ id: z.coerce.number().int().positive() });

export const companyLocationIdParam = z.object({
  id: z.coerce.number().int().positive(),
  locationId: z.coerce.number().int().positive()
});
