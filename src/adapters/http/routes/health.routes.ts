// src/adapters/http/routes/health.routes.ts
// Health check routes - Phase 5: Operations
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../../infrastructure/database/prisma/client.js';
import { env, APP_VERSION } from '../../../infrastructure/config/env.js';

// Track application start time for uptime
const APP_START_TIME = Date.now();

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── GET /health ─────────────────────────────
  // Liveness probe: always returns 200 OK if the process is alive.
  // Used by container orchestrators to know if the app is running.
  fastify.get(
    '/health',
    {
      schema: {
        description:
          'Health check del servidor (liveness probe). Siempre retorna 200 OK si el proceso está vivo.',
        tags: ['Health'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string', example: 'ok' },
              timestamp: { type: 'string', format: 'date-time' },
              uptime: { type: 'number', description: 'Uptime en segundos' },
              environment: { type: 'string', example: 'development' },
              version: { type: 'string', example: '3.0.0' },
              memory: {
                type: 'object',
                properties: {
                  rss_mb: { type: 'number' },
                  heap_used_mb: { type: 'number' },
                  heap_total_mb: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      const mem = process.memoryUsage();
      reply.send({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - APP_START_TIME) / 1000),
        environment: env.NODE_ENV,
        version: APP_VERSION,
        memory: {
          rss_mb: Math.round(mem.rss / 1024 / 1024),
          heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
          heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
        },
      });
    }
  );

  // ─── GET /ready ──────────────────────────────
  // Readiness probe: returns 200 only if all critical services are connected.
  // Returns 503 if the app is not ready to serve traffic.
  fastify.get(
    '/ready',
    {
      schema: {
        description:
          'Readiness check. Retorna 200 si DB y servicios están conectados. ' +
          'Retorna 503 si algún servicio no está disponible.',
        tags: ['Health'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string', example: 'ready' },
              timestamp: { type: 'string', format: 'date-time' },
              version: { type: 'string', example: '3.0.0' },
              services: {
                type: 'object',
                properties: {
                  database: { type: 'string', example: 'connected' },
                  prisma: { type: 'string', example: 'operational' },
                },
              },
              checks: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    status: { type: 'string' },
                    latency_ms: { type: 'number' },
                  },
                },
              },
            },
          },
          503: {
            type: 'object',
            properties: {
              status: { type: 'string', example: 'not ready' },
              timestamp: { type: 'string', format: 'date-time' },
              services: {
                type: 'object',
                properties: {
                  database: { type: 'string', example: 'disconnected' },
                  prisma: { type: 'string', example: 'error' },
                },
              },
              checks: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    status: { type: 'string' },
                    error: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      const checks: Array<{
        name: string;
        status: string;
        latency_ms?: number;
        error?: string;
      }> = [];
      let allHealthy = true;

      // Check 1: Raw SQL query (validates DB connection)
      const dbCheck: { name: string; status: string; latency_ms: number; error?: string } = { name: 'database', status: 'connected', latency_ms: 0 };
      try {
        const dbStart = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        dbCheck.latency_ms = Date.now() - dbStart;
      } catch {
        dbCheck.status = 'disconnected';
        allHealthy = false;
        dbCheck.error = 'Cannot reach PostgreSQL';
      }
      checks.push(dbCheck);

      // Check 2: Prisma operational (validates ORM layer)
      const prismaCheck: { name: string; status: string; latency_ms: number; error?: string } = { name: 'prisma', status: 'operational', latency_ms: 0 };
      try {
        const prismaStart = Date.now();
        await prisma.$queryRaw`SELECT current_database(), version()`;
        prismaCheck.latency_ms = Date.now() - prismaStart;
      } catch {
        prismaCheck.status = 'error';
        allHealthy = false;
        prismaCheck.error = 'Prisma client not operational';
      }
      checks.push(prismaCheck);

      const response = {
        status: allHealthy ? 'ready' : 'not ready',
        timestamp: new Date().toISOString(),
        version: APP_VERSION,
        services: {
          database: dbCheck.status,
          prisma: prismaCheck.status,
        },
        checks,
      };

      reply.status(allHealthy ? 200 : 503).send(response);
    }
  );
}
