/**
 * Reglas de validación compartidas por los formularios (UX) y las funciones
 * del servidor (seguridad). La base de datos repite las invariantes más
 * importantes con restricciones propias.
 *
 * Criterio: frenar errores evidentes (fechas inexistentes, tipeos, valores
 * imposibles), nunca decidir qué cuerpo puede tener una persona.
 */
import { z } from "zod";

import { isISODate, todayISO } from "./dates";

export const LIMITS = {
  nameMax: 80,
  emailMax: 254,
  phoneMinDigits: 6,
  phoneMaxDigits: 20,
  dniMax: 20,
  notesMax: 2000,
  minBirthDate: "1900-01-01",
  minRecordDate: "2000-01-01",
  maxRecordDate: "2100-12-31",
  amountMax: 100_000_000,
  planMonthsMax: 60,
  weightKg: { min: 1, max: 600 },
  bodyFat: { min: 1, max: 80 },
  chestCm: { min: 20, max: 300 },
  waistCm: { min: 20, max: 300 },
  armCm: { min: 5, max: 150 },
  routineNameMax: 120,
  exercisesMax: 100,
  setsMax: 100,
  repsMax: 30,
  weightTextMax: 30,
  restMax: 30,
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_CHARS_RE = /^[0-9+\-\s().]+$/;
const DNI_RE = /^[0-9A-Za-z.\-\s]+$/;
const LETTER_RE = /\p{L}/u;

const blank = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

/* --------------------------------------------------- chequeos individuales */
// Cada chequeo devuelve el mensaje de error o null si el valor es correcto.

export function checkPersonName(value: string, label: string): string | null {
  const v = value.trim();
  if (!v) return `${label} es obligatorio.`;
  if (v.length > LIMITS.nameMax) return `${label} no puede superar ${LIMITS.nameMax} caracteres.`;
  if (!LETTER_RE.test(v)) return `${label} tiene que contener letras.`;
  return null;
}

export function checkEmail(value: string | null | undefined): string | null {
  if (blank(value)) return null;
  const v = String(value).trim();
  if (v.length > LIMITS.emailMax || !EMAIL_RE.test(v)) return "El email no tiene un formato válido.";
  return null;
}

export function checkPhone(value: string | null | undefined): string | null {
  if (blank(value)) return null;
  const v = String(value).trim();
  const digits = v.replace(/\D/g, "").length;
  if (!PHONE_CHARS_RE.test(v)) return "El teléfono sólo puede tener números, espacios, +, - o paréntesis.";
  if (digits < LIMITS.phoneMinDigits || digits > LIMITS.phoneMaxDigits)
    return `El teléfono tiene que tener entre ${LIMITS.phoneMinDigits} y ${LIMITS.phoneMaxDigits} números.`;
  return null;
}

export function checkDni(value: string | null | undefined): string | null {
  if (blank(value)) return null;
  const v = String(value).trim();
  if (v.length > LIMITS.dniMax || !DNI_RE.test(v)) return "El DNI no tiene un formato válido.";
  return null;
}

type DateRule = { required?: boolean; min?: string; max?: string; noFuture?: boolean };

export function checkDate(value: string | null | undefined, label: string, rule: DateRule = {}): string | null {
  if (blank(value)) return rule.required ? `${label} es obligatoria.` : null;
  const v = String(value);
  if (!isISODate(v)) return `${label} no es una fecha válida.`;
  const min = rule.min ?? LIMITS.minRecordDate;
  const max = rule.max ?? LIMITS.maxRecordDate;
  if (v < min) return `${label} no puede ser anterior a ${min.split("-").reverse().join("/")}.`;
  if (v > max) return `${label} no puede ser posterior a ${max.split("-").reverse().join("/")}.`;
  if (rule.noFuture && v > todayISO()) return `${label} no puede ser una fecha futura.`;
  return null;
}

export const DATE_RULES = {
  birth: { min: LIMITS.minBirthDate, noFuture: true },
  join: { noFuture: false },
  expires: {},
  payment: { required: true, noFuture: true },
  attendance: { required: true, noFuture: true },
  progress: { required: true, noFuture: true },
} satisfies Record<string, DateRule>;

/** Convierte "72,5" o "72.5" en número; vacío → null; texto inválido → NaN. */
export function parseDecimal(value: unknown): number | null {
  if (blank(value)) return null;
  if (typeof value === "number") return value;
  const n = Number(String(value).trim().replace(",", "."));
  return Number.isFinite(n) ? n : Number.NaN;
}

export function checkRange(
  value: number | null,
  label: string,
  range: { min: number; max: number },
  unit = "",
): string | null {
  if (value === null) return null;
  if (!Number.isFinite(value)) return `${label} tiene que ser un número.`;
  if (value < range.min || value > range.max)
    return `${label} tiene que estar entre ${range.min} y ${range.max}${unit}.`;
  return null;
}

export function checkAmount(value: unknown): string | null {
  const n = parseDecimal(value);
  if (n === null || !Number.isFinite(n)) return "Ingresá un monto válido.";
  if (n <= 0) return "El monto tiene que ser mayor a cero.";
  if (n > LIMITS.amountMax) return "El monto es demasiado alto, revisalo.";
  return null;
}

/* ----------------------------------------------------- chequeos de formulario */

export type MemberForm = {
  first_name: string;
  last_name: string;
  dni?: string | null;
  email?: string | null;
  phone?: string | null;
  birth_date?: string | null;
  join_date?: string | null;
  expires_at?: string | null;
};

export function checkMemberForm(f: MemberForm): string | null {
  return (
    checkPersonName(f.first_name, "El nombre") ??
    checkPersonName(f.last_name, "El apellido") ??
    checkDni(f.dni) ??
    checkEmail(f.email) ??
    checkPhone(f.phone) ??
    checkDate(f.birth_date, "La fecha de nacimiento", DATE_RULES.birth) ??
    checkDate(f.join_date, "La fecha de ingreso", DATE_RULES.join) ??
    checkDate(f.expires_at, "La fecha de vencimiento", DATE_RULES.expires)
  );
}

export type ProgressForm = {
  measured_on: string;
  weight_kg?: unknown;
  body_fat?: unknown;
  chest_cm?: unknown;
  waist_cm?: unknown;
  arm_cm?: unknown;
};

export function checkProgressForm(f: ProgressForm): string | null {
  return (
    checkDate(f.measured_on, "La fecha de la medición", DATE_RULES.progress) ??
    checkRange(parseDecimal(f.weight_kg), "El peso", LIMITS.weightKg, " kg") ??
    checkRange(parseDecimal(f.body_fat), "El porcentaje de grasa", LIMITS.bodyFat, " %") ??
    checkRange(parseDecimal(f.chest_cm), "La medida de pecho", LIMITS.chestCm, " cm") ??
    checkRange(parseDecimal(f.waist_cm), "La medida de cintura", LIMITS.waistCm, " cm") ??
    checkRange(parseDecimal(f.arm_cm), "La medida de brazo", LIMITS.armCm, " cm")
  );
}

export type ExerciseForm = { name: string; sets: unknown; reps: string; weight?: string | null; rest?: string | null };

export function checkExercise(e: ExerciseForm, index: number): string | null {
  const n = `Ejercicio ${index + 1}`;
  const name = e.name.trim();
  if (!name) return `${n}: poné el nombre del ejercicio.`;
  if (name.length > LIMITS.routineNameMax) return `${n}: el nombre es demasiado largo.`;
  const sets = parseDecimal(e.sets);
  if (sets === null || !Number.isInteger(sets) || sets < 1 || sets > LIMITS.setsMax)
    return `${n}: las series tienen que ser un número entero entre 1 y ${LIMITS.setsMax}.`;
  const reps = e.reps.trim();
  if (!reps) return `${n}: indicá las repeticiones.`;
  if (reps.length > LIMITS.repsMax || !/\d/.test(reps))
    return `${n}: las repeticiones tienen que incluir un número (ej. 10, 8-12, 30 seg).`;
  if ((e.weight ?? "").trim().length > LIMITS.weightTextMax) return `${n}: el peso es demasiado largo.`;
  if ((e.rest ?? "").trim().length > LIMITS.restMax) return `${n}: el descanso es demasiado largo.`;
  return null;
}

export function checkRoutineForm(f: { name: string; exercises: ExerciseForm[] }): string | null {
  const name = f.name.trim();
  if (!name) return "Ponele un nombre a la rutina.";
  if (name.length > LIMITS.routineNameMax) return "El nombre de la rutina es demasiado largo.";
  if (f.exercises.length === 0) return "Agregá al menos un ejercicio.";
  if (f.exercises.length > LIMITS.exercisesMax) return `Una rutina puede tener hasta ${LIMITS.exercisesMax} ejercicios.`;
  for (let i = 0; i < f.exercises.length; i++) {
    const err = checkExercise(f.exercises[i]!, i);
    if (err) return err;
  }
  return null;
}

/* ------------------------------------------------ esquemas zod (servidor) */

/** Convierte un chequeo en esquema zod reutilizando exactamente el mismo mensaje. */
const fromCheck = <T>(schema: z.ZodType<T>, check: (v: T) => string | null) =>
  schema.superRefine((v, ctx) => {
    const err = check(v);
    if (err) ctx.addIssue({ code: "custom", message: err });
  });

const optionalText = (max: number) =>
  z.preprocess((v) => (blank(v) ? null : typeof v === "string" ? v.trim() : v), z.string().max(max).nullable().optional());

export const zPersonName = (label: string) =>
  fromCheck(z.string(), (v) => checkPersonName(v, label)).transform((v) => v.trim());

export const zOptionalEmail = z.preprocess(
  (v) => (blank(v) ? undefined : String(v).trim()),
  fromCheck(z.string().optional(), (v) => checkEmail(v)),
);

export const zOptionalPhone = z.preprocess(
  (v) => (blank(v) ? null : String(v).trim()),
  fromCheck(z.string().nullable().optional(), (v) => checkPhone(v)),
);

export const zOptionalDni = z.preprocess(
  (v) => (blank(v) ? null : String(v).trim()),
  fromCheck(z.string().nullable().optional(), (v) => checkDni(v)),
);

export const zDate = (label: string, rule: DateRule) =>
  z.preprocess(
    (v) => (blank(v) ? null : v),
    fromCheck(z.string().nullable().optional(), (v) => checkDate(v, label, rule)),
  );

export const zRequiredDate = (label: string, rule: DateRule) =>
  fromCheck(z.string(), (v) => checkDate(v, label, { ...rule, required: true }));

export const zMeasure = (label: string, range: { min: number; max: number }, unit: string) =>
  z.preprocess(
    (v) => parseDecimal(v),
    fromCheck(z.number().nullable(), (v) => checkRange(v, label, range, unit)),
  );

export const zAmount = fromCheck(z.number(), (v) => checkAmount(v));

export const zNotes = optionalText(LIMITS.notesMax);

export const zExercise = z.object({
  name: z.string().trim().min(1).max(LIMITS.routineNameMax),
  sets: z.number().int().min(1).max(LIMITS.setsMax),
  reps: z.string().trim().min(1).max(LIMITS.repsMax).regex(/\d/, "Las repeticiones tienen que incluir un número."),
  weight: optionalText(LIMITS.weightTextMax),
  rest: optionalText(LIMITS.restMax),
});

/** Largo mínimo de contraseña, único para toda la app. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MIN_MESSAGE = `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`;
export const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH, PASSWORD_MIN_MESSAGE);
