// src/application/dto/auth.dto.ts
// Auth DTOs with Zod validation
import { z } from "zod";

// Login request
export const LoginRequestSchema = z.object({
  nik_usuario: z.string().min(1, "Nick de usuario requerido").max(50),
  password: z.string().min(1, "Contraseña requerida"),
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
  userId: z.string().uuid("ID de usuario inválido"),
});

export type UnlockUserRequest = z.infer<typeof UnlockUserRequestSchema>;

// Bootstrap: creación del primer administrador (solo si no existe ningún usuario).
// Misma política de contraseña fuerte que el alta normal de usuarios; el rol se
// fuerza a 'admin' en el server (el cliente no puede elegirlo).
const bootstrapPasswordRegex =
  /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/;

export const BootstrapSchema = z.object({
  nombre_usuario: z
    .string()
    .min(1, "Nombre de usuario requerido")
    .max(100, "Nombre máximo 100 caracteres"),
  nik_usuario: z
    .string()
    .min(1, "Nick de usuario requerido")
    .max(50, "Nick máximo 50 caracteres"),
  email: z.string().email("Email inválido"),
  password: z
    .string()
    .regex(
      bootstrapPasswordRegex,
      "Contraseña debe tener mínimo 8 caracteres, 1 mayúscula, 1 número y 1 carácter especial",
    ),
  telefono: z.string().max(20, "Teléfono máximo 20 caracteres").optional(),
});

export type BootstrapInput = z.infer<typeof BootstrapSchema>;

export interface BootstrapStatus {
  needsBootstrap: boolean;
}
