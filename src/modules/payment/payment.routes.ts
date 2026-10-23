import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize, currentUser } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { catchAsync } from '../../utils/catchAsync';
import { sendResponse } from '../../utils/sendResponse';
import { idParams } from '../../utils/zod';
import * as service from './payment.service';
import {
  cancelQuery,
  confirmPaymentBody,
  createPaymentBody,
  listPaymentsQuery,
  successQuery,
  type ListPaymentsQuery,
} from './payment.validation';

const router = Router();

/* ------------------------ public (called by Stripe / the browser) ------------------------ */

// Needs the RAW body, which app.ts provides for this exact path (see express.raw there).
router.post(
  '/webhook',
  catchAsync(async (req, res) => {
    const result = await service.handleWebhook(req.body, req.headers['stripe-signature'] as string | undefined);
    res.status(200).json({ success: true, message: 'Webhook processed', data: result });
  }),
);

router.get(
  '/success',
  validate({ query: successQuery }),
  catchAsync(async (req, res) => {
    const payment = await service.handleSuccessRedirect(req.query.session_id as string);
    const message =
      payment.status === 'COMPLETED'
        ? 'Payment successful! Your rental is now active.'
        : payment.status === 'FAILED'
          ? 'Payment failed or expired.'
          : 'Payment is still being processed. Check again in a moment.';
    sendResponse(res, { message, data: payment });
  }),
);

router.get(
  '/cancel',
  validate({ query: cancelQuery }),
  catchAsync(async (req, res) => {
    const payment = await service.handleCancelRedirect(req.query.payment_id as string | undefined);
    sendResponse(res, {
      message: 'Payment was cancelled. You can start the payment again from your approved rental request.',
      data: payment,
    });
  }),
);

/* ------------------------------------ authenticated ------------------------------------ */

router.use(authenticate);

router.post(
  '/create',
  authorize('TENANT'),
  validate({ body: createPaymentBody }),
  catchAsync(async (req, res) => {
    const user = currentUser(req);
    const data = await service.createCheckout(user.id, user.email, req.body.rentalRequestId);
    sendResponse(res, {
      statusCode: data.reused ? 200 : 201,
      message: 'Checkout session ready. Open checkoutUrl to pay securely with Stripe.',
      data,
    });
  }),
);

router.post(
  '/confirm',
  authorize('TENANT', 'ADMIN'),
  validate({ body: confirmPaymentBody }),
  catchAsync(async (req, res) => {
    const data = await service.confirmPayment(currentUser(req), req.body);
    sendResponse(res, { message: `Payment status: ${data.status}`, data });
  }),
);

router.get(
  '/',
  validate({ query: listPaymentsQuery }),
  catchAsync(async (req, res) => {
    const { items, meta } = await service.listPayments(currentUser(req), req.query as unknown as ListPaymentsQuery);
    sendResponse(res, { message: 'Payments fetched', data: items, meta });
  }),
);

router.get(
  '/:id',
  validate({ params: idParams }),
  catchAsync(async (req, res) => {
    const data = await service.getPayment(currentUser(req), req.params.id as string);
    sendResponse(res, { message: 'Payment fetched', data });
  }),
);

export default router;
