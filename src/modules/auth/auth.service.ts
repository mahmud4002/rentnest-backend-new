import bcrypt from 'bcryptjs';
import { env } from '../../config';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { signToken } from '../../utils/jwt';
import type { ChangePasswordInput, LoginInput, RegisterInput, UpdateProfileInput } from './auth.validation';

/** Everything about a user except the password hash. */
export const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  avatarUrl: true,
  role: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const register = async (input: RegisterInput) => {
  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) throw ApiError.conflict('An account with this email already exists', { code: 'EMAIL_TAKEN' });

  const password = await bcrypt.hash(input.password, env.BCRYPT_SALT_ROUNDS);
  const user = await prisma.user.create({
    data: { name: input.name, email: input.email, password, role: input.role, phone: input.phone },
    select: publicUserSelect,
  });

  return { user, token: signToken({ sub: user.id, role: user.role }) };
};

export const login = async (input: LoginInput) => {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  // Same message for "no such user" and "wrong password" so emails cannot be enumerated.
  const valid = user ? await bcrypt.compare(input.password, user.password) : false;
  if (!user || !valid) throw ApiError.unauthorized('Invalid email or password', { code: 'INVALID_CREDENTIALS' });

  if (user.status === 'BANNED') {
    throw ApiError.forbidden('Your account has been banned. Please contact support.', { code: 'ACCOUNT_BANNED' });
  }

  const { password: _password, ...safeUser } = user;
  return { user: safeUser, token: signToken({ sub: user.id, role: user.role }) };
};

export const getMe = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: publicUserSelect });
  if (!user) throw ApiError.notFound('User not found');
  return user;
};

export const updateProfile = async (userId: string, input: UpdateProfileInput) =>
  prisma.user.update({ where: { id: userId }, data: input, select: publicUserSelect });

export const changePassword = async (userId: string, input: ChangePasswordInput) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound('User not found');

  const matches = await bcrypt.compare(input.currentPassword, user.password);
  if (!matches) throw ApiError.badRequest('Current password is incorrect', { code: 'WRONG_PASSWORD' });

  const password = await bcrypt.hash(input.newPassword, env.BCRYPT_SALT_ROUNDS);
  await prisma.user.update({ where: { id: userId }, data: { password } });
};
