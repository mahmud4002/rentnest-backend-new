import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';
import { catchAsync } from '../utils/catchAsync';
import { verifyToken } from '../utils/jwt';

/**
 * Requires `Authorization: Bearer <jwt>`.
 * The user is re-loaded from the database on every request so that a ban takes effect immediately,
 * even for tokens that were issued before the ban.
 */
export const authenticate = catchAsync(async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Missing or malformed Authorization header. Use: Authorization: Bearer <token>');
  }

  const token = header.slice('Bearer '.length).trim();
  const payload = verifyToken(token);

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, name: true, email: true, role: true, status: true },
  });

  if (!user) throw ApiError.unauthorized('The account for this token no longer exists');
  if (user.status === 'BANNED') {
    throw ApiError.forbidden('Your account has been banned. Please contact support.', { code: 'ACCOUNT_BANNED' });
  }

  req.user = user;
  next();
});
