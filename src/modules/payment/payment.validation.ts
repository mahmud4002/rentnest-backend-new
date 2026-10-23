import { z } from 'zod';
import { idSchema, msg, paginationQuery } from '../../utils/zod';

export const createPaymentBody = z.object({
  rentalRequestId: idSchema('rentalRequestId'),
});

/** Verify a payment by its Stripe Checkout session id (returned by /create) or by our own payment id. */
export const confirmPaymentBody = z
  .object({
    sessionId: z.string(msg('sessionId', 'a string')).trim().min(1, 'sessionId cannot be empty').optional(),
    paymentId: idSchema('paymentId').optional(),
  })
  .refine((v) => Boolean(v.sessionId || v.paymentId), {
    message: 'Provide either sessionId or paymentId',
    path: ['sessionId'],
  });

export const listPaymentsQuery = paginationQuery.extend({
  status: z.enum(['PENDING', 'COMPLETED', 'FAILED'], msg('status', 'PENDING, COMPLETED or FAILED')).optional(),
  provider: z.enum(['STRIPE', 'SSLCOMMERZ'], msg('provider', 'STRIPE or SSLCOMMERZ')).optional(),
});

/** Stripe redirects the browser here after a successful checkout (?session_id=cs_...). */
export const successQuery = z.object({
  session_id: z.string(msg('session_id', 'a string')).trim().min(1, 'session_id is required'),
});

export const cancelQuery = z.object({
  payment_id: idSchema('payment_id').optional(),
});

export type ConfirmPaymentInput = z.infer<typeof confirmPaymentBody>;
export type ListPaymentsQuery = z.infer<typeof listPaymentsQuery>;
