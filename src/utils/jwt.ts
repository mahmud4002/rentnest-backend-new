import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../config';

export type TokenPayload = { sub: string; role: Role };

export const signToken = (payload: TokenPayload): string =>
  jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'] });

/** Throws JsonWebTokenError / TokenExpiredError, which the global error handler maps to 401. */
export const verifyToken = (token: string): TokenPayload & JwtPayload =>
  jwt.verify(token, env.JWT_SECRET) as TokenPayload & JwtPayload;
