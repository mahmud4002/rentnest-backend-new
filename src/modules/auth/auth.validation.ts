import { z } from 'zod';
import { msg } from '../../utils/zod';

export const emailSchema = z
  .string(msg('Email', 'a string'))
  .trim()
  .toLowerCase()
  .pipe(z.email('Email must be a valid email address'));

export const passwordSchema = z
  .string(msg('Password', 'a string'))
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Za-z]/, 'Password must contain at least one letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

const nameSchema = z
  .string(msg('Name', 'a string'))
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(100, 'Name must be at most 100 characters');

const phoneSchema = z
  .string(msg('Phone', 'a string'))
  .trim()
  .regex(/^\+?[0-9\s-]{7,20}$/, 'Phone must be a valid phone number (7-20 digits, optional leading +)');

export const registerBody = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(['TENANT', 'LANDLORD'], msg('Role', 'either TENANT or LANDLORD')),
  phone: phoneSchema.optional(),
});

export const loginBody = z.object({
  email: emailSchema,
  password: z.string(msg('Password', 'a string')).min(1, 'Password is required'),
});

export const updateProfileBody = z
  .object({
    name: nameSchema.optional(),
    phone: phoneSchema.optional(),
    avatarUrl: z.url('avatarUrl must be a valid URL').max(500).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one field to update' });

export const changePasswordBody = z
  .object({
    currentPassword: z.string(msg('currentPassword', 'a string')).min(1, 'currentPassword is required'),
    newPassword: passwordSchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: 'newPassword must be different from currentPassword',
    path: ['newPassword'],
  });

export type RegisterInput = z.infer<typeof registerBody>;
export type LoginInput = z.infer<typeof loginBody>;
export type UpdateProfileInput = z.infer<typeof updateProfileBody>;
export type ChangePasswordInput = z.infer<typeof changePasswordBody>;
