import { z } from 'zod';
import { msg, paginationQuery } from '../../utils/zod';

export const listUsersQuery = paginationQuery.extend({
  role: z.enum(['TENANT', 'LANDLORD', 'ADMIN'], msg('role', 'TENANT, LANDLORD or ADMIN')).optional(),
  status: z.enum(['ACTIVE', 'BANNED'], msg('status', 'ACTIVE or BANNED')).optional(),
  search: z.string().trim().max(100).optional(),
});

export const updateUserStatusBody = z.object({
  status: z.enum(['ACTIVE', 'BANNED'], msg('status', 'ACTIVE or BANNED')),
});

export type ListUsersQuery = z.infer<typeof listUsersQuery>;
