// src/infrastructure/database/transactions.ts
// Primitivas unificadas de blindaje transaccional.
//
// Método del repo: todo read-modify-write que no pueda reducirse a una sola
// sentencia atómica se encierra en una transacción interactiva; se toman locks
// pesimistas (SELECT ... FOR UPDATE) sobre las filas a mutar; las operaciones
// que compiten por un recurso GLOBAL (p.ej. único cierre de caja abierto) se
// serializan con pg_advisory_xact_lock; y los constraints de la DB (CHECK,
// UNIQUE, FK) actúan como red final que físicamente rechaza estados inválidos.
import { Prisma } from "@prisma/client";

// Namespace estable para los advisory locks de este dominio. Half superior fijo
// "P1CF" (Punto de Venta) para evitar colisiones con otros consumidores de la DB.
const NAMESPACE_HI = 0x50314346; // "P1CF"

function advisoryKey(id: number): bigint {
  return (BigInt(NAMESPACE_HI) << 32n) | BigInt(id);
}

// Serializa toda la operación global de cierre de caja: garantiza que dos
// cerrarCaja concurrentes no archiven el mismo conjunto de ventas dos veces.
export const ADVISORY_LOCK_CIERRE_CAJA = advisoryKey(1);

// Toma un advisory lock transaccional (se libera al COMMIT/ROLLBACK). Úsalo para
// operaciones que mutan filas determinadas por un "período" global y no por un id
// único (p.ej. cerrar caja archiva todas las ventas con cierre_caja_id IS NULL).
export async function withAdvisoryXactLock<T>(
  tx: Prisma.TransactionClient,
  key: bigint,
  fn: () => Promise<T>,
): Promise<T> {
  // $executeRaw (no $queryRaw): pg_advisory_xact_lock no devuelve filas y Prisma
  // no puede deserializar su tipo void con $queryRaw (falla contra DB real).
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${key})`;
  return fn();
}

// Reusa la instancia Prisma.TransactionClient tipada por el adapter pg.
export type { Prisma };
