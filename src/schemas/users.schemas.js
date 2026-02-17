import { z } from 'zod';

export const listUsersQuery = z.object({
  q: z.string().optional(),
  role: z.string().optional(),
  site_id: z.coerce.number().int().positive().optional(),
  page: z.string().optional(),
  pageSize: z.string().optional()
});

export const userIdParam = z.object({ id: z.coerce.number().int().positive() });

export const createUserBody = z.object({
  username: z.string().min(1),
  email: z.string().email(),
  fullName: z.string().optional(),
  role: z.string().min(1),
  site_id: z.coerce.number().int().positive().optional().nullable(),
  password: z.string().min(1).optional()
});

export const updateUserBody = z.object({
  username: z.string().min(1).optional(),
  email: z.string().email().optional(),
  fullName: z.string().optional(),
  role: z.string().min(1).optional(),
  site_id: z.coerce.number().int().positive().optional().nullable(),
  is_active: z.boolean().optional(),
  password: z.string().min(1).optional()
});
