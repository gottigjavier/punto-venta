// src/domain/roles.ts
// Canonical application roles — single source of truth.
// Mirrors the Prisma `Rol` enum (prisma/schema.prisma): admin | gerente | despachador.
export const ROLES = ['admin', 'gerente', 'despachador'] as const;
export type Rol = (typeof ROLES)[number];