import type { RequestHandler } from 'express';
import type { Role } from '@prisma/client';
import { ApiError } from '../utils/ApiError';

/** Role guard. Always place it after `authenticate`. */
export const authorize =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(
        ApiError.forbidden(`Access denied. This action requires the role: ${roles.join(' or ')}`, {
          code: 'INSUFFICIENT_ROLE',
        }),
      );
    }
    next();
  };

/** Returns the authenticated user or throws 401 (keeps handlers free of `req.user!`). */
export const currentUser = (req: Parameters<RequestHandler>[0]): Express.AuthUser => {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
};
