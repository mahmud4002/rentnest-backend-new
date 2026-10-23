import { Router } from 'express';
import { catchAsync } from '../../utils/catchAsync';
import { sendResponse } from '../../utils/sendResponse';
import * as service from './category.service';

/** Public: GET /api/categories. Admin CRUD lives in the admin module. */
const router = Router();

router.get(
  '/',
  catchAsync(async (_req, res) => {
    const data = await service.listCategories();
    sendResponse(res, { message: 'Categories fetched', data });
  }),
);

export default router;
