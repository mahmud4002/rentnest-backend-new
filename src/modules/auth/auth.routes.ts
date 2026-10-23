import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { currentUser } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { catchAsync } from '../../utils/catchAsync';
import { sendResponse } from '../../utils/sendResponse';
import * as service from './auth.service';
import { changePasswordBody, loginBody, registerBody, updateProfileBody } from './auth.validation';

const router = Router();

router.post(
  '/register',
  validate({ body: registerBody }),
  catchAsync(async (req, res) => {
    const data = await service.register(req.body);
    sendResponse(res, { statusCode: 201, message: 'Registration successful', data });
  }),
);

router.post(
  '/login',
  validate({ body: loginBody }),
  catchAsync(async (req, res) => {
    const data = await service.login(req.body);
    sendResponse(res, { message: 'Login successful', data });
  }),
);

router.get(
  '/me',
  authenticate,
  catchAsync(async (req, res) => {
    const data = await service.getMe(currentUser(req).id);
    sendResponse(res, { message: 'Current user fetched', data });
  }),
);

router.patch(
  '/me',
  authenticate,
  validate({ body: updateProfileBody }),
  catchAsync(async (req, res) => {
    const data = await service.updateProfile(currentUser(req).id, req.body);
    sendResponse(res, { message: 'Profile updated', data });
  }),
);

router.patch(
  '/change-password',
  authenticate,
  validate({ body: changePasswordBody }),
  catchAsync(async (req, res) => {
    await service.changePassword(currentUser(req).id, req.body);
    sendResponse(res, { message: 'Password changed successfully' });
  }),
);

export default router;
