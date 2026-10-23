import { PrismaClient } from '@prisma/client';
import { isProduction } from '../config';

// Re-use one client across hot reloads and serverless invocations to avoid exhausting DB connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProduction ? ['error'] : ['warn', 'error'],
  });

globalForPrisma.prisma = prisma;
