// src/infrastructure/auth/jwt.ts
// JWT token generation and verification
import jwt from 'jsonwebtoken';
import { env, JWT_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN } from '../config/env.js';
import { ok, err, type Result } from 'neverthrow';
import type { Rol } from '../../domain/roles.js';

export interface TokenPayload {
  userId: string;
  nik_usuario: string;
  rol: Rol;
}

// Payload del refresh token: incluye subtype (para no aceptar un access token en
// su lugar) y la versión de revocación (S5). Si la versión del token difiere de
// la versión actual del usuario → sesión revocada (logout, cambio de password,
// desactivación).
export interface RefreshTokenPayload extends TokenPayload {
  subtype: 'refresh';
  version: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

// Generate access token
export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

// Generate refresh token firmado con la versión de revocación actual del usuario
export function generateRefreshToken(payload: TokenPayload, version: number): string {
  const refreshPayload: RefreshTokenPayload = {
    ...payload,
    subtype: 'refresh',
    version,
  };
  return jwt.sign(refreshPayload, env.JWT_REFRESH_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
  });
}

// Generate both tokens
export function generateTokenPair(payload: TokenPayload, version: number): TokenPair {
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload, version),
  };
}

// Verify access token
export function verifyAccessToken(token: string): Result<TokenPayload, Error> {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
    return ok(decoded);
  } catch {
    return err(new Error('Token inválido o expirado'));
  }
}

// Verify refresh token (exige subtype 'refresh' y una `version` numérica)
export function verifyRefreshToken(token: string): Result<RefreshTokenPayload, Error> {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as Record<string, unknown>;
    if (decoded.subtype !== 'refresh' || typeof decoded.version !== 'number') {
      return err(new Error('Refresh token inválido o expirado'));
    }
    // SAFETY: ya validamos decoded.subtype === 'refresh' y typeof
    // decoded.version === 'number' arriba, y jwt.verify() garantiza la firma;
    // por eso el cast a RefreshTokenPayload es seguro (invariante del claim).
    return ok(decoded as unknown as RefreshTokenPayload);
  } catch {
    return err(new Error('Refresh token inválido o expirado'));
  }
}
