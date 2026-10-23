import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { ApiError, type ErrorDetails } from '../utils/ApiError';

type Schemas = { body?: ZodType; query?: ZodType; params?: ZodType };
type Location = 'body' | 'query' | 'params';

/**
 * Validates req.params, req.query and req.body against zod schemas.
 * On success the parsed (coerced / trimmed / defaulted) values replace the originals,
 * so handlers can trust their types. On failure ALL problems are reported at once.
 */
export const validate =
  (schemas: Schemas): RequestHandler =>
  (req, _res, next) => {
    const issues: NonNullable<ErrorDetails['issues']> = [];

    for (const location of ['params', 'query', 'body'] as Location[]) {
      const schema = schemas[location];
      if (!schema) continue;

      const result = schema.safeParse(req[location] ?? {});
      if (result.success) {
        (req as unknown as Record<Location, unknown>)[location] = result.data;
      } else {
        for (const issue of result.error.issues) {
          issues.push({ field: issue.path.join('.') || location, location, message: issue.message });
        }
      }
    }

    if (issues.length > 0) {
      return next(new ApiError(400, 'Validation failed', { code: 'VALIDATION_ERROR', issues }));
    }
    next();
  };
