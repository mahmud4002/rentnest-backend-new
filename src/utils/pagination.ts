import type { PaginationMeta } from './sendResponse';

export type Pagination = { page: number; limit: number; skip: number };

export const toPagination = (query: { page?: number; limit?: number }): Pagination => {
  const page = query.page && query.page > 0 ? query.page : 1;
  const limit = query.limit && query.limit > 0 ? query.limit : 10;
  return { page, limit, skip: (page - 1) * limit };
};

export const buildMeta = (p: Pagination, total: number): PaginationMeta => ({
  page: p.page,
  limit: p.limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / p.limit)),
});
