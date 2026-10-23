import { z } from 'zod';
import { idSchema, moneySchema, msg, paginationQuery } from '../../utils/zod';

const text = (label: string, min: number, max: number) =>
  z
    .string(msg(label, 'a string'))
    .trim()
    .min(min, `${label} must be at least ${min} characters`)
    .max(max, `${label} must be at most ${max} characters`);

const count = (label: string, min = 0, max = 50) =>
  z.coerce
    .number(msg(label, 'a number'))
    .int(`${label} must be a whole number`)
    .min(min, `${label} must be at least ${min}`)
    .max(max, `${label} must be at most ${max}`);

/** Fields a landlord can set on a listing. Defaults live in the Prisma schema so that PUT never resets values by accident. */
const propertyFields = z.object({
  title: text('Title', 5, 150),
  description: text('Description', 20, 5000),
  address: text('Address', 5, 255),
  city: text('City', 2, 100),
  price: moneySchema('Price'),
  bedrooms: count('Bedrooms').optional(),
  bathrooms: count('Bathrooms').optional(),
  areaSqft: count('Area', 1, 1_000_000).optional(),
  amenities: z
    .array(text('Amenity', 1, 40), msg('Amenities', 'an array of strings'))
    .max(30, 'At most 30 amenities are allowed')
    .optional(),
  images: z
    .array(z.url('Each image must be a valid URL'), msg('Images', 'an array of URLs'))
    .max(10, 'At most 10 images are allowed')
    .optional(),
  categoryId: idSchema('categoryId'),
});

export const availabilityStatus = z.enum(['AVAILABLE', 'UNAVAILABLE'], msg('Status', 'either AVAILABLE or UNAVAILABLE'));

export const createPropertyBody = propertyFields.extend({ status: availabilityStatus.optional() });

export const updatePropertyBody = propertyFields
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one field to update' });

export const setAvailabilityBody = z.object({ status: availabilityStatus });

const listBase = paginationQuery.extend({
  search: z.string().trim().max(100).optional(),
  location: z.string().trim().max(100).optional(),
  type: z.string().trim().max(50).optional(),
  categoryId: idSchema('categoryId').optional(),
  amenities: z.string().trim().max(300).optional(),
  minPrice: z.coerce.number(msg('minPrice', 'a number')).min(0, 'minPrice cannot be negative').optional(),
  maxPrice: z.coerce.number(msg('maxPrice', 'a number')).min(0, 'maxPrice cannot be negative').optional(),
  bedrooms: z.coerce.number(msg('bedrooms', 'a number')).int().min(0).optional(),
  bathrooms: z.coerce.number(msg('bathrooms', 'a number')).int().min(0).optional(),
  sortBy: z.enum(['createdAt', 'price', 'bedrooms'], msg('sortBy', 'one of createdAt, price, bedrooms')).default('createdAt'),
  order: z.enum(['asc', 'desc'], msg('order', 'asc or desc')).default('desc'),
});

const priceRange = (q: { minPrice?: number; maxPrice?: number }) =>
  q.minPrice === undefined || q.maxPrice === undefined || q.minPrice <= q.maxPrice;
const priceRangeIssue = { message: 'minPrice cannot be greater than maxPrice', path: ['minPrice'] };

/** Public browsing: only AVAILABLE listings are ever returned. */
export const listPropertiesQuery = listBase.refine(priceRange, priceRangeIssue);

/** Landlord / admin lists may also filter by status. */
export const managedPropertiesQuery = listBase
  .extend({ status: z.enum(['AVAILABLE', 'RENTED', 'UNAVAILABLE'], msg('status', 'AVAILABLE, RENTED or UNAVAILABLE')).optional() })
  .refine(priceRange, priceRangeIssue);

export type CreatePropertyInput = z.infer<typeof createPropertyBody>;
export type UpdatePropertyInput = z.infer<typeof updatePropertyBody>;
export type ListPropertiesQuery = z.infer<typeof managedPropertiesQuery>;
