/**
 * Política única de fechas de GymOS (Argentina).
 *
 * REGLA 1 — Fecha de calendario (DATE, "YYYY-MM-DD"):
 *   vencimiento de membresía, fecha de pago, período cubierto, asistencia,
 *   progreso y fecha de nacimiento. No tienen hora: son el día del almanaque
 *   del gimnasio. Se guardan y se comparan siempre como texto "YYYY-MM-DD".
 *
 * REGLA 2 — Momento exacto (TIMESTAMP con hora): created_at, updated_at,
 *   read_at, voided_at, check_in/check_out. Se guardan en UTC y se muestran
 *   en el huso de Argentina.
 *
 * REGLA 3 — Toda cuenta de días se hace sobre las partes de la fecha
 *   (año/mes/día), nunca con `new Date(...)` del navegador ni con
 *   `toISOString()` sobre una fecha local: eso es lo que hacía que 23/09 se
 *   guardara como 22/09 o que 24/09 se mostrara como 23/09.
 *
 * REGLA 4 — "Hoy" es siempre el día en Argentina, aunque el servidor corra
 *   en UTC (a partir de las 21:00 de Argentina, UTC ya está en el día
 *   siguiente).
 */

export const AR_TIME_ZONE = "America/Argentina/Buenos_Aires";

/** Fecha de calendario en formato "YYYY-MM-DD". */
export type ISODate = string;

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const MONTHS_ES = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

/** ¿El texto es una fecha de calendario válida ("YYYY-MM-DD", día existente)? */
export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== "string") return false;
  const m = ISO_DATE_RE.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(year, month);
}

/** Cantidad de días del mes (1-12), con años bisiestos incluidos. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

type Parts = { year: number; month: number; day: number };

function parse(dateISO: ISODate): Parts {
  const m = ISO_DATE_RE.exec(dateISO);
  if (!m) throw new Error(`Fecha inválida: "${dateISO}". Se espera AAAA-MM-DD.`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function format({ year, month, day }: Parts): ISODate {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Sólo para contar días: escala fija, sin husos ni horario de verano. */
function dayNumber(dateISO: ISODate): number {
  const { year, month, day } = parse(dateISO);
  return Date.UTC(year, month - 1, day) / 86400000;
}

/** El día de hoy según el reloj de Argentina, aunque el servidor esté en UTC. */
export function todayISO(): ISODate {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: AR_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Momento exacto para columnas con hora (created_at, voided_at, etc.). */
export function nowTimestamp(): string {
  return new Date().toISOString();
}

/** Marca por minuto, usada para no repetir un mismo aviso. */
export function minuteStamp(): string {
  return nowTimestamp().slice(0, 16);
}

/**
 * Días de calendario entre dos fechas (negativo si `toISO` ya pasó).
 * Es exacto: no depende de la zona horaria de quien ejecuta el código.
 */
export function daysBetween(fromISO: ISODate, toISO: ISODate): number {
  return dayNumber(toISO) - dayNumber(fromISO);
}

/** Días que faltan (o pasaron) hasta una fecha, contando desde hoy en Argentina. */
export function daysUntil(dateISO: ISODate, from: ISODate = todayISO()): number {
  return daysBetween(from, dateISO);
}

/** Suma (o resta) días de calendario. */
export function addDays(dateISO: ISODate, days: number): ISODate {
  const { year, month, day } = parse(dateISO);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return format({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });
}

/**
 * Suma meses conservando el día del mes; si ese día no existe en el mes
 * destino, usa el último día de ese mes (nunca se pasa al mes siguiente).
 *   31/01 + 1 mes = 28/02 (o 29/02 en año bisiesto)
 *   31/03 + 1 mes = 30/04
 *   29/02 + 1 mes = 29/03
 */
export function addMonths(dateISO: ISODate, months: number): ISODate {
  const { year, month, day } = parse(dateISO);
  const total = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(total / 12);
  const targetMonth = (total % 12) + 1;
  return format({
    year: targetYear,
    month: targetMonth,
    day: Math.min(day, daysInMonth(targetYear, targetMonth)),
  });
}

/** Primer día del mes de la fecha indicada. */
export function startOfMonth(dateISO: ISODate): ISODate {
  const { year, month } = parse(dateISO);
  return format({ year, month, day: 1 });
}

/** Último día del mes de la fecha indicada. */
export function endOfMonth(dateISO: ISODate): ISODate {
  const { year, month } = parse(dateISO);
  return format({ year, month, day: daysInMonth(year, month) });
}

/** La mayor de dos fechas de calendario (comparación de texto, es segura). */
export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b;
}

/**
 * Muestra una fecha en formato argentino.
 * - Fecha de calendario ("2026-09-24"): se muestra tal cual, sin husos.
 * - Momento con hora: se convierte al huso de Argentina.
 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  if (isISODate(value.slice(0, 10)) && value.length <= 10) {
    const { year, month, day } = parse(value);
    return `${String(day).padStart(2, "0")} ${MONTHS_ES[month - 1]} ${year}`;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: AR_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

/** Muestra un momento exacto (fecha y hora) en el huso de Argentina. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value.length <= 10 ? `${value}T00:00:00-03:00` : value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: AR_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/**
 * Fecha larga para la barra superior ("martes, 24 de septiembre de 2026").
 * Recibe una fecha de calendario, así el día mostrado es el día en Argentina.
 */
export function formatLongDate(dateISO: ISODate = todayISO()): string {
  const [y, m, d] = dateISO.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
