import type { Prisma, RentalStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { buildMeta, toPagination } from '../../utils/pagination';
import type { CreateRentalInput, ListRentalsQuery, RespondInput } from './rental.validation';

const rentalInclude = {
  property: {
    select: { id: true, title: true, address: true, city: true, price: true, images: true, status: true, landlordId: true },
  },
  tenant: { select: { id: true, name: true, email: true, phone: true } },
  payments: {
    select: { id: true, transactionId: true, amount: true, currency: true, provider: true, status: true, paidAt: true },
    orderBy: { createdAt: 'desc' },
  },
  review: { select: { id: true, rating: true, comment: true, createdAt: true } },
} satisfies Prisma.RentalRequestInclude;

/** Lifecycle: PENDING -> APPROVED | REJECTED; APPROVED -> ACTIVE (payment); ACTIVE -> COMPLETED; PENDING/APPROVED -> CANCELLED (tenant). */
const landlordTransitions: Record<RentalStatus, RentalStatus[]> = {
  PENDING: ['APPROVED', 'REJECTED'],
  ACTIVE: ['COMPLETED'],
  APPROVED: [],
  REJECTED: [],
  COMPLETED: [],
  CANCELLED: [],
};

export const createRental = async (tenantId: string, input: CreateRentalInput) => {
  const property = await prisma.property.findUnique({ where: { id: input.propertyId } });
  if (!property) throw ApiError.notFound('Property not found');

  if (property.status !== 'AVAILABLE') {
    throw ApiError.conflict('This property is not available for rent right now', { code: 'PROPERTY_UNAVAILABLE' });
  }

  const open = await prisma.rentalRequest.findFirst({
    where: { propertyId: property.id, tenantId, status: { in: ['PENDING', 'APPROVED', 'ACTIVE'] } },
    select: { id: true, status: true },
  });
  if (open) {
    throw ApiError.conflict(`You already have a ${open.status} request for this property`, {
      code: 'DUPLICATE_REQUEST',
      rentalRequestId: open.id,
    });
  }

  return prisma.rentalRequest.create({
    data: {
      propertyId: property.id,
      tenantId,
      moveInDate: input.moveInDate,
      durationMonths: input.durationMonths,
      message: input.message,
      // price snapshot: later edits to the listing never change what the tenant agreed to pay
      monthlyRent: property.price,
      totalAmount: property.price.mul(input.durationMonths),
    },
    include: rentalInclude,
  });
};

/** Tenants see their own requests, landlords see requests for their properties, admins see everything. */
export const listRentals = async (
  user: Express.AuthUser,
  query: ListRentalsQuery,
  extra: { statuses?: RentalStatus[] } = {},
) => {
  const pagination = toPagination(query);
  const where: Prisma.RentalRequestWhereInput = {
    ...(user.role === 'TENANT' ? { tenantId: user.id } : {}),
    ...(user.role === 'LANDLORD' ? { property: { landlordId: user.id } } : {}),
    ...(query.propertyId ? { propertyId: query.propertyId } : {}),
    ...(query.status ? { status: query.status } : extra.statuses ? { status: { in: extra.statuses } } : {}),
  };

  const [total, items] = await prisma.$transaction([
    prisma.rentalRequest.count({ where }),
    prisma.rentalRequest.findMany({
      where,
      include: rentalInclude,
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.limit,
    }),
  ]);

  return { items, meta: buildMeta(pagination, total) };
};

export const getRental = async (user: Express.AuthUser, id: string) => {
  const rental = await prisma.rentalRequest.findUnique({ where: { id }, include: rentalInclude });
  if (!rental) throw ApiError.notFound('Rental request not found');

  const isTenant = rental.tenantId === user.id;
  const isLandlord = rental.property.landlordId === user.id;
  if (user.role !== 'ADMIN' && !isTenant && !isLandlord) {
    throw ApiError.forbidden('You do not have access to this rental request');
  }
  return rental;
};

export const cancelRental = async (tenantId: string, id: string) => {
  const rental = await prisma.rentalRequest.findUnique({ where: { id }, select: { id: true, tenantId: true, status: true } });
  if (!rental) throw ApiError.notFound('Rental request not found');
  if (rental.tenantId !== tenantId) throw ApiError.forbidden('You can only cancel your own rental requests');
  if (rental.status !== 'PENDING' && rental.status !== 'APPROVED') {
    throw ApiError.conflict(`A ${rental.status} rental request cannot be cancelled`, { code: 'INVALID_STATUS_TRANSITION' });
  }

  // Guarded update: only succeeds if nothing changed the status (e.g. a payment) in the meantime.
  const result = await prisma.rentalRequest.updateMany({ where: { id, status: rental.status }, data: { status: 'CANCELLED' } });
  if (result.count === 0) {
    throw ApiError.conflict('The request changed while you were cancelling it. Please refresh and try again.');
  }
  return prisma.rentalRequest.findUniqueOrThrow({ where: { id }, include: rentalInclude });
};

/** Landlord approves / rejects a PENDING request, or completes an ACTIVE rental. */
export const respondToRequest = async (landlordId: string, id: string, input: RespondInput) => {
  const rental = await prisma.rentalRequest.findUnique({ where: { id }, include: { property: true } });
  if (!rental) throw ApiError.notFound('Rental request not found');
  if (rental.property.landlordId !== landlordId) {
    throw ApiError.forbidden('This request is not for one of your properties');
  }

  const currentStatus: RentalStatus = rental.status;
  if (!landlordTransitions[currentStatus].includes(input.status)) {
    throw ApiError.conflict(`A ${currentStatus} request cannot be changed to ${input.status}`, {
      code: 'INVALID_STATUS_TRANSITION',
      currentStatus,
      allowedStatuses: landlordTransitions[currentStatus],
    });
  }

  const now = new Date();

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    if (input.status === 'APPROVED') {
      // Lock the property row so two simultaneous approvals cannot both succeed.
      await tx.$queryRaw`SELECT id FROM "Property" WHERE id = ${rental.propertyId} FOR UPDATE`;

      const property = await tx.property.findUniqueOrThrow({ where: { id: rental.propertyId }, select: { status: true } });
      if (property.status !== 'AVAILABLE') {
        throw ApiError.conflict('This property is not available, so the request cannot be approved', { code: 'PROPERTY_UNAVAILABLE' });
      }
      const competing = await tx.rentalRequest.findFirst({
        where: { propertyId: rental.propertyId, id: { not: id }, status: { in: ['APPROVED', 'ACTIVE'] } },
        select: { id: true },
      });
      if (competing) {
        throw ApiError.conflict('Another request for this property is already approved or active', { code: 'PROPERTY_ALREADY_CLAIMED' });
      }
    }

    const updated = await tx.rentalRequest.updateMany({
      where: { id, status: rental.status },
      data: {
        status: input.status,
        landlordNote: input.landlordNote,
        ...(input.status === 'COMPLETED' ? { completedAt: now } : { respondedAt: now }),
      },
    });
    if (updated.count === 0) {
      throw ApiError.conflict('This request was changed by someone else. Please refresh and try again.');
    }

    if (input.status === 'COMPLETED') {
      // The tenant has moved out: put the listing back on the market.
      await tx.property.updateMany({ where: { id: rental.propertyId, status: 'RENTED' }, data: { status: 'AVAILABLE' } });
    }
  });

  return prisma.rentalRequest.findUniqueOrThrow({ where: { id }, include: rentalInclude });
};
