// src/infrastructure/logging/logger.ts
// Structured logging with pino - Phase 5: Operations
import pino from "pino";
import { env } from "../config/env.js";

// Create logger based on environment
function createLogger(): pino.Logger {
  // Redactor global: enmascara secretos en cualquier objeto logueado (defensa en
  // profundidad por si un input crudo se filtra a un log). Aplica de forma
  // recursiva a claves conocidas en cualquier nivel del objeto.
  const SENSITIVE_PATHS = [
    "password",
    "*.password",
    "password_hash",
    "passwordHash",
    "token",
    "*.token",
    "accessToken",
    "access_token",
    "refreshToken",
    "refresh_token",
    "authorization",
    "JWT_SECRET",
    "JWT_REFRESH_SECRET",
    "DATABASE_URL",
  ];

  const baseOptions: pino.LoggerOptions = {
    level: env.LOG_LEVEL,
    base: {
      service: "punto-venta-api",
      version: "3.0.0",
    },
    serializers: {
      err: pino.stdSerializers.err,
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
    },
    redact: {
      paths: SENSITIVE_PATHS,
      censor: "[REDACTED]",
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (env.NODE_ENV !== "production") {
    return pino({
      ...baseOptions,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:HH:MM:ss",
          ignore: "pid,hostname,service,version",
        },
      },
    });
  }

  // Production: pure JSON, no transport (structured logs for log aggregators)
  return pino(baseOptions);
}

export const logger = createLogger();

export type Logger = typeof logger;
