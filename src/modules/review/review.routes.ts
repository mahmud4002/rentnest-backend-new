import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { authorize, currentUser } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { catchAsync } from '../../utils/catchAsync';
import { sendResponse } from '../../utils/sendResponse';
import * as service from './review.service';
import { createReviewBody, listReviewsQuery, type ListReviewsQuery } from './review.validation';

const router = Router();

// Public: reviews of a property (?propertyId=...)
router.get(
  '/',
  validate({ query: listReviewsQuery }),
  catchAsync(async (req, res) => {
    const { items, meta } = await service.listReviews(req.query as unknown as ListReviewsQuery);
    sendResponse(res, { message: 'Reviews fetched', data: items, meta });
  }),
);

router.post(
  '/',
  authenticate,
  authorize('TENANT'),
  validate({ body: createReviewBody }),
  catchAsync(async (req, res) => {
    const data = await service.createReview(currentUser(req).id, req.body);
    sendResponse(res, { statusCode: 201, message: 'Review submitted. Thank you!', data });
  }),
);

export default router;
