// src/main.ts
// Application entry point - Phase 5: Operations
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { env, APP_VERSION } from './infrastructure/config/env.js';
import { logger } from './infrastructure/logging/logger.js';
// import { registerSwagger } from './infrastructure/swagger/swagger.js';
import { authRoutes } from './adapters/http/routes/auth.routes.js';
import { healthRoutes } from './adapters/http/routes/health.routes.js';
import { productoRoutes } from './adapters/http/routes/producto.routes.js';
import { proveedorRoutes } from './adapters/http/routes/proveedor.routes.js';
import { rubroRoutes } from './adapters/http/routes/rubro.routes.js';
import { usuarioRoutes } from './adapters/http/routes/usuario.routes.js';
import { stockRoutes } from './adapters/http/routes/stock.routes.js';
import { ventaRoutes } from './adapters/http/routes/venta.routes.js';

// Performance metrics in memory
const metrics = {
  requestCount: 0,
  errorCount: 0,
  totalResponseTime: 0,
  startTime: Date.now(),
};

async function bootstrap(): Promise<void> {
  const fastify = Fastify({
    logger: {
      level: env.LOG_LEVEL,
    },
    trustProxy: true,
  });

  // ===== Performance: Request timing hook =====
  fastify.addHook('onResponse', (request, reply, done) => {
    const responseTime = Number(reply.getHeader('x-response-time')) || 0;
    metrics.requestCount++;
    metrics.totalResponseTime += responseTime;

    if (reply.statusCode >= 400) {
      metrics.errorCount++;
    }

    // Structured request logging (method, path, status, duration)
    const logData = {
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: `${responseTime}ms`,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    };

    if (reply.statusCode >= 500) {
      logger.error(logData, 'Request completed with server error');
    } else if (reply.statusCode >= 400) {
      logger.warn(logData, 'Request completed with client error');
    } else if (responseTime > 200) {
      logger.warn(logData, 'Slow request detected');
    } else {
      logger.info(logData, 'Request completed');
    }

    done();
  });

  // ===== Plugins de performance =====

  // Compresión HTTP deshabilitada: fast-json-stringify en modo streaming
  // cierra el stream antes de que @fastify/compress complete la compresión
  // (ERR_STREAM_PREMATURE_CLOSE). En producción, usar reverse proxy (Nginx/Caddy).
  // await fastify.register(compress, {
  //   encodings: ['gzip', 'deflate', 'br'],
  //   threshold: 1024,
  // });

  // Rate limiting global (deshabilitado en desarrollo para facilitar testing)
  if (env.NODE_ENV === 'production') {
    await fastify.register(rateLimit, {
      max: env.RATE_LIMIT_MAX_REQUESTS * 10,
      timeWindow: env.RATE_LIMIT_WINDOW_MS,
      errorResponseBuilder: (_request, context) => ({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Demasiadas peticiones. Intenta de nuevo en ${Math.ceil(context.ttl / 1000)}s`,
          details: {
            limit: context.max,
            retryAfter: Math.ceil(context.ttl / 1000),
          },
        },
      }),
      keyGenerator: (request) => {
        return request.ip ?? request.socket.remoteAddress ?? 'unknown';
      },
    });
  }

  // CORS
  await fastify.register(cors, {
    origin: env.FRONTEND_URL,
    credentials: true,
  });

  // Cookies
  await fastify.register(cookie);

  // Swagger/OpenAPI documentation (solo en desarrollo)
  // Temporarily disabled due to schema validation issues
  // if (env.NODE_ENV !== 'production') {
  //   await registerSwagger(fastify);
  // }

  // ===== Plugin de métricas =====
  fastify.get('/metrics', async () => {
    const uptime = Math.floor((Date.now() - metrics.startTime) / 1000);
    const avgResponseTime =
      metrics.requestCount > 0
        ? Math.round(metrics.totalResponseTime / metrics.requestCount)
        : 0;

    return {
      uptime_seconds: uptime,
      total_requests: metrics.requestCount,
      error_requests: metrics.errorCount,
      error_rate:
        metrics.requestCount > 0
          ? `${((metrics.errorCount / metrics.requestCount) * 100).toFixed(2)}%`
          : '0%',
      avg_response_time_ms: avgResponseTime,
      timestamp: new Date().toISOString(),
    };
  });

  // ===== Register routes =====
  await fastify.register(healthRoutes);
  await fastify.register(authRoutes, { prefix: '/api/v1/auth' });
  await fastify.register(productoRoutes, { prefix: '/api/v1/productos' });
  await fastify.register(proveedorRoutes, { prefix: '/api/v1/proveedores' });
  await fastify.register(rubroRoutes, { prefix: '/api/v1/rubros' });
  await fastify.register(usuarioRoutes, { prefix: '/api/v1/usuarios' });
  await fastify.register(stockRoutes, { prefix: '/api/v1/stock' });
  await fastify.register(ventaRoutes, { prefix: '/api/v1/ventas' });

  // ===== Start server =====
  try {
    await fastify.listen({ port: env.API_PORT, host: '0.0.0.0' });
    logger.info(`🚀 Server running on port ${env.API_PORT} (v${APP_VERSION})`);
    logger.info(`📊 Health: http://localhost:${env.API_PORT}/health`);
    logger.info(`🔍 Readiness: http://localhost:${env.API_PORT}/ready`);
    logger.info(`📈 Metrics: http://localhost:${env.API_PORT}/metrics`);
    if (env.NODE_ENV !== 'production') {
      logger.info(`📚 API Docs: http://localhost:${env.API_PORT}/docs`);
    }
    logger.info(`🔑 Auth: http://localhost:${env.API_PORT}/api/v1/auth/login`);
    logger.info(`📦 Productos: http://localhost:${env.API_PORT}/api/v1/productos`);
    logger.info(`🏢 Proveedores: http://localhost:${env.API_PORT}/api/v1/proveedores`);
    logger.info(`📂 Rubros: http://localhost:${env.API_PORT}/api/v1/rubros`);
    logger.info(`👤 Usuarios: http://localhost:${env.API_PORT}/api/v1/usuarios`);
    logger.info(`📈 Stock: http://localhost:${env.API_PORT}/api/v1/stock`);
    logger.info(`💰 Ventas: http://localhost:${env.API_PORT}/api/v1/ventas`);
  } catch (error) {
    logger.error(error, 'Error starting server');
    process.exit(1);
  }
}

bootstrap();
