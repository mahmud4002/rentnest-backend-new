import { randomBytes } from 'node:crypto';
import type { Payment, Prisma } from '@prisma/client';
import { env } from '../../config';
import { getStripe, type StripeCheckoutSession } from '../../lib/stripe';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { buildMeta, toPagination } from '../../utils/pagination';
import type { ConfirmPaymentInput, ListPaymentsQuery } from './payment.validation';

const paymentInclude = {
  rentalRequest: {
    select: {
      id: true,
      status: true,
      durationMonths: true,
      moveInDate: true,
      property: { select: { id: true, title: true, city: true, landlordId: true } },
    },
  },
} satisfies Prisma.PaymentInclude;

const generateTransactionId = () => `RN-${Date.now().toString(36).toUpperCase()}-${randomBytes(4).toString('hex').toUpperCase()}`;

const toMinorUnits = (amount: Prisma.Decimal | number | string) => Math.round(Number(amount) * 100);

/* -------------------------------------------------------------------------- */
/*  Marking a payment as paid (shared by confirm endpoint, redirect + webhook) */
/* -------------------------------------------------------------------------- */

/**
 * Idempotent. Stripe can tell us about the same payment through the webhook AND through the
 * success redirect/confirm call, possibly at the same moment; the guarded `updateMany`
 * guarantees the rental is activated exactly once.
 */
const finalizePayment = async (payment: Payment, details: { paymentIntentId?: string; method?: string }) => {
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const claimed = await tx.payment.updateMany({
      where: { id: payment.id, status: { not: 'COMPLETED' } },
      data: {
        status: 'COMPLETED',
        paidAt: new Date(),
        method: details.method ?? 'card',
        providerPaymentIntentId: details.paymentIntentId,
        failureReason: null,
      },
    });
    if (claimed.count === 0) return; // someone else already finalised it

    const activated = await tx.rentalRequest.updateMany({
      where: { id: payment.rentalRequestId, status: 'APPROVED' },
      data: { status: 'ACTIVE', activatedAt: new Date() },
    });

    if (activated.count === 1) {
      const rental = await tx.rentalRequest.findUniqueOrThrow({ where: { id: payment.rentalRequestId }, select: { propertyId: true } });
      await tx.property.update({ where: { id: rental.propertyId }, data: { status: 'RENTED' } });
    }
  });
};

const markFailed = (paymentId: string, reason: string) =>
  prisma.payment.updateMany({ where: { id: paymentId, status: 'PENDING' }, data: { status: 'FAILED', failureReason: reason } });

/** Applies what Stripe says about a Checkout session to our payment record. */
const applySession = async (payment: Payment, session: StripeCheckoutSession) => {
  if (session.payment_status === 'paid') {
    if (session.amount_total !== toMinorUnits(payment.amount) || session.currency?.toLowerCase() !== payment.currency.toLowerCase()) {
      // Never activate a rental if the paid amount does not match what we asked for.
      console.error(`[payments] amount/currency mismatch for payment ${payment.id}`, session.amount_total, session.currency);
      await markFailed(payment.id, 'Paid amount or currency did not match the expected value');
    } else {
      const intent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
      await finalizePayment(payment, { paymentIntentId: intent ?? undefined, method: session.payment_method_types?.[0] });
    }
  } else if (session.status === 'expired') {
    await markFailed(payment.id, 'Checkout session expired before payment was completed');
  }
  return prisma.payment.findUniqueOrThrow({ where: { id: payment.id }, include: paymentInclude });
};

/** Asks Stripe for the truth about a still-pending payment and updates our records accordingly. */
const syncWithStripe = async (payment: Payment) => {
  if (payment.status !== 'PENDING' || !payment.providerSessionId) {
    return prisma.payment.findUniqueOrThrow({ where: { id: payment.id }, include: paymentInclude });
  }
  const session = await getStripe().checkout.sessions.retrieve(payment.providerSessionId);
  return applySession(payment, session);
};

