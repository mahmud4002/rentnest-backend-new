import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { buildMeta, toPagination } from '../../utils/pagination';
import type { CreateReviewInput, ListReviewsQuery } from './review.validation';

const reviewInclude = {
  tenant: { select: { id: true, name: true, avatarUrl: true } },
  property: { select: { id: true, title: true, city: true } },
} satisfies Prisma.ReviewInclude;

/** Only the tenant of a COMPLETED rental may review it, once. */
export const createReview = async (tenantId: string, input: CreateReviewInput) => {
  const rental = await prisma.rentalRequest.findUnique({
    where: { id: input.rentalRequestId },
    select: { id: true, tenantId: true, status: true, propertyId: true },
  });
  if (!rental) throw ApiError.notFound('Rental request not found');
  if (rental.tenantId !== tenantId) throw ApiError.forbidden('You can only review your own rentals');
  if (rental.status !== 'COMPLETED') {
    throw ApiError.conflict(`You can review a rental only after it is completed (current status: ${rental.status})`, {
      code: 'RENTAL_NOT_COMPLETED',
    });
  }

  const existing = await prisma.review.findUnique({ where: { rentalRequestId: rental.id }, select: { id: true } });
  if (existing) throw ApiError.conflict('You have already reviewed this rental', { code: 'REVIEW_EXISTS' });

  // The unique index on rentalRequestId also protects against a double-submit race (P2002 -> 409).
  return prisma.review.create({
    data: { rentalRequestId: rental.id, propertyId: rental.propertyId, tenantId, rating: input.rating, comment: input.comment },
    include: reviewInclude,
  });
};

export const listReviews = async (query: ListReviewsQuery, landlordId?: string) => {
  const pagination = toPagination(query);
  const where: Prisma.ReviewWhereInput = {
    ...(query.propertyId ? { propertyId: query.propertyId } : {}),
    ...(landlordId ? { property: { landlordId } } : {}),
  };
  const [total, items] = await prisma.$transaction([
    prisma.review.count({ where }),
    prisma.review.findMany({ where, include: reviewInclude, orderBy: { createdAt: 'desc' }, skip: pagination.skip, take: pagination.limit }),
  ]);
  return { items, meta: buildMeta(pagination, total) };
};
