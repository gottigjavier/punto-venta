/**
 * Shared formatting helpers for the punto-venta frontend.
 *
 * The backend serialises date-only values as ISO UTC strings
 * (e.g. '2026-07-16T00:00:00.000Z').  Using `timeZone: 'UTC'`
 * in toLocaleDateString ensures the displayed day matches the
 * stored date — without this, browsers in negative-UTC offsets
 * (like UTC-3 / Argentina) shift midnight UTC back to the
 * previous calendar day.
 */

/** Format a date string as dd/MM/yyyy in es-AR locale (UTC-safe). */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-AR', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
