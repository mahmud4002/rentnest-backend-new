import Stripe from 'stripe';
import { env } from '../config';
import { ApiError } from '../utils/ApiError';

let client: Stripe | undefined;

/**
 * Lazily creates the Stripe client. If the secret key is missing the payment endpoints answer
 * 503 (with a clear message) instead of crashing the whole API on boot.
 */
export const getStripe = (): Stripe => {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw ApiError.unavailable('Online payments are not configured on this server (STRIPE_SECRET_KEY is missing)', {
      code: 'PAYMENTS_NOT_CONFIGURED',
    });
  }
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY, {
    maxNetworkRetries: 2,
    timeout: 20_000,
    appInfo: { name: 'RentNest API', version: '1.0.0' },
  });
  return client;
};

export type StripeCheckoutSession = Stripe.Checkout.Session;
