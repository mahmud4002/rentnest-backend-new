import type { Role, UserStatus } from '@prisma/client';

declare global {
  namespace Express {
    /** The authenticated user attached by the `authenticate` middleware. */
    interface AuthUser {
      id: string;
      name: string;
      email: string;
      role: Role;
      status: UserStatus;
    }

    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
