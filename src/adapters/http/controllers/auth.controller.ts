// src/adapters/http/controllers/auth.controller.ts
// Auth HTTP controllers
import type { FastifyRequest, FastifyReply } from "fastify";
import {
  LoginRequestSchema,
  UnlockUserRequestSchema,
} from "../../../application/dto/auth.dto.js";
import {
  loginUseCase,
  refreshTokenUseCase,
  unlockUserUseCase,
  logoutUseCase,
} from "../../../application/use-cases/auth.use-case.js";
import { env } from "../../../infrastructure/config/env.js";
import { sendDomainError } from "../utils/domain-error.js";

// Helper to handle domain errors

// POST /api/v1/auth/login
export async function loginHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsed = LoginRequestSchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.status(400).send({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Datos de entrada inválidos",
        details: parsed.error.flatten().fieldErrors,
      },
    });
  }

  const result = await loginUseCase(parsed.data);

  if (result.isErr()) {
    return sendDomainError(reply, result.error);
  }

  const { tokens, user } = result.value;

  // Set refresh token as httpOnly cookie. Path acotado al prefijo auth para que
  // el navegador lo adjunte tanto en /auth/refresh como en /auth/logout (si el
  // path fuera /auth/refresh, logout no recibiría la cookie y la revocación
  // server-side de S5 no podría ejecutarse).
  reply.setCookie("refreshToken", tokens.refreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/v1/auth",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });

  reply.send({
    success: true,
    data: {
      accessToken: tokens.accessToken,
      user: {
        id: user.id,
        nombre_usuario: user.nombre_usuario,
        nik_usuario: user.nik_usuario,
        email: user.email,
        rol: user.rol,
      },
    },
  });
}

// POST /api/v1/auth/refresh
export async function refreshHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const refreshToken = request.cookies["refreshToken"] as string | undefined;

  // Refrescar: devuelve además un refresh token ROTADO para renovar la cookie
  if (!refreshToken) {
    return reply.status(401).send({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Refresh token requerido",
      },
    });
  }

  const result = await refreshTokenUseCase(refreshToken);

  if (result.isErr()) {
    return sendDomainError(reply, result.error);
  }

  // Rotación (S5): re-setear la cookie con el nuevo refresh token. Path
  // /api/v1/auth (mismo que en login) para que logout la reciba.
  reply.setCookie("refreshToken", result.value.refreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/v1/auth",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });

  reply.send({
    success: true,
    data: {
      accessToken: result.value.accessToken,
    },
  });
}

// POST /api/v1/auth/logout
export async function logoutHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const refreshToken = request.cookies["refreshToken"] as string | undefined;

  // Revoca la sesión del lado servidor (S5): invalida todos los refresh tokens
  // del usuario impactando la versión, no solo borrar la cookie local.
  await logoutUseCase(refreshToken);

  reply.clearCookie("refreshToken", {
    path: "/api/v1/auth",
  });

  reply.send({
    success: true,
    data: { message: "Sesión cerrada exitosamente" },
  });
}

// POST /api/v1/auth/unlock/:userId
export async function unlockHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsed = UnlockUserRequestSchema.safeParse(request.params);

  if (!parsed.success) {
    return reply.status(400).send({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "ID de usuario inválido",
      },
    });
  }

  const result = await unlockUserUseCase(parsed.data.userId);

  if (result.isErr()) {
    return sendDomainError(reply, result.error);
  }

  reply.send({
    success: true,
    data: { message: "Usuario desbloqueado exitosamente" },
  });
}
