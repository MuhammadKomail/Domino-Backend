import { z } from 'zod';

export const tableParamSchema = z.object({
  name: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/)
});

export const insertSchema = z.object({
  data: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).refine(v => Object.keys(v).length > 0, 'data must have at least one field')
});

export const updateSchema = z.object({
  data: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).refine(v => Object.keys(v).length > 0, 'data must have at least one field'),
  where: z.record(z.union([z.string(), z.number(), z.boolean()])).refine(v => Object.keys(v).length > 0, 'where must have at least one condition')
});

export const deleteSchema = z.object({
  where: z.record(z.union([z.string(), z.number(), z.boolean()])).refine(v => Object.keys(v).length > 0, 'where must have at least one condition')
});
