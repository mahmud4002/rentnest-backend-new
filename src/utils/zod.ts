import { z } from 'zod';

/** Friendly "x is required" / "x must be ..." messages instead of zod's technical defaults. */
export const msg = (label: string, expected: string) => ({
  error: (issue: { input?: unknown }) =>
    issue.input === undefined ? `${label} is required` : `${label} must be ${expected}`,
});

export const idSchema = (label = 'id') => z.uuid(msg(label, 'a valid UUID'));

export const idParams = z.object({ id: idSchema('id') });

/** ?page=2&limit=20 (limit is capped so nobody can ask for the whole table). */
export const paginationQuery = z.object({
  page: z.coerce.number(msg('page', 'a number')).int().min(1, 'page must be at least 1').default(1),
  limit: z.coerce
    .number(msg('limit', 'a number'))
    .int()
    .min(1, 'limit must be at least 1')
    .max(100, 'limit cannot exceed 100')
    .default(10),
});

/** Money as a positive number with max two decimals. */
export const moneySchema = (label: string) =>
  z.coerce
    .number(msg(label, 'a number'))
    .positive(`${label} must be greater than 0`)
    .max(1_000_000_000, `${label} is too large`)
    .refine((n) => Number.isInteger(Number((n * 100).toFixed(6))), `${label} can have at most 2 decimal places`);

export const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);
