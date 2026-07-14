// src/adapters/http/middleware/auth.middleware.ts
// Authentication and authorization middleware
import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../../../infrastructure/auth/jwt.js';
import type { TokenPayload } from '../../../infrastructure/auth/jwt.js';

// Extend FastifyRequest to include user
declare module 'fastify' {
  interface FastifyRequest {
    user?: TokenPayload;
  }
}

// Authentication middleware
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Token de acceso requerido',
      },
    });
  }

  const token = authHeader.substring(7);
  const result = verifyAccessToken(token);

  if (result.isErr()) {
    return reply.status(401).send({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: result.error.message,
      },
    });
  }

  request.user = result.value;
}

// Authorization middleware factory
export function authorize(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    // First ensure user is authenticated
    await authenticate(request, reply);

    // If reply already sent (auth failed), return
    if (reply.sent) return;

    // Check if user has required role
    if (!request.user || !roles.includes(request.user.rol)) {
      return reply.status(403).send({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'No tienes permisos para realizar esta acción',
        },
      });
    }
  };
}
