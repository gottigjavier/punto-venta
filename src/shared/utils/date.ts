// src/shared/utils/date.ts
// Helpers compartidos de fecha (QC5, reporte 26/09). Se consolidan acá los
// helpers de fecha que estaban re-implementados en varios use-cases
// (venta/stock/producto/historial) para eliminar la duplicación y el drift.
//
// Convención de fechas del dominio:
//  - Las fechas de producto/lote se almacenan como medianoche UTC representando
//    la fecha LOCAL que ingresó el usuario (se leen con toISOString().slice(0,10)).
//  - Para "ahora" el dominio NO depende del TZ del proceso: toUTC3DateString
//    calcula la fecha civil de UTC-3 con aritmética de ms pura.
//  - Los contenedores corren en UTC (sin TZ= en podman-compose*/render.yaml);
//    la máquina host puede estar en otra zona (p.ej. America/Argentina).

const UTC3_OFFSET_MS = 3 * 60 * 60 * 1000;

// "Ahora" como string YYYY-MM-DD en UTC-3 (America/Argentina/Buenos_Aires).
// Shifts -3h from UTC to get the UTC-3 local date, using pure ms arithmetic.
// Used ONLY for "now" (Date.now() is in UTC). Product dates from the DB use
// toISOString().slice(0,10) directly since they're stored as UTC midnight
// representing the local date the user entered.
export function toUTC3DateString(date: Date): string {
  const ms = date.getTime() - UTC3_OFFSET_MS; // subtract to go from UTC to UTC-3
  // Days since Unix epoch
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  // Civil date from day count (Howard Hinnant algorithm)
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe -
      Math.floor(doe / 1460) +
      Math.floor(doe / 36524) -
      Math.floor(doe / 146096)) /
      365,
  );
  const y = yoe + era * 400;
  const doy =
    doe - Math.floor(365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  const yr = m <= 2 ? y + 1 : y;
  return `${yr}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// startOfDay/endOfDay — variante Date (ex venta.use-case.ts): medianoche LOCAL
// del Date recibido (setHours sobre el TZ del proceso). OJO: con TZ del proceso
// distinto de UTC, difiere de startOfDayUTC para el mismo día civil (ver QC5).
export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

// startOfDayUTC/endOfDayUTC — variante 'YYYY-MM-DD' (ex historial.use-case.ts):
// medianoche UTC del día civil recibido. Independiente del TZ del proceso y
// consistente con la convención de almacenamiento (medianoche UTC).
export function startOfDayUTC(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

export function endOfDayUTC(dateStr: string): Date {
  return new Date(`${dateStr}T23:59:59.999Z`);
}

// Inicio del día de HOY en UTC-3 (medianoche UTC del día civil en Argentina).
// Filtro "lotes NO vencidos" (ex limiteHoy/limiteVencidos de venta/stock/producto).
export function limiteHoy(): Date {
  const hoyStr = toUTC3DateString(new Date());
  return new Date(`${hoyStr}T00:00:00.000Z`);
}