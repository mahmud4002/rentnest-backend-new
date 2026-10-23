import type { Prisma, UserStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { buildMeta, toPagination } from '../../utils/pagination';
import { publicUserSelect } from '../auth/auth.service';
import type { ListUsersQuery } from './admin.validation';

export const listUsers = async (query: ListUsersQuery) => {
  const pagination = toPagination(query);
  const where: Prisma.UserWhereInput = {
    ...(query.role ? { role: query.role } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? { OR: [{ name: { contains: query.search, mode: 'insensitive' } }, { email: { contains: query.search, mode: 'insensitive' } }] }
      : {}),
  };
  const [total, items] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({ where, select: publicUserSelect, orderBy: { createdAt: 'desc' }, skip: pagination.skip, take: pagination.limit }),
  ]);
  return { items, meta: buildMeta(pagination, total) };
};

export const updateUserStatus = async (adminId: string, id: string, status: UserStatus) => {
  if (id === adminId) throw ApiError.badRequest('You cannot change your own status', { code: 'SELF_STATUS_CHANGE' });
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
  if (!user) throw ApiError.notFound('User not found');
  if (user.role === 'ADMIN') throw ApiError.forbidden('Admin accounts cannot be banned', { code: 'CANNOT_BAN_ADMIN' });
  return prisma.user.update({ where: { id }, data: { status }, select: publicUserSelect });
};

export const platformStats = async () => {
  const [users, landlords, tenants, properties, rentals, completedPayments, revenue] = await prisma.$transaction([
    prisma.user.count(),
    prisma.user.count({ where: { role: 'LANDLORD' } }),
    prisma.user.count({ where: { role: 'TENANT' } }),
    prisma.property.count(),
    prisma.rentalRequest.count(),
    prisma.payment.count({ where: { status: 'COMPLETED' } }),
    prisma.payment.aggregate({ where: { status: 'COMPLETED' }, _sum: { amount: true } }),
  ]);
  return { users, landlords, tenants, properties, rentals, completedPayments, totalRevenue: revenue._sum.amount ?? 0 };
};
