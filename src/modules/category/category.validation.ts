import { z } from 'zod';
import { msg } from '../../utils/zod';

export const createCategoryBody = z.object({
  name: z
    .string(msg('Name', 'a string'))
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(50, 'Name must be at most 50 characters'),
  description: z.string(msg('Description', 'a string')).trim().max(300, 'Description must be at most 300 characters').optional(),
});

export const updateCategoryBody = createCategoryBody
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one field to update' });

export type CreateCategoryInput = z.infer<typeof createCategoryBody>;
export type UpdateCategoryInput = z.infer<typeof updateCategoryBody>;
