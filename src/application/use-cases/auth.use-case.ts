// src/application/use-cases/auth.use-case.ts
// Authentication use cases
import type { Result } from "neverthrow";
import { ok, err } from "neverthrow";
import { prisma } from "../../infrastructure/database/prisma/client.js";
import { verifyPassword } from "../../infrastructure/auth/password.js";
import { hashPassword } from "../../infrastructure/auth/password.js";
import {
  generateTokenPair,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../../infrastructure/auth/jwt.js";
import type { TokenPayload, TokenPair } from "../../infrastructure/auth/jwt.js";
import { env } from "../../infrastructure/config/env.js";
import type { BootstrapInput } from "../dto/auth.dto.js";
import type { DomainError } from "../../shared/types/result.js";
import { conflictError } from "../../shared/types/result.js";
import type { UsuarioSafe } from "../../domain/entities/usuario.js";
import { logger } from "../../infrastructure/logging/logger.js";

interface LoginInput {
  nik_usuario: string;
  password: string;
}

interface LoginResult {
  tokens: TokenPair;
  user: UsuarioSafe;
}

// Login use case
export async function loginUseCase(
  input: LoginInput,
): Promise<Result<LoginResult, DomainError>> {
  const { nik_usuario, password } = input;

  // Find user
  const user = await prisma.usuario.findUnique({
    where: { nik_usuario },
  });

  // Respuesta de login UNIFORME (S4): frente a cualquier fallo — usuario no
  // existe, cuenta bloqueada, cuenta inactiva o contraseña inválida — se retorna
  // el mismo error genérico, para no enumerar cuentas ni revelar su estado.
  // El lockout y el conteo de intentos siguen operando internamente; el ataque
  // de bloqueo (DoS) se mitiga con el rate-limit por IP específico de /login.
  const credencialesInvalidas = (): Result<LoginResult, DomainError> =>
    err({ code: "INVALID_CREDENTIALS", message: "Credenciales inválidas" });

  if (!user) {
    return credencialesInvalidas();
  }

  // Cuenta bloqueada: se evalúa pero NO se revela el estado ni el lockedUntil.
  if (user.bloqueado_hasta && user.bloqueado_hasta > new Date()) {
    return credencialesInvalidas();
  }

  // Cuenta inactiva: mismo error genérico.
  if (!user.activo) {
    return credencialesInvalidas();
  }

  // Verify password
  const isPasswordValid = await verifyPassword(password, user.password_hash);

  if (!isPasswordValid) {
    // Incremento atómico (anti-TOCTOU, Q6): el contador se incrementa en BD con
    // `{ increment: 1 }` en lugar de leer user.intentos_fallidos y volver a
    // escribir (dos logins concurrentes con password mal podrían pisarse y
    // evadir el lockout).
    await prisma.usuario.update({
      where: { id: user.id },
      data: { intentos_fallidos: { increment: 1 } },
    });

    // Evaluar el bloqueo con el valor recién incrementado para no decidir sobre
    // un snapshot viejo.
    const after = await prisma.usuario.findUnique({ where: { id: user.id } });
    if (
      after &&
      after.intentos_fallidos >= env.MAX_LOGIN_ATTEMPTS &&
      !after.bloqueado_hasta
    ) {
      const lockUntil = new Date(
        Date.now() + env.LOCKOUT_DURATION_MINUTES * 60 * 1000,
      );
      await prisma.usuario.update({
        where: { id: user.id },
        data: { bloqueado_hasta: lockUntil },
      });
      logger.warn(
        {
          userId: user.id,
          nik_usuario: user.nik_usuario,
          attempts: after.intentos_fallidos,
          lockedUntil: lockUntil,
        },
        "Cuenta bloqueada por intentos fallidos",
      );
    }

    return credencialesInvalidas();
  }

  // Reset failed attempts on successful login
  if (user.intentos_fallidos > 0 || user.bloqueado_hasta) {
    await prisma.usuario.update({
      where: { id: user.id },
      data: {
        intentos_fallidos: 0,
        bloqueado_hasta: null,
      },
    });
  }

  // Generate tokens firmados con la versión de revocación actual (S5)
  const userPayload: TokenPayload = {
    userId: user.id,
    nik_usuario: user.nik_usuario,
    rol: user.rol,
  };
  const tokens = generateTokenPair(userPayload, user.refresh_token_version);

  // Return safe user (without password)
  const { password_hash: _, ...safeUser } = user;

  logger.info(
    { userId: user.id, nik_usuario: user.nik_usuario },
    "Login exitoso",
  );

  return ok({
    tokens,
    user: safeUser as UsuarioSafe,
  });
}

// Refresh token use case (rotación + revocación por versión, S5)
export async function refreshTokenUseCase(
  refreshToken: string,
): Promise<Result<{ accessToken: string; refreshToken: string }, DomainError>> {
  const payload = verifyRefreshToken(refreshToken);

  if (payload.isErr()) {
    return err({
      code: "UNAUTHORIZED",
      message: "Refresh token inválido",
    });
  }

  const claim = payload.value;

  // Verify user still exists and is active
  const user = await prisma.usuario.findUnique({
    where: { id: claim.userId },
  });

  if (!user || !user.activo) {
    return err({
      code: "UNAUTHORIZED",
      message: "Usuario no encontrado o inactivo",
    });
  }

  // Revocación por versión: si el token trae una versión distinta a la actual,
  // la sesión fue revocada (logout, cambio de password, desactivación).
  if (claim.version !== user.refresh_token_version) {
    return err({
      code: "UNAUTHORIZED",
      message: "Sesión revocada",
    });
  }

  const basePayload: TokenPayload = {
    userId: user.id,
    nik_usuario: user.nik_usuario,
    rol: user.rol,
  };

  // Rotación: se emiten access y refresh NUEVOS con la versión actual. El refresh
  // se renueva en cookie; se mantiene la misma versión (multi-tab compatible,
  // no single-use sobre la cookie compartida).
  return ok({
    accessToken: generateAccessToken(basePayload),
    refreshToken: generateRefreshToken(basePayload, user.refresh_token_version),
  });
}

// Logout: revoca todos los refresh tokens del usuario incrementando la versión.
// Así un refresh token robado/emitido antes queda invalidado aunque la cookie
// no se borrara del lado del atacante.
export async function logoutUseCase(
  refreshToken?: string,
): Promise<Result<{ success: boolean }, DomainError>> {
  if (!refreshToken) {
    return ok({ success: true });
  }

  const payload = verifyRefreshToken(refreshToken);

  if (payload.isOk()) {
    try {
      await prisma.usuario.update({
        where: { id: payload.value.userId },
        data: {
          refresh_token_version: { increment: 1 },
        },
      });
      logger.info(
        { userId: payload.value.userId },
        "Logout: refresh tokens revocados",
      );
    } catch (error) {
      // R4-2: nunca lanzar unhandled rejection por un fallo transitorio de BD.
      // El logout local (borrar la cookie) se completa igual; la revocación
      // server-side es best-effort y el token vence en JWT_REFRESH_EXPIRES_IN.
      logger.error(
        { userId: payload.value.userId, err: error },
        "Logout: fallo al revocar refresh tokens en BD",
      );
    }
  }

  return ok({ success: true });
}

// Unlock user use case (admin only)
export async function unlockUserUseCase(
  userId: string,
): Promise<Result<{ success: boolean }, DomainError>> {
  const user = await prisma.usuario.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return err({
      code: "NOT_FOUND",
      message: "Usuario no encontrado",
      resource: "Usuario",
    });
  }

  await prisma.usuario.update({
    where: { id: userId },
    data: {
      intentos_fallidos: 0,
      bloqueado_hasta: null,
    },
  });

  logger.info(
    { userId, nik_usuario: user.nik_usuario },
    "Usuario desbloqueado",
  );

  return ok({ success: true });
}

