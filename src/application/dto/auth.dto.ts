// src/application/dto/auth.dto.ts
// Auth DTOs with Zod validation
import { z } from 'zod';

// Login request
export const LoginRequestSchema = z.object({
  nik_usuario: z.string().min(1, 'Nick de usuario requerido').max(50),
  password: z.string().min(1, 'Contraseña requerida'),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

// Login response
export interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    nombre_usuario: string;
    nik_usuario: string;
    email: string;
    rol: string;
  };
}

// Refresh token response
export interface RefreshResponse {
  accessToken: string;
}

// Unlock user request
export const UnlockUserRequestSchema = z.object({
  userId: z.string().uuid('ID de usuario inválido'),
});

export type UnlockUserRequest = z.infer<typeof UnlockUserRequestSchema>;
