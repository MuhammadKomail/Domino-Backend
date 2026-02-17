import { z } from 'zod';

export const roleIdParamSchema = z.object({
  id: z.string().min(1)
});

export const roleCreateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().default(''),
  allowed_tables: z.array(z.string()).optional().default([]),
  allowed_routes: z.array(z.string()).optional().default([])
});

export const roleUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  allowed_tables: z.array(z.string()).optional(),
  allowed_routes: z.array(z.string()).optional()
});