// ---------------------------------------------------------------------------
// Bootstrap (SE1): creación del primer administrador.
// Solo puede ejecutarse cuando la tabla de usuarios está vacía. Fuerza el rol
// 'admin' y emite los mismos tokens que /login para iniciar sesión de inmediato.
// ---------------------------------------------------------------------------

async function bootstrapNeedsSetup(): Promise<boolean> {
  const count = await prisma.usuario.count();
  return count === 0;
}

interface BootstrapResult {
  tokens: TokenPair;
  user: UsuarioSafe;
}

export async function bootstrapStatusUseCase(): Promise<
  Result<{ needsBootstrap: boolean }, DomainError>
> {
  try {
    const needsBootstrap = await bootstrapNeedsSetup();
    return ok({ needsBootstrap });
  } catch (error) {
    logger.error({ error }, "Error al consultar estado de bootstrap");
    return err({
      code: "DATABASE_ERROR",
      message: "Error al consultar estado de bootstrap",
    });
  }
}

export async function bootstrapUseCase(
  input: BootstrapInput,
): Promise<Result<BootstrapResult, DomainError>> {
  try {
    // Transacción: revalida dentro de la misma tx que NO exista ningún usuario
    // (anti-carrera: dos pestañas/instancias no pueden crear dos admins).
    const result = await prisma.$transaction(async (tx) => {
      const count = await tx.usuario.count();
      if (count > 0) {
        // El setup ya se completó. Señalar con un resultado tipado de negocio.
        return { type: "already" as const };
      }

      const passwordHash = await hashPassword(input.password);
      const usuario = await tx.usuario.create({
        data: {
          nombre_usuario: input.nombre_usuario,
          nik_usuario: input.nik_usuario,
          password_hash: passwordHash,
          email: input.email,
          telefono: input.telefono ?? null,
          rol: "admin", // Fuerza admin: el cliente no elige el rol.
          activo: true,
        },
      });
      return { type: "created" as const, usuario };
    });

    if (result.type === "already") {
      return err(
        conflictError(
          "Bootstrap",
          "El sistema ya tiene usuarios. El setup inicial solo puede ejecutarse una vez.",
        ),
      );
    }

    const usuario = result.usuario;

    // Emitir tokens como en /login (S5: firmados con refresh_token_version).
    const userPayload: TokenPayload = {
      userId: usuario.id,
      nik_usuario: usuario.nik_usuario,
      rol: usuario.rol,
    };
    const tokens = generateTokenPair(
      userPayload,
      usuario.refresh_token_version,
    );

    const { password_hash: _, ...safeUser } = usuario;

    logger.info(
      {
        userId: usuario.id,
        nik_usuario: usuario.nik_usuario,
        rol: usuario.rol,
      },
      "Setup inicial completado: primer administrador creado",
    );

    return ok({ tokens, user: safeUser as UsuarioSafe });
  } catch (error) {
    logger.error({ error }, "Error al crear el administrador inicial");
    return err({
      code: "DATABASE_ERROR",
      message: "Error al crear el administrador inicial",
    });
  }
}
