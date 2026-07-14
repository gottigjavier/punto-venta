// src/infrastructure/auth/jwt.ts
// JWT token generation and verification
import jwt from 'jsonwebtoken';
import { env, JWT_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN } from '../config/env.js';
import type { Result } from 'neverthrow';
import { ok, err } from 'neverthrow';

export interface TokenPayload {
  userId: string;
  nik_usuario: string;
  rol: string;
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

// Generate refresh token
export function generateRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
  });
}

// Generate both tokens
export function generateTokenPair(payload: TokenPayload): TokenPair {
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  };
}

// Verify access token
export function verifyAccessToken(token: string): Result<TokenPayload, Error> {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
    return ok(decoded);
  } catch (error) {
    return err(new Error('Token inválido o expirado'));
  }
}

// Verify refresh token
export function verifyRefreshToken(token: string): Result<TokenPayload, Error> {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as TokenPayload;
    return ok(decoded);
  } catch (error) {
    return err(new Error('Refresh token inválido o expirado'));
  }
}
