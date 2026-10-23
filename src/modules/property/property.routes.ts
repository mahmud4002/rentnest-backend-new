import { Router } from 'express';
import { validate } from '../../middlewares/validate';
import { catchAsync } from '../../utils/catchAsync';
import { sendResponse } from '../../utils/sendResponse';
import { idParams } from '../../utils/zod';
import * as service from './property.service';
import { listPropertiesQuery, type ListPropertiesQuery } from './property.validation';

/** Public browsing endpoints - no authentication needed. */
const router = Router();

router.get(
  '/',
  validate({ query: listPropertiesQuery }),
  catchAsync(async (req, res) => {
    const { items, meta } = await service.listProperties(req.query as unknown as ListPropertiesQuery, { publicOnly: true });
    sendResponse(res, { message: 'Properties fetched', data: items, meta });
  }),
);

router.get(
  '/:id',
  validate({ params: idParams }),
  catchAsync(async (req, res) => {
    const data = await service.getProperty(req.params.id as string);
    sendResponse(res, { message: 'Property fetched', data });
  }),
);

export default router;
