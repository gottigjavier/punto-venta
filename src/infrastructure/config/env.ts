// src/infrastructure/config/env.ts
// Environment configuration with validation
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),

  // Server
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().optional(),
  API_PORT: z.coerce.number().default(3001),

  // Frontend
  FRONTEND_URL: z.string().url(),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(3600000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(10),

  // Account Lockout
  MAX_LOGIN_ATTEMPTS: z.coerce.number().default(3),
  LOCKOUT_DURATION_MINUTES: z.coerce.number().default(30),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Variables de entorno inválidas:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

// Derived constants
export const JWT_EXPIRES_IN = '15m';
export const JWT_REFRESH_EXPIRES_IN = '7d';
export const BCRYPT_SALT_ROUNDS = 12;
export const APP_VERSION = '3.0.0';
