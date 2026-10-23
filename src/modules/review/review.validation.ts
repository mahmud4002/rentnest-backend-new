import { z } from 'zod';
import { idSchema, msg, paginationQuery } from '../../utils/zod';

export const createReviewBody = z.object({
  rentalRequestId: idSchema('rentalRequestId'),
  rating: z.coerce
    .number(msg('rating', 'a number'))
    .int('rating must be a whole number')
    .min(1, 'rating must be at least 1')
    .max(5, 'rating cannot exceed 5'),
  comment: z
    .string(msg('comment', 'a string'))
    .trim()
    .min(5, 'comment must be at least 5 characters')
    .max(1000, 'comment must be at most 1000 characters'),
});

export const listReviewsQuery = paginationQuery.extend({
  propertyId: idSchema('propertyId').optional(),
});

export type CreateReviewInput = z.infer<typeof createReviewBody>;
export type ListReviewsQuery = z.infer<typeof listReviewsQuery>;
