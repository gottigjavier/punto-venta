// src/shared/utils/cursor.ts
// Cursor de paginación keyset (EF3, reporte 26/09).
//
// El token es OPACO para el client: JSON { c: ISO string | null, i: id } en
// base64url. El client solo lo recibe como `next_cursor` y lo devuelve tal cual
// en el siguiente request; nunca debe interpretarlo ni construirlo a mano.
// `c` es null únicamente para columnas de orden nullable
// (CierreCaja.fecha_cierre); en columnas NOT NULL (Venta.created_at,
// MovimientoCaja.created_at) el use-case lo rechaza como cursor inválido.

export interface CursorKeyset {
  /** Fecha de la columna de orden. null solo para columnas nullable. */
  createdAt: Date | null;
  /** Id de la fila límite (tiebreaker determinístico ante empates de fecha). */
  id: string;
}

export function encodeCursor(createdAt: Date | null, id: string): string {
  const payload = JSON.stringify({
    c: createdAt ? createdAt.toISOString() : null,
    i: id,
  });
  return Buffer.from(payload, "utf8").toString("base64url");
}

export function decodeCursor(raw: string): CursorKeyset | null {
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as { c?: unknown; i?: unknown };
    if (typeof parsed.i !== "string" || parsed.i.length === 0) return null;
    if (parsed.c === null || parsed.c === undefined) {
      return { createdAt: null, id: parsed.i };
    }
    if (typeof parsed.c !== "string") return null;
    const createdAt = new Date(parsed.c);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id: parsed.i };
  } catch {
    return null;
  }
}