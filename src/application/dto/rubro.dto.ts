// src/application/dto/rubro.dto.ts
// Rubro DTOs with Zod validation
import { z } from 'zod';

// Create rubro schema
export const CreateRubroSchema = z.object({
  nombre: z
    .string()
    .min(1, 'Nombre requerido')
    .max(100, 'Nombre máximo 100 caracteres'),
  descripcion: z
    .string()
    .optional(),
  activo: z
    .boolean()
    .default(true),
});

export type CreateRubroInput = z.infer<typeof CreateRubroSchema>;

// Update rubro schema (all fields optional)
export const UpdateRubroSchema = CreateRubroSchema.partial().extend({
  id: z.string().uuid('ID de rubro inválido'),
});

export type UpdateRubroInput = z.infer<typeof UpdateRubroSchema>;

// Rubro ID param
export const RubroIdParamSchema = z.object({
  id: z.string().uuid('ID de rubro inválido'),
});

export type RubroIdParam = z.infer<typeof RubroIdParamSchema>;
