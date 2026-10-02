import { daysUntil, todayISO } from "./dates";

export type MemberStatus = "activo" | "por_vencer" | "vencido" | "sin_membresia" | "baja";

/**
 * Días previos al vencimiento en los que el socio figura "por vencer".
 * Es sólo el valor por defecto: el número real sale de la configuración de
 * Avisos (days_before), así el panel y los recordatorios cuentan igual.
 */
export const SOON_DAYS = 7;

/**
 * Estado único de un socio, usado en todo el sistema.
 * - baja: el socio fue dado de baja (active = false), no cuenta en ninguna otra categoría.
 * - sin_membresia: no tiene fecha de vencimiento cargada.
 *
 * `expiresAt` es una fecha de calendario ("YYYY-MM-DD") y se compara con el día
 * de hoy en Argentina, así el resultado es el mismo en el navegador y en el servidor.
 */
export function memberStatus(
  expiresAt: string | null | undefined,
  active: boolean | null | undefined = true,
  soonDays: number = SOON_DAYS,
): MemberStatus {
  if (active === false) return "baja";
  if (!expiresAt) return "sin_membresia";
  const days = daysUntil(expiresAt.slice(0, 10), todayISO());
  if (days < 0) return "vencido";
  if (days <= soonDays) return "por_vencer";
  return "activo";
}

export const STATUS_LABEL: Record<MemberStatus, string> = {
  activo: "Activo",
  por_vencer: "Por vencer",
  vencido: "Vencido",
  sin_membresia: "Sin membresía",
  baja: "Dado de baja",
};

export const STATUS_BADGE: Record<MemberStatus, string> = {
  activo: "badge badge-green",
  por_vencer: "badge badge-amber",
  vencido: "badge badge-red",
  sin_membresia: "badge badge-blue",
  baja: "badge",
};

export const GOALS = [
  { value: "bajar_peso", label: "Bajar de peso" },
  { value: "masa_muscular", label: "Ganar masa muscular" },
  { value: "resistencia", label: "Mejorar resistencia" },
  { value: "fuerza", label: "Ganar fuerza" },
  { value: "otro", label: "Otro" },
] as const;

export const LEVELS = [
  { value: "principiante", label: "Principiante" },
  { value: "intermedio", label: "Intermedio" },
  { value: "avanzado", label: "Avanzado" },
] as const;

export function goalLabel(value: string | null | undefined): string {
  return GOALS.find((g) => g.value === value)?.label ?? "Sin definir";
}

export function levelLabel(value: string | null | undefined): string {
  return LEVELS.find((l) => l.value === value)?.label ?? "Sin definir";
}

export function money(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return `$${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

export function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

/*
 * Las fechas se manejan en un solo lugar: ./dates.
 * Se reexportan para que el resto de la aplicación no cambie de import.
 */
export {
  addDays,
  addMonths,
  daysBetween,
  daysUntil,
  endOfMonth,
  formatDate,
  formatDateTime,
  isISODate,
  maxDate,
  minuteStamp,
  nowTimestamp,
  startOfMonth,
  todayISO,
} from "./dates";
