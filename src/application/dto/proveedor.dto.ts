// src/application/dto/proveedor.dto.ts
// Supplier DTOs with Zod validation
import { z } from 'zod';

// CUIT format: XX-XXXXXXXX-X
const cuitRegex = /^\d{2}-\d{8}-\d{1}$/;

// Create supplier schema
export const CreateProveedorSchema = z.object({
  razon_social: z
    .string()
    .min(1, 'Razón social requerida')
    .max(200, 'Razón social máxima 200 caracteres'),
  representante: z
    .string()
    .max(150, 'Representante máximo 150 caracteres')
    .optional(),
  cuit: z
    .string()
    .regex(cuitRegex, 'CUIT inválido. Formato: XX-XXXXXXXX-X')
    .optional(),
  direccion_postal: z
    .string()
    .optional(),
  email: z
    .string()
    .email('Email inválido')
    .optional(),
  telefonos: z
    .array(z.string())
    .optional(),
});

export type CreateProveedorInput = z.infer<typeof CreateProveedorSchema>;

// Update supplier schema (all fields optional)
export const UpdateProveedorSchema = CreateProveedorSchema.partial().extend({
  id: z.string().uuid('ID de proveedor inválido'),
});

export type UpdateProveedorInput = z.infer<typeof UpdateProveedorSchema>;

// Supplier query params for listing
export const ProveedorQuerySchema = z.object({
  search: z.string().optional(),
  sort: z.enum(['razon_social', 'cuit', 'created_at']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ProveedorQueryInput = z.infer<typeof ProveedorQuerySchema>;

// Supplier ID param
export const ProveedorIdParamSchema = z.object({
  id: z.string().uuid('ID de proveedor inválido'),
});

export type ProveedorIdParam = z.infer<typeof ProveedorIdParamSchema>;
