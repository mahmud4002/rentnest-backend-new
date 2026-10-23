
import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';
import "dotenv/config";

// dotenv.config({ quiet: true });
dotenv.config({path: path.join(process.cwd(),".env"),
     quiet: true

});
// Treat empty strings in .env (e.g. `STRIPE_SECRET_KEY=`) as "not set".

const optionalString = z
  .string()
  .optional()
  .transform((value) => (value && value.trim() !== '' ? value.trim() : undefined));

const config = z.object({
  // NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  node_env: process.env.node_env as string,
  // PORT: z.coerce.number().int().positive().default(5000),
  // APP_URL: z.string().url().default('http://localhost:5000'),
  app_url : process.env.app_url as string,
  bcrypt_salt_rounds : process.env.bcrypt_salt_rounds,
  port: process.env.PORT as string,

  // DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  database_url:process.env.DATABASE_URL as string,

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters long'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  // BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),

  // STRIPE_SECRET_KEY:process.env.,
  // STRIPE_WEBHOOK_SECRET: optionalString,
  PAYMENT_CURRENCY: z.string().length(3).default('bd').transform((c) => c.toLowerCase()),

    // stripe_product_key: env.STRIPE_PRODUCT_ID as string,
    stripe_secret_key: process.env.STRIPE_SECRET_KEY as string,
    stripe_webhook_secret: process.env.STRIPE_WEBHOOK_SECRET as string,

  ADMIN_NAME: z.string().default('RentNest Admin'),
  ADMIN_EMAIL: z.string().email().default('admin@rentnest.com'),
  ADMIN_PASSWORD: z.string().min(8).default('Admin@12345'),
});

const parsed = config.safeParse(process.env);

if (!parsed.success) {
  const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // Fail fast: a misconfigured server should never start.
  console.error(`Invalid environment configuration:\n${problems}`);
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.node_env === 'production';
