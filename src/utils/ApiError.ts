export type ErrorDetails = {
  code: string;
  issues?: Array<{ field: string; location: 'body' | 'query' | 'params'; message: string }>;
  [key: string]: unknown;
};

/**
 * Operational error that we throw on purpose. The global error handler turns it into
 * `{ success: false, message, errorDetails }`.
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly errorDetails: ErrorDetails;

  constructor(statusCode: number, message: string, errorDetails: Partial<ErrorDetails> = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errorDetails = { code: errorDetails.code ?? ApiError.defaultCode(statusCode), ...errorDetails };
    Error.captureStackTrace?.(this, this.constructor);
  }

  static defaultCode(statusCode: number): string {
    switch (statusCode) {
      case 400:
        return 'BAD_REQUEST';
      case 401:
        return 'UNAUTHORIZED';
      case 403:
        return 'FORBIDDEN';
      case 404:
        return 'NOT_FOUND';
      case 409:
        return 'CONFLICT';
      case 422:
        return 'UNPROCESSABLE_ENTITY';
      case 429:
        return 'TOO_MANY_REQUESTS';
      case 502:
        return 'BAD_GATEWAY';
      case 503:
        return 'SERVICE_UNAVAILABLE';
      default:
        return statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'ERROR';
    }
  }

  static badRequest(message: string, details?: Partial<ErrorDetails>) {
    return new ApiError(400, message, details);
  }
  static unauthorized(message = 'Authentication required', details?: Partial<ErrorDetails>) {
    return new ApiError(401, message, details);
  }
  static forbidden(message = 'You do not have permission to perform this action', details?: Partial<ErrorDetails>) {
    return new ApiError(403, message, details);
  }
  static notFound(message = 'Resource not found', details?: Partial<ErrorDetails>) {
    return new ApiError(404, message, details);
  }
  static conflict(message: string, details?: Partial<ErrorDetails>) {
    return new ApiError(409, message, details);
  }
  static unavailable(message: string, details?: Partial<ErrorDetails>) {
    return new ApiError(503, message, details);
  }
}
