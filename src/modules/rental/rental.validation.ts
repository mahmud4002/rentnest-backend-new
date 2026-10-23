import { z } from 'zod';
import { idSchema, msg, paginationQuery } from '../../utils/zod';

const startOfTodayUtc = () => {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
};

const dateString = (label: string) =>
  z
    .string(msg(label, 'a date string such as 2026-11-01'))
    .refine((value) => !Number.isNaN(Date.parse(value)), `${label} must be a valid date such as 2026-11-01`)
    .transform((value) => new Date(value));

export const createRentalBody = z.object({
  propertyId: idSchema('propertyId'),
  moveInDate: dateString('moveInDate').refine((d) => d.getTime() >= startOfTodayUtc(), 'moveInDate cannot be in the past'),
  durationMonths: z.coerce
    .number(msg('durationMonths', 'a number'))
    .int('durationMonths must be a whole number')
    .min(1, 'durationMonths must be at least 1')
    .max(36, 'durationMonths cannot exceed 36'),
  message: z.string(msg('message', 'a string')).trim().max(1000, 'message must be at most 1000 characters').optional(),
});

export const rentalStatusEnum = z.enum(
  ['PENDING', 'APPROVED', 'REJECTED', 'ACTIVE', 'COMPLETED', 'CANCELLED'],
  msg('status', 'one of PENDING, APPROVED, REJECTED, ACTIVE, COMPLETED, CANCELLED'),
);

export const listRentalsQuery = paginationQuery.extend({
  status: rentalStatusEnum.optional(),
  propertyId: idSchema('propertyId').optional(),
});

/** What a landlord may do to a request: answer a PENDING one, or close an ACTIVE one. */
export const respondBody = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'COMPLETED'], msg('status', 'APPROVED, REJECTED or COMPLETED')),
  landlordNote: z.string(msg('landlordNote', 'a string')).trim().max(500, 'landlordNote must be at most 500 characters').optional(),
});

export type CreateRentalInput = z.infer<typeof createRentalBody>;
export type ListRentalsQuery = z.infer<typeof listRentalsQuery>;
export type RespondInput = z.infer<typeof respondBody>;
