import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize, currentUser } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { catchAsync } from '../../utils/catchAsync';
import { sendResponse } from '../../utils/sendResponse';
import { idParams } from '../../utils/zod';
import { expireOpenPayments } from '../payment/payment.service';
import * as service from './rental.service';
import { createRentalBody, listRentalsQuery, type ListRentalsQuery } from './rental.validation';

const router = Router();
router.use(authenticate);

router.post(
  '/',
  authorize('TENANT'),
  validate({ body: createRentalBody }),
  catchAsync(async (req, res) => {
    const data = await service.createRental(currentUser(req).id, req.body);
    sendResponse(res, { statusCode: 201, message: 'Rental request submitted. The landlord will review it shortly.', data });
  }),
);

router.get(
  '/',
  validate({ query: listRentalsQuery }),
  catchAsync(async (req, res) => {
    const { items, meta } = await service.listRentals(currentUser(req), req.query as unknown as ListRentalsQuery);
    sendResponse(res, { message: 'Rental requests fetched', data: items, meta });
  }),
);

router.get(
  '/:id',
  validate({ params: idParams }),
  catchAsync(async (req, res) => {
    const data = await service.getRental(currentUser(req), req.params.id as string);
    sendResponse(res, { message: 'Rental request fetched', data });
  }),
);

router.patch(
  '/:id/cancel',
  authorize('TENANT'),
  validate({ params: idParams }),
  catchAsync(async (req, res) => {
    const data = await service.cancelRental(currentUser(req).id, req.params.id as string);
    // close any unpaid Stripe checkout so a cancelled rental can never be paid
    await expireOpenPayments(data.id, 'Rental request was cancelled by the tenant');
    sendResponse(res, { message: 'Rental request cancelled', data });
  }),
);

export default router;