/* -------------------------------------------------------------------------- */
/*  Create a Stripe Checkout session for an APPROVED rental                    */
/* -------------------------------------------------------------------------- */

export const createCheckout = async (tenantId: string, tenantEmail: string, rentalRequestId: string) => {
  const stripe = getStripe();

  const rental = await prisma.rentalRequest.findUnique({
    where: { id: rentalRequestId },
    include: { property: { select: { id: true, title: true, city: true } } },
  });
  if (!rental) throw ApiError.notFound('Rental request not found');
  if (rental.tenantId !== tenantId) throw ApiError.forbidden('You can only pay for your own rental requests');
  if (rental.status !== 'APPROVED') {
    throw ApiError.conflict(
      rental.status === 'ACTIVE' || rental.status === 'COMPLETED'
        ? 'This rental has already been paid for'
        : `Payment is only possible after the landlord approves the request (current status: ${rental.status})`,
      { code: 'RENTAL_NOT_PAYABLE', currentStatus: rental.status },
    );
  }

  // Re-use a still-open checkout session instead of creating duplicates.
  const pending = await prisma.payment.findFirst({
    where: { rentalRequestId, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  });
  if (pending?.providerSessionId) {
    try {
      const existing = await stripe.checkout.sessions.retrieve(pending.providerSessionId);
      if (existing.status === 'open' && existing.url) {
        return { payment: pending, checkoutUrl: existing.url, sessionId: existing.id, reused: true };
      }
      if (existing.payment_status === 'paid') {
        await applySession(pending, existing);
        throw ApiError.conflict('This rental has already been paid for', { code: 'RENTAL_NOT_PAYABLE' });
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      // The old session could not be read: fall through and create a fresh one.
    }
    await markFailed(pending.id, 'Replaced by a newer checkout session');
  }

  const currency = env.PAYMENT_CURRENCY;
  const payment = await prisma.payment.create({
    data: {
      transactionId: generateTransactionId(),
      rentalRequestId,
      userId: tenantId,
      amount: rental.totalAmount,
      currency,
      provider: 'STRIPE',
      status: 'PENDING',
    },
  });

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        customer_email: tenantEmail,
        client_reference_id: payment.id,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency,
              unit_amount: toMinorUnits(rental.totalAmount),
              product_data: {
                name: `Rent: ${rental.property.title}`,
                description: `${rental.durationMonths} month(s) in ${rental.property.city}, move-in ${rental.moveInDate.toISOString().slice(0, 10)}`,
              },
            },
          },
        ],
        metadata: { paymentId: payment.id, rentalRequestId, tenantId, transactionId: payment.transactionId },
        payment_intent_data: { metadata: { paymentId: payment.id, rentalRequestId } },
        // {CHECKOUT_SESSION_ID} is replaced by Stripe itself.
        success_url: `${env.APP_URL}/api/payments/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${env.APP_URL}/api/payments/cancel?payment_id=${payment.id}`,
      },
      { idempotencyKey: `rentnest-checkout-${payment.id}` },
    );

    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: { providerSessionId: session.id, checkoutUrl: session.url },
    });
    return { payment: updated, checkoutUrl: session.url, sessionId: session.id, reused: false };
  } catch (error) {
    await markFailed(payment.id, 'Could not create Stripe checkout session');
    throw error; // the global handler turns Stripe errors into a 502 response
  }
};

/* -------------------------------------------------------------------------- */
/*  Confirm / callbacks / webhook                                              */
/* -------------------------------------------------------------------------- */

export const confirmPayment = async (user: Express.AuthUser, input: ConfirmPaymentInput) => {
  const payment = await prisma.payment.findFirst({
    where: input.paymentId ? { id: input.paymentId } : { providerSessionId: input.sessionId },
  });
  if (!payment) throw ApiError.notFound('Payment not found');
  if (user.role !== 'ADMIN' && payment.userId !== user.id) throw ApiError.forbidden('This payment does not belong to you');

  return syncWithStripe(payment);
};

