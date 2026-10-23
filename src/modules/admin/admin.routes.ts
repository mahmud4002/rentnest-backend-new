import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize, currentUser } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { catchAsync } from '../../utils/catchAsync';
import { sendResponse } from '../../utils/sendResponse';
import { idParams } from '../../utils/zod';
import * as categoryService from '../category/category.service';
import { createCategoryBody, updateCategoryBody } from '../category/category.validation';
import * as propertyService from '../property/property.service';
import { managedPropertiesQuery, setAvailabilityBody, type ListPropertiesQuery } from '../property/property.validation';
import * as rentalService from '../rental/rental.service';
import { listRentalsQuery, type ListRentalsQuery } from '../rental/rental.validation';
import * as paymentService from '../payment/payment.service';
import { listPaymentsQuery, type ListPaymentsQuery } from '../payment/payment.validation';
import * as service from './admin.service';
import { listUsersQuery, updateUserStatusBody, type ListUsersQuery } from './admin.validation';

/** Everything under /api/admin requires an ADMIN. */
const router = Router();
router.use(authenticate, authorize('ADMIN'));

router.get(
  '/stats',
  catchAsync(async (_req, res) => sendResponse(res, { message: 'Platform statistics', data: await service.platformStats() })),
);

/* --------------------------------- users --------------------------------- */
router.get(
  '/users',
  validate({ query: listUsersQuery }),
  catchAsync(async (req, res) => {
    const { items, meta } = await service.listUsers(req.query as unknown as ListUsersQuery);
    sendResponse(res, { message: 'Users fetched', data: items, meta });
  }),
);

router.patch(
  '/users/:id',
  validate({ params: idParams, body: updateUserStatusBody }),
  catchAsync(async (req, res) => {
    const data = await service.updateUserStatus(currentUser(req).id, req.params.id as string, req.body.status);
    sendResponse(res, { message: data.status === 'BANNED' ? 'User banned' : 'User unbanned', data });
  }),
);

/* ------------------------- properties, rentals, payments ------------------------- */
router.get(
  '/properties',
  validate({ query: managedPropertiesQuery }),
  catchAsync(async (req, res) => {
    const { items, meta } = await propertyService.listProperties(req.query as unknown as ListPropertiesQuery, { includeLandlordEmail: true });
    sendResponse(res, { message: 'All properties fetched', data: items, meta });
  }),
);

router.patch(
  '/properties/:id/status',
  validate({ params: idParams, body: setAvailabilityBody }),
  catchAsync(async (req, res) => {
    const data = await propertyService.setAvailability(req.params.id as string, req.body.status);
    sendResponse(res, { message: `Property marked as ${req.body.status}`, data });
  }),
);

router.get(
  '/rentals',
  validate({ query: listRentalsQuery }),
  catchAsync(async (req, res) => {
    const { items, meta } = await rentalService.listRentals(currentUser(req), req.query as unknown as ListRentalsQuery);
    sendResponse(res, { message: 'All rental requests fetched', data: items, meta });
  }),
);

router.get(
  '/payments',
  validate({ query: listPaymentsQuery }),
  catchAsync(async (req, res) => {
    const { items, meta } = await paymentService.listPayments(currentUser(req), req.query as unknown as ListPaymentsQuery);
    sendResponse(res, { message: 'All payments fetched', data: items, meta });
  }),
);

/* -------------------------------- categories -------------------------------- */
router.post(
  '/categories',
  validate({ body: createCategoryBody }),
  catchAsync(async (req, res) => {
    sendResponse(res, { statusCode: 201, message: 'Category created', data: await categoryService.createCategory(req.body) });
  }),
);

router.put(
  '/categories/:id',
  validate({ params: idParams, body: updateCategoryBody }),
  catchAsync(async (req, res) => {
    sendResponse(res, { message: 'Category updated', data: await categoryService.updateCategory(req.params.id as string, req.body) });
  }),
);

router.delete(
  '/categories/:id',
  validate({ params: idParams }),
  catchAsync(async (req, res) => {
    await categoryService.deleteCategory(req.params.id as string);
    sendResponse(res, { message: 'Category deleted' });
  }),
);

export default router;
