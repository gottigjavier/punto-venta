// src/main.ts
// Application entry point - Phase 5: Operations
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { env, APP_VERSION } from "./infrastructure/config/env.js";
import { logger } from "./infrastructure/logging/logger.js";
import {
  registerSchemas,
  registerSwagger,
} from "./infrastructure/swagger/swagger.js";
import { authRoutes } from "./adapters/http/routes/auth.routes.js";
import { healthRoutes } from "./adapters/http/routes/health.routes.js";
import { productoRoutes } from "./adapters/http/routes/producto.routes.js";
import { proveedorRoutes } from "./adapters/http/routes/proveedor.routes.js";
import { rubroRoutes } from "./adapters/http/routes/rubro.routes.js";
import { usuarioRoutes } from "./adapters/http/routes/usuario.routes.js";
import { stockRoutes } from "./adapters/http/routes/stock.routes.js";
import { loteRoutes } from "./adapters/http/routes/lotes.routes.js";
import { ventaRoutes } from "./adapters/http/routes/venta.routes.js";

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
    // trustProxy ACOTADO (S3): solo confiamos en el nº exacto de proxies de
    // confianza (env TRUST_PROXY_HOPS, default 0 = deshabilitado). El anterior
    // trustProxy: true confiaba en CUALQUIER hop y permitía falsificar
    // X-Forwarded-For para evadir el rate-limit por IP y el lockout. Configurar
    // el valor real por despliegue: directo = 0, detrás de proxy (Render/Nginx)
    // = 1 (el nº exacto de hops).
    trustProxy: env.TRUST_PROXY_HOPS > 0 ? env.TRUST_PROXY_HOPS : false,
  });

  // ===== Performance: Request timing hook =====
  fastify.addHook("onResponse", (request, reply, done) => {
    const responseTime = Number(reply.getHeader("x-response-time")) || 0;
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
      userAgent: request.headers["user-agent"],
      ip: request.ip,
    };

    if (reply.statusCode >= 500) {
      logger.error(logData, "Request completed with server error");
    } else if (reply.statusCode >= 400) {
      logger.warn(logData, "Request completed with client error");
    } else if (responseTime > 200) {
      logger.warn(logData, "Slow request detected");
    } else {
      logger.info(logData, "Request completed");
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

  // Rate limiting global (SE3): activo por defecto en production y staging
  // (entornos que suelen usar DB real/seed y quedaban sin protección), y
  // deshabilitado en development/test para facilitar el testing. El flag
  // explícito RATE_LIMIT_ENABLED=true|false — validado en env.ts — sobreescribe
  // el default por entorno; undefined (no seteado) → se decide por NODE_ENV.
  const rateLimitEnabled =
    env.RATE_LIMIT_ENABLED ??
    (env.NODE_ENV === "production" || env.NODE_ENV === "staging");

  if (rateLimitEnabled) {
    await fastify.register(rateLimit, {
      max: env.RATE_LIMIT_MAX_REQUESTS * 10,
      timeWindow: env.RATE_LIMIT_WINDOW_MS,
      errorResponseBuilder: (_request, context) => ({
        success: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: `Demasiadas peticiones. Intenta de nuevo en ${Math.ceil(context.ttl / 1000)}s`,
          details: {
            limit: context.max,
            retryAfter: Math.ceil(context.ttl / 1000),
          },
        },
      }),
      keyGenerator: (request) => {
        return request.ip ?? request.socket.remoteAddress ?? "unknown";
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

  // Cabeceras de seguridad (S6): nosniff, frameguard, referrer-policy, HSTS.
  // La CSP la define la SPA en su propio host; acá se deja off para no chocar
  // con la CSP estática que ya aplica swagger-ui en /docs.
  await fastify.register(helmet, {
    contentSecurityPolicy: false,
  });

  // Schemas compartidos (los routes los referencian por `$ref`, ej.
  // "LoginResponse") — DEBEN registrarse en todos los entornos, incluido
  // producción, o la serialización de rutas como /login explota con
  // FST_ERR_SCH_SERIALIZATION_BUILD. Es independiente de exponer Swagger.
  registerSchemas(fastify);

  // Swagger/OpenAPI documentation — NO se expone en producción (S7): la doc
  // interactiva en prod filtra el contrato y habilita pruebas no deseadas.
  if (env.NODE_ENV !== "production") {
    await registerSwagger(fastify);
  }

  // ===== Plugin de métricas =====
  fastify.get("/metrics", async (request, reply) => {
    // S7: /metrics protegido — requiere Bearer token si METRICS_TOKEN está
    // configurado; sin token y en producción, no se expone (403).
    if (env.METRICS_TOKEN) {
      if (request.headers.authorization !== `Bearer ${env.METRICS_TOKEN}`) {
        return reply.status(401).send({ error: "Unauthorized" });
      }
    } else if (env.NODE_ENV === "production") {
      return reply
        .status(403)
        .send({ error: "Metrics not enabled in production" });
    }

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
          : "0%",
      avg_response_time_ms: avgResponseTime,
      timestamp: new Date().toISOString(),
    };
  });

  // ===== Register routes =====
  await fastify.register(healthRoutes);
  await fastify.register(authRoutes, { prefix: "/api/v1/auth" });
  await fastify.register(productoRoutes, { prefix: "/api/v1/productos" });
  await fastify.register(proveedorRoutes, { prefix: "/api/v1/proveedores" });
  await fastify.register(rubroRoutes, { prefix: "/api/v1/rubros" });
  await fastify.register(usuarioRoutes, { prefix: "/api/v1/usuarios" });
  await fastify.register(stockRoutes, { prefix: "/api/v1/stock" });
  await fastify.register(loteRoutes, { prefix: "/api/v1/lotes" });
  await fastify.register(ventaRoutes, { prefix: "/api/v1/ventas" });

  // ===== Start server =====
  try {
    const port = env.PORT ?? env.API_PORT ?? 3001;
    await fastify.listen({ port, host: "0.0.0.0" });
    logger.info(`🚀 Server running on port ${port} (v${APP_VERSION})`);
    logger.info(`📊 Health: http://localhost:${port}/health`);
    logger.info(`🔍 Readiness: http://localhost:${port}/ready`);
    logger.info(`📈 Metrics: http://localhost:${port}/metrics`);
    if (env.NODE_ENV !== "production") {
      logger.info(`📚 API Docs: http://localhost:${port}/docs`);
    }
    logger.info(`🔑 Auth: http://localhost:${port}/api/v1/auth/login`);
    logger.info(`📦 Productos: http://localhost:${port}/api/v1/productos`);
    logger.info(`🏢 Proveedores: http://localhost:${port}/api/v1/proveedores`);
    logger.info(`📂 Rubros: http://localhost:${port}/api/v1/rubros`);
    logger.info(`👤 Usuarios: http://localhost:${port}/api/v1/usuarios`);
    logger.info(`📈 Stock: http://localhost:${port}/api/v1/stock`);
    logger.info(`📦 Lotes: http://localhost:${port}/api/v1/lotes`);
    logger.info(`💰 Ventas: http://localhost:${port}/api/v1/ventas`);
  } catch (error) {
    logger.error(error, "Error starting server");
    process.exit(1);
  }
}

bootstrap();
