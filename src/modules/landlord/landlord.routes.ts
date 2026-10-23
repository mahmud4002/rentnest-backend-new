import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize, currentUser } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import * as propertyService from '../property/property.service';
import {
  createPropertyBody,
  managedPropertiesQuery,
  setAvailabilityBody,
  updatePropertyBody,
  type ListPropertiesQuery,
} from '../property/property.validation';
import * as reviewService from '../review/review.service';
import { listReviewsQuery, type ListReviewsQuery } from '../review/review.validation';
import * as rentalService from '../rental/rental.service';
import { listRentalsQuery, respondBody, type ListRentalsQuery } from '../rental/rental.validation';
import { catchAsync } from '../../utils/catchAsync';
import { sendResponse } from '../../utils/sendResponse';
import { idParams } from '../../utils/zod';

/** Everything under /api/landlord requires a logged-in LANDLORD. */
const router = Router();
router.use(authenticate, authorize('LANDLORD'));

/* ------------------------------- own properties ------------------------------- */

router.get(
  '/properties',
  validate({ query: managedPropertiesQuery }),
  catchAsync(async (req, res) => {
    const { items, meta } = await propertyService.listProperties(req.query as unknown as ListPropertiesQuery, {
      landlordId: currentUser(req).id,
    });
    sendResponse(res, { message: 'Your properties fetched', data: items, meta });
  }),
);

router.post(
  '/properties',
  validate({ body: createPropertyBody }),
  catchAsync(async (req, res) => {
    const data = await propertyService.createProperty(currentUser(req).id, req.body);
    sendResponse(res, { statusCode: 201, message: 'Property listed successfully', data });
  }),
);

router.put(
  '/properties/:id',
  validate({ params: idParams, body: updatePropertyBody }),
  catchAsync(async (req, res) => {
    const data = await propertyService.updateProperty(req.params.id as string, currentUser(req).id, req.body);
    sendResponse(res, { message: 'Property updated', data });
  }),
);

router.patch(
  '/properties/:id/status',
  validate({ params: idParams, body: setAvailabilityBody }),
  catchAsync(async (req, res) => {
    const data = await propertyService.setAvailability(req.params.id as string, req.body.status, currentUser(req).id);
    sendResponse(res, { message: `Property marked as ${req.body.status}`, data });
  }),
);

router.delete(
  '/properties/:id',
  validate({ params: idParams }),
  catchAsync(async (req, res) => {
    await propertyService.deleteProperty(req.params.id as string, currentUser(req).id);
    sendResponse(res, { message: 'Property removed' });
  }),
);

/* ------------------------------- rental requests ------------------------------- */

router.get(
  '/requests',
  validate({ query: listRentalsQuery }),
  catchAsync(async (req, res) => {
    const { items, meta } = await rentalService.listRentals(currentUser(req), req.query as unknown as ListRentalsQuery);
    sendResponse(res, { message: 'Rental requests for your properties fetched', data: items, meta });
  }),
);

router.patch(
  '/requests/:id',
  validate({ params: idParams, body: respondBody }),
  catchAsync(async (req, res) => {
    const data = await rentalService.respondToRequest(currentUser(req).id, req.params.id as string, req.body);
    sendResponse(res, { message: `Rental request ${String(req.body.status).toLowerCase()}`, data });
  }),
);

/** Tenants who are living in (ACTIVE) or have finished (COMPLETED) a rental on the landlord's properties. */
router.get(
  '/rental-history',
  validate({ query: listRentalsQuery }),
  catchAsync(async (req, res) => {
    const { items, meta } = await rentalService.listRentals(currentUser(req), req.query as unknown as ListRentalsQuery, {
      statuses: ['ACTIVE', 'COMPLETED'],
    });
    sendResponse(res, { message: 'Rental history fetched', data: items, meta });
  }),
);

/** Reviews left on the landlord's properties. */
router.get(
  '/reviews',
  validate({ query: listReviewsQuery }),
  catchAsync(async (req, res) => {
    const { items, meta } = await reviewService.listReviews(req.query as unknown as ListReviewsQuery, currentUser(req).id);
    sendResponse(res, { message: 'Reviews for your properties fetched', data: items, meta });
  }),
);

export default router;
