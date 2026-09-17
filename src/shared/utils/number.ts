// src/shared/utils/number.ts
// Shared numeric helpers (Q3). toNumber/round2 were byte-identical across
// several use-cases; centralizing removes the duplication and drift risk.
//
// Patrón dinero (QC5, reporte 26/09): los cálculos de montos (sumas, restas,
// agregados, promedios ponderados) corren en Decimal (decimal.js vía
// Prisma.Decimal) para NO meter floats en aritmética de dinero. La conversión a
// number ocurre UNA sola vez, en el borde (mapeo final a DTO/respuesta), con
// toNumber(). `toDecimal()` centraliza la creación de Decimal desde unknown
// (string JSON de pg, number, o Decimal de Prisma).
import { Prisma } from "@prisma/client";

/**
 * Convierte un valor `unknown` a Prisma.Decimal para cálculos de dinero.
 * Soporta: Prisma.Decimal (ya lo está), string (lo que pg devuelve para
 * numeric en $queryRaw), y number. Nunca devuelve null: 0 como fallback.
 */
export function toDecimal(val: unknown): Prisma.Decimal {
  if (val instanceof Prisma.Decimal) return val;
  if (typeof val === "number" || typeof val === "string") {
    return new Prisma.Decimal(val);
  }
  if (val && typeof val === "object" && "toString" in val) {
    return new Prisma.Decimal(String(val));
  }
  return new Prisma.Decimal(0);
}

export function toNumber(val: unknown): number {
  if (typeof val === "number") return val;
  if (typeof val === "string") return parseFloat(val);
  if (val && typeof val === "object" && "toNumber" in val) {
    return (val as { toNumber: () => number }).toNumber();
  }
  return 0;
}
