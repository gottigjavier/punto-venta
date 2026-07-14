// src/application/dto/usuario.dto.ts
// User management DTOs with Zod validation
import { z } from 'zod';

// Password strength validation
const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/;

// Create user schema (admin only)
export const CreateUsuarioSchema = z.object({
  nombre_usuario: z
    .string()
    .min(1, 'Nombre de usuario requerido')
    .max(100, 'Nombre máximo 100 caracteres'),
  nik_usuario: z
    .string()
    .min(1, 'Nick de usuario requerido')
    .max(50, 'Nick máximo 50 caracteres'),
  password: z
    .string()
    .regex(passwordRegex, 'Contraseña debe tener mínimo 8 caracteres, 1 mayúscula, 1 número y 1 carácter especial'),
  email: z
    .string()
    .email('Email inválido'),
  telefono: z
    .string()
    .max(20, 'Teléfono máximo 20 caracteres')
    .optional(),
  rol: z.enum(['admin', 'gerente', 'despachador']),
  activo: z.boolean().default(true),
});

export type CreateUsuarioInput = z.infer<typeof CreateUsuarioSchema>;

// Update user schema (password optional)
export const UpdateUsuarioSchema = CreateUsuarioSchema.partial().omit({ password: true }).extend({
  id: z.string().uuid('ID de usuario inválido'),
  password: z
    .string()
    .regex(passwordRegex, 'Contraseña debe tener mínimo 8 caracteres, 1 mayúscula, 1 número y 1 carácter especial')
    .optional(),
});

export type UpdateUsuarioInput = z.infer<typeof UpdateUsuarioSchema>;

// User query params for listing
export const UsuarioQuerySchema = z.object({
  search: z.string().optional(),
  rol: z.enum(['admin', 'gerente', 'despachador']).optional(),
  activo: z.coerce.boolean().optional(),
  sort: z.enum(['nombre_usuario', 'nik_usuario', 'email', 'rol', 'created_at']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type UsuarioQueryInput = z.infer<typeof UsuarioQuerySchema>;

// User ID param
export const UsuarioIdParamSchema = z.object({
  id: z.string().uuid('ID de usuario inválido'),
});

export type UsuarioIdParam = z.infer<typeof UsuarioIdParamSchema>;
