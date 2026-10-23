import app from './app';
import { env } from './config';
import { prisma } from './lib/prisma';

const server = app.listen(env.PORT, () => {
  console.log(`RentNest API running on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  if (!env.STRIPE_SECRET_KEY) {
    console.warn('STRIPE_SECRET_KEY is not set - payment endpoints will respond with 503 until it is configured.');
  }
});

const shutdown = (signal: string) => {
  console.log(`${signal} received, shutting down gracefully...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  // Force exit if connections refuse to close.
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
