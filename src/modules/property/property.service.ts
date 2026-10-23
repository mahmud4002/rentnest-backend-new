import type { Prisma, PropertyStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../utils/ApiError';
import { buildMeta, toPagination } from '../../utils/pagination';
import type { CreatePropertyInput, ListPropertiesQuery, UpdatePropertyInput } from './property.validation';

const roundRating = (value: number | null | undefined) => (value == null ? null : Math.round(value * 10) / 10);

/** Adds averageRating / reviewCount to a page of properties with a single grouped query (no N+1). */
const attachRatings = async <T extends { id: string }>(items: T[]) => {
  if (items.length === 0) return [];
  const stats = await prisma.review.groupBy({
    by: ['propertyId'],
    where: { propertyId: { in: items.map((p) => p.id) } },
    _avg: { rating: true },
    _count: { _all: true },
  });
  type RatingStat = { propertyId: string; _avg: { rating: number | null }; _count: { _all: number } };
  const byProperty = new Map((stats as RatingStat[]).map((s) => [s.propertyId, s] as const));
  return items.map((item) => {
    const stat = byProperty.get(item.id);
    return { ...item, averageRating: roundRating(stat?._avg.rating), reviewCount: stat?._count._all ?? 0 };
  });
};

type ListOptions = {
  /** Public browsing is locked to AVAILABLE listings. */
  publicOnly?: boolean;
  /** Restrict to one landlord's listings. */
  landlordId?: string;
  /** Admin views also expose the landlord's email. */
  includeLandlordEmail?: boolean;
};

export const listProperties = async (query: ListPropertiesQuery, options: ListOptions = {}) => {
  const pagination = toPagination(query);
  const and: Prisma.PropertyWhereInput[] = [];

  if (query.search) {
    and.push({
      OR: [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { address: { contains: query.search, mode: 'insensitive' } },
        { city: { contains: query.search, mode: 'insensitive' } },
      ],
    });
  }
  if (query.location) {
    and.push({
      OR: [
        { city: { contains: query.location, mode: 'insensitive' } },
        { address: { contains: query.location, mode: 'insensitive' } },
      ],
    });
  }
  if (query.type) and.push({ category: { name: { equals: query.type, mode: 'insensitive' } } });

  const amenities = query.amenities
    ?.split(',')
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);

  const where: Prisma.PropertyWhereInput = {
    ...(options.landlordId ? { landlordId: options.landlordId } : {}),
    ...(options.publicOnly ? { status: 'AVAILABLE' } : query.status ? { status: query.status } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.bedrooms !== undefined ? { bedrooms: { gte: query.bedrooms } } : {}),
    ...(query.bathrooms !== undefined ? { bathrooms: { gte: query.bathrooms } } : {}),
    ...(query.minPrice !== undefined || query.maxPrice !== undefined
      ? { price: { ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}), ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}) } }
      : {}),
    // every requested amenity must be present
    ...(amenities && amenities.length > 0 ? { amenities: { hasEvery: amenities } } : {}),
    ...(and.length > 0 ? { AND: and } : {}),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.property.count({ where }),
    prisma.property.findMany({
      where,
      orderBy: { [query.sortBy]: query.order },
      skip: pagination.skip,
      take: pagination.limit,
      include: {
        category: { select: { id: true, name: true } },
        landlord: { select: { id: true, name: true, ...(options.includeLandlordEmail ? { email: true } : {}) } },
      },
    }),
  ]);

  return { items: await attachRatings(rows), meta: buildMeta(pagination, total) };
};

export const getProperty = async (id: string) => {
  const property = await prisma.property.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true, description: true } },
      landlord: { select: { id: true, name: true, phone: true, createdAt: true } },
      reviews: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { tenant: { select: { id: true, name: true, avatarUrl: true } } },
      },
    },
  });
  if (!property) throw ApiError.notFound('Property not found');

  const stats = await prisma.review.aggregate({
    where: { propertyId: id },
    _avg: { rating: true },
    _count: { _all: true },
  });

  return { ...property, averageRating: roundRating(stats._avg.rating), reviewCount: stats._count._all };
};

/* ------------------------------ landlord actions ------------------------------ */

const assertCategoryExists = async (categoryId: string) => {
  const category = await prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } });
  if (!category) throw ApiError.badRequest('categoryId does not match any category', { code: 'INVALID_CATEGORY' });
};

/** Loads a property and makes sure the landlord owns it (404 if missing, 403 if someone else's). */
const getOwnedProperty = async (id: string, landlordId: string) => {
  const property = await prisma.property.findUnique({ where: { id } });
  if (!property) throw ApiError.notFound('Property not found');
  if (property.landlordId !== landlordId) throw ApiError.forbidden('You can only manage your own properties');
  return property;
};

const normalise = <T extends { amenities?: string[] }>(input: T): T =>
  input.amenities ? { ...input, amenities: [...new Set(input.amenities.map((a) => a.toLowerCase()))] } : input;

export const createProperty = async (landlordId: string, input: CreatePropertyInput) => {
  await assertCategoryExists(input.categoryId);
  return prisma.property.create({
    data: { ...normalise(input), landlordId },
    include: { category: { select: { id: true, name: true } } },
  });
};

export const updateProperty = async (id: string, landlordId: string, input: UpdatePropertyInput) => {
  await getOwnedProperty(id, landlordId);
  if (input.categoryId) await assertCategoryExists(input.categoryId);
  return prisma.property.update({
    where: { id },
    data: normalise(input),
    include: { category: { select: { id: true, name: true } } },
  });
};

export const deleteProperty = async (id: string, landlordId: string) => {
  await getOwnedProperty(id, landlordId);
  const requests = await prisma.rentalRequest.count({ where: { propertyId: id } });
  if (requests > 0) {
    throw ApiError.conflict(
      'This property has rental history and cannot be deleted. Set its status to UNAVAILABLE to hide it instead.',
      { code: 'PROPERTY_HAS_RENTALS' },
    );
  }
  await prisma.property.delete({ where: { id } });
};

/**
 * AVAILABLE <-> UNAVAILABLE toggle. RENTED is controlled by the rental lifecycle (payment activates it,
 * completing the rental releases it), so it can never be set or cleared by hand.
 * Pass `landlordId` to enforce ownership; admins omit it.
 */
export const setAvailability = async (id: string, status: Extract<PropertyStatus, 'AVAILABLE' | 'UNAVAILABLE'>, landlordId?: string) => {
  const property = landlordId ? await getOwnedProperty(id, landlordId) : await prisma.property.findUnique({ where: { id } });
  if (!property) throw ApiError.notFound('Property not found');

  if (property.status === 'RENTED') {
    throw ApiError.conflict('This property has an active rental. Complete the rental before changing availability.', {
      code: 'PROPERTY_RENTED',
    });
  }
  return prisma.property.update({ where: { id }, data: { status } });
};
