import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { isProduction } from '../config';
import { ApiError, type ErrorDetails } from '../utils/ApiError';

type AnyError = Error & {
  code?: string;
  type?: string;
  status?: number;
  statusCode?: number;
  meta?: { target?: unknown; cause?: string; field_name?: string };
};

/** 404 for any route that did not match. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
};

const prismaTarget = (err: AnyError): string => {
  const target = err.meta?.target;
  if (Array.isArray(target)) return target.join(', ');
  if (typeof target === 'string') return target;
  return 'field';
};

/**
 * Single place where every error becomes the documented response:
 *   { success: false, message: string, errorDetails: { code, issues?, ... } }
 */
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const err = error as AnyError;

  let statusCode = 500;
  let message = 'Something went wrong on our side. Please try again later.';
  let details: ErrorDetails = { code: 'INTERNAL_SERVER_ERROR' };

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    details = err.errorDetails;
  } else if (err instanceof ZodError) {
    statusCode = 400;
    message = 'Validation failed';
    details = {
      code: 'VALIDATION_ERROR',
      issues: err.issues.map((i) => ({ field: i.path.join('.'), location: 'body' as const, message: i.message })),
    };
  } else if (err.name === 'PrismaClientKnownRequestError') {
    // https://www.prisma.io/docs/orm/reference/error-reference
    switch (err.code) {
      case 'P2002':
        statusCode = 409;
        message = `A record with this ${prismaTarget(err)} already exists`;
        details = { code: 'DUPLICATE_RECORD' };
        break;
      case 'P2025':
        statusCode = 404;
        message = 'The requested record was not found';
        details = { code: 'NOT_FOUND' };
        break;
      case 'P2003':
        statusCode = 409;
        message = 'This action conflicts with related records';
        details = { code: 'RELATED_RECORD_CONFLICT' };
        break;
      default:
        statusCode = 400;
        message = 'The database rejected this request';
        details = { code: `DB_${err.code ?? 'ERROR'}` };
    }
  } else if (err.name === 'PrismaClientValidationError') {
    statusCode = 400;
    message = 'Invalid data supplied';
    details = { code: 'INVALID_DATA' };
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Your session has expired. Please log in again.';
    details = { code: 'TOKEN_EXPIRED' };
  } else if (err.name === 'JsonWebTokenError' || err.name === 'NotBeforeError') {
    statusCode = 401;
    message = 'Invalid authentication token';
    details = { code: 'INVALID_TOKEN' };
  } else if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Malformed JSON in request body';
    details = { code: 'MALFORMED_JSON' };
  } else if (err.type === 'entity.too.large') {
    statusCode = 413;
    message = 'Request body is too large';
    details = { code: 'PAYLOAD_TOO_LARGE' };
  } else if (typeof err.type === 'string' && err.type.startsWith('Stripe')) {
    // Errors raised by the Stripe SDK (invalid key, network, card errors ...)
    statusCode = 502;
    message = `Payment provider error: ${err.message}`;
    details = { code: 'PAYMENT_PROVIDER_ERROR', providerErrorType: err.type };
  }

  if (statusCode >= 500) {
    console.error('[error]', error);
  }

  // Stack traces only for genuinely unexpected failures (never for deliberate ApiErrors) and never in production.
  if (!isProduction && statusCode >= 500 && !(err instanceof ApiError) && err.stack) {
    details = { ...details, stack: err.stack };
  }

  res.status(statusCode).json({ success: false, message, errorDetails: details });
};