/** Public callback for Stripe's success_url. It trusts Stripe's answer, never the query string. */
export const handleSuccessRedirect = async (sessionId: string) => {
  const payment = await prisma.payment.findUnique({ where: { providerSessionId: sessionId } });
  if (!payment) throw ApiError.notFound('No payment found for this checkout session');
  return syncWithStripe(payment);
};

export const handleCancelRedirect = async (paymentId?: string) => {
  if (!paymentId) return null;
  return prisma.payment.findUnique({ where: { id: paymentId }, include: paymentInclude });
};

/** Stripe -> our server. The signature check proves the event really came from Stripe. */
export const handleWebhook = async (rawBody: unknown, signature: string | undefined) => {
  const stripe = getStripe();
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw ApiError.unavailable('Webhook secret is not configured (STRIPE_WEBHOOK_SECRET is missing)', { code: 'WEBHOOK_NOT_CONFIGURED' });
  }
  if (!signature) throw ApiError.badRequest('Missing Stripe-Signature header', { code: 'MISSING_SIGNATURE' });
  if (!Buffer.isBuffer(rawBody)) {
    throw ApiError.badRequest('Webhook body must be sent as raw application/json', { code: 'INVALID_WEBHOOK_BODY' });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    throw ApiError.badRequest('Invalid webhook signature', { code: 'INVALID_SIGNATURE' });
  }

  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
    case 'checkout.session.async_payment_failed':
    case 'checkout.session.expired': {
      const session = event.data.object as StripeCheckoutSession;
      const payment = await prisma.payment.findUnique({ where: { providerSessionId: session.id } });
      if (!payment) break; // not one of ours
      if (event.type === 'checkout.session.async_payment_failed') {
        await markFailed(payment.id, 'Asynchronous payment failed');
      } else {
        await applySession(payment, session);
      }
      break;
    }
    default:
      break; // acknowledge everything else so Stripe stops retrying
  }

  return { received: true, type: event.type };
};

/** Closes unpaid checkout sessions of a rental (used when the tenant cancels). */
export const expireOpenPayments = async (rentalRequestId: string, reason: string) => {
  const open = await prisma.payment.findMany({ where: { rentalRequestId, status: 'PENDING' } });
  for (const payment of open) {
    if (payment.providerSessionId && env.STRIPE_SECRET_KEY) {
      try {
        await getStripe().checkout.sessions.expire(payment.providerSessionId);
      } catch {
        // Stripe refuses to expire a session that is already complete: check whether it was actually paid.
        try {
          await syncWithStripe(payment);
        } catch {
          /* best effort */
        }
        continue;
      }
    }
    await markFailed(payment.id, reason);
  }
};

/* -------------------------------------------------------------------------- */
/*  Reading payments                                                           */
/* -------------------------------------------------------------------------- */

export const listPayments = async (user: Express.AuthUser, query: ListPaymentsQuery) => {
  const pagination = toPagination(query);
  const where: Prisma.PaymentWhereInput = {
    ...(user.role === 'TENANT' ? { userId: user.id } : {}),
    ...(user.role === 'LANDLORD' ? { rentalRequest: { property: { landlordId: user.id } } } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.provider ? { provider: query.provider } : {}),
  };

  const [total, items] = await prisma.$transaction([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      include: paymentInclude,
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.limit,
    }),
  ]);
  return { items, meta: buildMeta(pagination, total) };
};

export const getPayment = async (user: Express.AuthUser, id: string) => {
  const payment = await prisma.payment.findUnique({ where: { id }, include: paymentInclude });
  if (!payment) throw ApiError.notFound('Payment not found');

  const allowed =
    user.role === 'ADMIN' || payment.userId === user.id || payment.rentalRequest.property.landlordId === user.id;
  if (!allowed) throw ApiError.forbidden('You do not have access to this payment');
  return payment;
};
