import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { passwordSchema } from "./validation";

import { provisionGym, provisionMember, type AdminLike, type DbLike } from "./gym-provisioning";

import { memberStatus, SOON_DAYS } from "./gym-shared";
import {
  addDays,
  endOfMonth,
  isISODate,
  minuteStamp,
  nowTimestamp,
  startOfMonth,
  todayISO,
} from "./dates";

/** Valida una fecha de calendario del formulario ("AAAA-MM-DD", día existente). */
const calendarDate = (label: string) =>
  z.string().refine((v) => isISODate(v), `${label} no es una fecha válida.`);
import {
  DATE_RULES,
  LIMITS,
  zAmount,
  zDate,
  zExercise,
  zMeasure,
  zNotes,
  zOptionalDni,
  zOptionalEmail,
  zOptionalPhone,
  zPersonName,
  zRequiredDate,
} from "./validation";
import { pushNotifications } from "./notifications.functions";

type Ctx = {
  supabase: import("@supabase/supabase-js").SupabaseClient<
    import("@/integrations/supabase/types").Database
  >;
  userId: string;
};

async function isAdmin(context: Ctx) {
  const { data } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();
  return Boolean(data);
}

async function assertAdmin(context: Ctx) {
  if (!(await isAdmin(context))) {
    throw new Error("Esta acción es sólo para el administrador del gimnasio.");
  }
}

function unwrap<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/** Gimnasio real del usuario (admin o socio); las configuraciones se filtran por él. */
async function gymIdOf(ctx: Ctx): Promise<string> {
  const { data, error } = await ctx.supabase.rpc("current_gym_id");
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No encontramos tu gimnasio.");
  return data;
}

/* El "deshacer" seguro de las altas vive en ./gym-provisioning. */

type AssignedRoutine = { routine_id: string } | { routine_id: string }[] | null | undefined;

function firstRoutineId(rel: unknown): string | null {
  const value = rel as AssignedRoutine;
  if (!value) return null;
  const row = Array.isArray(value) ? value[0] : value;
  return row?.routine_id ?? null;
}

/* ------------------------------------------------------------------ session */

export const getMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    const admin = await isAdmin(ctx);
    const profile = unwrap(
      await ctx.supabase.from("profiles").select("*").eq("id", ctx.userId).maybeSingle(),
    );
    const member = unwrap(
      await ctx.supabase
        .from("members")
        .select("id, first_name, last_name")
        .eq("user_id", ctx.userId)
        .maybeSingle(),
    );
    const settings = unwrap(
      await ctx.supabase
        .from("gyms")
        .select("*")
        .eq("id", await gymIdOf(ctx))
        .maybeSingle(),
    );
    return {
      userId: ctx.userId,
      role: admin ? ("admin" as const) : ("socio" as const),
      profile,
      memberId: member?.id ?? null,
      memberName: member ? `${member.first_name} ${member.last_name}` : null,
      gymName: settings?.name ?? "GYMANGT",
      // Día de hoy en Argentina y ventana de aviso: las pantallas no calculan
      // "hoy" con el reloj de la computadora del usuario.
      today: todayISO(),
      soonDays: admin ? await soonDaysOf(ctx) : SOON_DAYS,
    };
  });

/* ------------------------------------------------------------------ members */

const MEMBER_SELECT =
  "id, gym_id, user_id, first_name, last_name, dni, email, phone, birth_date, notes, goal, level, trainer_notes, photo_url, updated_at, plan_id, join_date, expires_at, active, created_at, plans(id, name, price, months), member_routines(routine_id, assigned_at, routines(id, name, kind))";

/** Devuelve un enlace temporal y firmado para ver la foto del socio. */
async function signedPhoto(
  path: string | null | undefined,
  gymId: string,
  memberId: string,
): Promise<string | null> {
  if (!path) return null;
  // Sólo se firman fotos guardadas en la carpeta de ESTE socio y gimnasio.
  if (!path.startsWith(`gym/${gymId}/member/${memberId}/`) || path.includes("..")) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.storage.from("member-photos").createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

export const listMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    await assertAdmin(ctx);
    const rows = unwrap(
      await ctx.supabase.from("members").select(MEMBER_SELECT).order("created_at", {
        ascending: false,
      }),
    );
    return rows ?? [];
  });

export const getMember = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    // Las reglas de la base ya limitan qué ficha puede leer cada persona:
    // el administrador ve todas, y el socio únicamente la suya.
    const member = unwrap(
      await ctx.supabase.from("members").select(MEMBER_SELECT).eq("id", data.id).maybeSingle(),
    );
    if (!member) throw new Error("Socio no encontrado.");
    const payments = unwrap(
      await ctx.supabase
        .from("payments")
        .select("*, plans(name)")
        .eq("member_id", data.id)
        .is("voided_at", null)
        .order("paid_on", { ascending: false }),
    );
    const attendance = unwrap(
      await ctx.supabase
        .from("attendance")
        .select("*")
        .eq("member_id", data.id)
        .order("attended_on", { ascending: false })
        .limit(180),
    );
    const progress = unwrap(
      await ctx.supabase
        .from("member_progress")
        .select("*")
        .eq("member_id", data.id)
        .order("measured_on", { ascending: false }),
    );
    const admin = await isAdmin(ctx);
    const events = admin
      ? (unwrap(
          await ctx.supabase
            .from("member_events")
            .select("*")
            .eq("member_id", data.id)
            .order("created_at", { ascending: false })
            .limit(100),
        ) ?? [])
      : [];
    const assignedRoutineId = firstRoutineId(member.member_routines);
    let routine = null;
    if (assignedRoutineId) {
      routine = unwrap(
        await ctx.supabase
          .from("routines")
          .select("*, routine_exercises(id, name, sets, reps, position)")
          .eq("id", assignedRoutineId)
          .maybeSingle(),
      );
    }
    return {
      member,
      payments: payments ?? [],
      attendance: attendance ?? [],
      progress: progress ?? [],
      events,
      routine,
      photoUrl: await signedPhoto(member.photo_url, member.gym_id, member.id),
      isAdmin: admin,
    };
  });

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);


const optionalPassword = z.preprocess(
  blankToUndefined,
  passwordSchema.optional(),
);

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T, message: string) =>
  z.preprocess(blankToUndefined, z.enum(values, { message }).optional().nullable());

const memberInput = z.object({
  first_name: zPersonName("El nombre"),
  last_name: zPersonName("El apellido"),
  dni: zOptionalDni,
  email: zOptionalEmail,
  phone: zOptionalPhone,
  birth_date: zDate("La fecha de nacimiento", DATE_RULES.birth),
  join_date: zDate("La fecha de ingreso", DATE_RULES.join),
  notes: zNotes,
  goal: optionalEnum(
    ["bajar_peso", "masa_muscular", "resistencia", "fuerza", "otro"],
    "Elegí un objetivo válido",
  ),
  level: optionalEnum(["principiante", "intermedio", "avanzado"], "Elegí un nivel válido"),
  trainer_notes: zNotes,
  plan_id: z.string().uuid().optional().nullable().or(z.literal("")),
  expires_at: zDate("La fecha de vencimiento", DATE_RULES.expires),
});

function clean<T extends Record<string, unknown>>(obj: T) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    // La fecha de ingreso es obligatoria en la base: si no vino, no se toca.
    if (k === "join_date" && (v === "" || v === null || v === undefined)) continue;
    out[k] = v === "" ? null : v;
  }
  return out;
}

/**
 * Evita cargar dos veces al mismo socio: controla que el email y el DNI no
 * estén usados por otra ficha. La comprobación corre siempre en el servidor.
 */
async function assertNoDuplicate(
  ctx: Ctx,
  fields: { email?: string | null | undefined; dni?: string | null | undefined },
  excludeId?: string,
) {
  if (fields.email) {
    let q = ctx.supabase.from("members").select("id").ilike("email", fields.email);
    if (excludeId) q = q.neq("id", excludeId);
    const rows = unwrap(await q);
    if ((rows ?? []).length > 0) throw new Error("Ya hay otro socio cargado con ese email.");
  }
  if (fields.dni) {
    let q = ctx.supabase.from("members").select("id").eq("dni", fields.dni);
    if (excludeId) q = q.neq("id", excludeId);
    const rows = unwrap(await q);
    if ((rows ?? []).length > 0) throw new Error("Ya hay otro socio cargado con ese DNI.");
  }
}

export const createMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    memberInput
      .extend({
        create_account: z.boolean().optional(),
        password: optionalPassword,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertAdmin(ctx);
    const { create_account, password, ...fields } = data;
    await assertNoDuplicate(ctx, fields);

    const admin = create_account
      ? (await import("@/integrations/supabase/client.server")).supabaseAdmin
      : undefined;

    const result = await provisionMember({
      db: ctx.supabase as unknown as DbLike,
      admin: admin as unknown as AdminLike | undefined,
      createAccount: Boolean(create_account),
      password,
      fields: clean(fields) as never,
    });
    return { id: result.id };
  });

export const updateMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => memberInput.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertAdmin(ctx);
    const { id, ...fields } = data;
    await assertNoDuplicate(ctx, fields, id);
    unwrap(
      await ctx.supabase
        .from("members")
        .update(clean(fields) as never)
        .eq("id", id)
        .select("id")
        .single(),
    );
    return { ok: true };
  });

export const deleteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertAdmin(ctx);
    const member = unwrap(
      await ctx.supabase.from("members").select("user_id, gym_id").eq("id", data.id).maybeSingle(),
    );
    const res = await ctx.supabase.from("members").delete().eq("id", data.id);
    if (res.error) throw new Error(res.error.message);
    if (member?.gym_id) {
      // No dejamos fotos sueltas del socio dado de baja.
      await removeMemberPhotoFiles(member.gym_id, data.id);
    }
    if (member?.user_id) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.auth.admin.deleteUser(member.user_id);
    }
    return { ok: true };
  });

/* -------------------------------------------------------------------- plans */

export const listPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    const rows = unwrap(
      await ctx.supabase.from("plans").select("*").order("months", { ascending: true }),
    );
    return rows ?? [];
  });

export const savePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(1, "El nombre del plan es obligatorio").max(LIMITS.nameMax),
        price: z.number().finite().min(0).max(LIMITS.amountMax, "El precio es demasiado alto."),
        months: z.number().int().min(1).max(LIMITS.planMonthsMax, "La duración del plan es demasiado larga."),
        payment_link: z
          .string()
          .trim()
          .url("El link de pago debe ser una dirección web válida")
          .refine((u) => u.startsWith("https://"), "El link debe empezar con https://")
          .optional()
          .nullable()
          .or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertAdmin(ctx);
    if (data.id) {
      unwrap(
        await ctx.supabase
          .from("plans")
          .update({
            name: data.name,
            price: data.price,
            months: data.months,
            payment_link: data.payment_link || null,
          })
          .eq("id", data.id)
          .select("id")
          .single(),
      );
    } else {
      unwrap(
        await ctx.supabase
          .from("plans")
          .insert({
            name: data.name,
            price: data.price,
            months: data.months,
            payment_link: data.payment_link || null,
          })
          .select("id")
          .single(),
      );
    }
    return { ok: true };
  });

export const deletePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertAdmin(ctx);
    const res = await ctx.supabase.from("plans").delete().eq("id", data.id);
    if (res.error) throw new Error(res.error.message);
    return { ok: true };
  });

/* ----------------------------------------------------------------- settings */

export const getSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    return unwrap(
      await ctx.supabase
        .from("gyms")
        .select("*")
        .eq("id", await gymIdOf(ctx))
        .maybeSingle(),
    );
  });

export const saveSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        name: z.string().min(1, "El nombre del gimnasio es obligatorio"),
        address: z.string().optional().nullable(),
        phone: z.string().optional().nullable(),
        email: z.string().optional().nullable(),
        bank_alias: z.string().max(60).optional().nullable(),
        bank_cbu: z.string().max(30).optional().nullable(),
        bank_holder: z.string().max(120).optional().nullable(),
        payment_instructions: z.string().max(500).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertAdmin(ctx);
    unwrap(
      await ctx.supabase
        .from("gyms")
        .update({
          name: data.name,
          address: data.address ?? null,
          phone: data.phone ?? null,
          email: data.email ?? null,
          bank_alias: data.bank_alias || null,
          bank_cbu: data.bank_cbu || null,
          bank_holder: data.bank_holder || null,
          payment_instructions: data.payment_instructions || null,
          updated_at: nowTimestamp(),
        })
        .eq("id", await gymIdOf(ctx))
        .select("id")
        .single(),
    );
    return { ok: true };
  });

/* ----------------------------------------------------------------- payments */

export const listPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    await assertAdmin(ctx);
    const rows = unwrap(
      await ctx.supabase
        .from("payments")
        .select("*, plans(name), members(id, first_name, last_name)")
        .is("voided_at", null)
        .order("paid_on", { ascending: false }),
    );
    return rows ?? [];
  });

/**
 * El cobro se hace en una sola operación de la base (register_payment):
 * valida que socio y plan sean del gimnasio, bloquea al socio para evitar
 * cobros dobles simultáneos, guarda precio/descuento/importe final y
 * recalcula el vencimiento. Si algo falla, no queda nada a medias.
 */
export const registerPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        member_id: z.string().uuid(),
        plan_id: z.string().uuid(),
        amount: zAmount,
        method: z.string().trim().min(1).max(40),
        concept: z.string().trim().min(1).max(200),
        paid_on: zRequiredDate("La fecha de pago", DATE_RULES.payment),
        request_id: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertAdmin(ctx);
    const res = unwrap(
      await ctx.supabase.rpc("register_payment", {
        _member_id: data.member_id,
        _plan_id: data.plan_id,
        _amount: data.amount,
        _method: data.method,
        _concept: data.concept,
        _paid_on: data.paid_on,
        _request_id: data.request_id ?? null,
      } as never),
    ) as { covers_until: string | null };
    return { covers_until: res?.covers_until ?? null };
  });

/** Anulación lógica: el pago queda en la base con quién, cuándo y por qué. */
export const deletePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        reason: z.string().trim().min(3, "Indicá el motivo de la anulación.").max(300),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertAdmin(ctx);
    const res = unwrap(
      await ctx.supabase.rpc("void_payment", { _payment_id: data.id, _reason: data.reason }),
    ) as { covers_until: string | null };
    return { covers_until: res?.covers_until ?? null };
  });

/* ----------------------------------------------------------------- routines */

export const listRoutines = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    await assertAdmin(ctx);
    const rows = unwrap(
      await ctx.supabase
        .from("routines")
        .select(
          "*, routine_exercises(id, name, sets, reps, position), member_routines(member_id, members(first_name, last_name)), owner:members!routines_member_id_fkey(id, first_name, last_name)",
        )
        .is("group_id", null)
        .order("created_at", { ascending: false }),
    );
    return rows ?? [];
  });

export const saveRoutine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(1, "Ponele un nombre a la rutina").max(LIMITS.routineNameMax),
        kind: z.string().trim().min(1).max(60),
        notes: zNotes,
        exercises: z
          .array(zExercise)
          .min(1, "Agregá al menos un ejercicio")
          .max(LIMITS.exercisesMax, `Una rutina puede tener hasta ${LIMITS.exercisesMax} ejercicios.`),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertAdmin(ctx);
    let routineId = data.id;
    if (routineId) {
      unwrap(
        await ctx.supabase
          .from("routines")
          .update({ name: data.name, kind: data.kind, notes: data.notes ?? null })
          .eq("id", routineId)
          .select("id")
          .single(),
      );
      const del = await ctx.supabase.from("routine_exercises").delete().eq("routine_id", routineId);
      if (del.error) throw new Error(del.error.message);
    } else {
      const row = unwrap(
        await ctx.supabase
          .from("routines")
          .insert({
            name: data.name,
            kind: data.kind,
            notes: data.notes ?? null,
            created_by: ctx.userId,
          })
          .select("id")
          .single(),
      );
      routineId = row!.id;
    }
    unwrap(
      await ctx.supabase
        .from("routine_exercises")
        .insert(
          data.exercises.map((e, i) => ({
            routine_id: routineId!,
            name: e.name,
            sets: e.sets,
            reps: e.reps,
            ...(e.weight ? { weight: e.weight } : {}),
            ...(e.rest ? { rest: e.rest } : {}),
            position: i,
          })),
        )
        .select("id"),
    );

    // Si se modificó una rutina ya asignada, avisamos a cada socio alcanzado.
    if (data.id && (await routineNotificationsOn(ctx))) {
      const assigned =
        unwrap(
          await ctx.supabase
            .from("member_routines")
            .select("member_id, members(user_id)")
            .eq("routine_id", routineId!),
        ) ?? [];
      const stamp = minuteStamp();
      await pushNotifications(
        ctx,
        assigned.map((a) => ({
          member_id: a.member_id,
          user_id: (a.members as { user_id: string | null } | null)?.user_id ?? null,
          kind: "rutina_modificada" as const,
          title: "Tu rutina fue actualizada",
          body: `El entrenador actualizó tu rutina "${data.name}". Entrá a "Mi rutina" para ver los cambios.`,
          dedup_key: `rutmod:${routineId}:${a.member_id}:${stamp}`,
        })),
      );
    }
    return { id: routineId };
  });

/** Indica si los avisos de rutina están activados en la configuración. */
async function routineNotificationsOn(ctx: Ctx): Promise<boolean> {
  const { data } = await ctx.supabase
    .from("gym_notification_settings")
    .select("routine_enabled")
    .eq("gym_id", await gymIdOf(ctx))
    .maybeSingle();
  return data?.routine_enabled ?? true;
}

export const deleteRoutine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertAdmin(ctx);
    const res = await ctx.supabase.from("routines").delete().eq("id", data.id);
    if (res.error) throw new Error(res.error.message);
    return { ok: true };
  });

/* ------------------------------------------- rutinas propias del socio */
// El socio dueño lo fija la base de datos (trigger + RLS) desde la sesión:
// nunca se acepta un member_id enviado por el cliente.

const zMyRoutine = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Ponele un nombre a la rutina").max(LIMITS.routineNameMax),
  kind: z.string().trim().min(1).max(60),
  notes: zNotes,
  exercises: z
    .array(zExercise)
    .min(1, "Agregá al menos un ejercicio")
    .max(LIMITS.exercisesMax, `Una rutina puede tener hasta ${LIMITS.exercisesMax} ejercicios.`),
});

async function myMemberId(ctx: Ctx): Promise<string> {
  const { data, error } = await ctx.supabase.rpc("current_member_id");
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Tu cuenta no está vinculada a una ficha de socio activa.");
  return data;
}

export const listMyRoutines = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    const memberId = await myMemberId(ctx);
    const rows = unwrap(
      await ctx.supabase
        .from("routines")
        .select("id, name, kind, notes, created_at, updated_at, routine_exercises(id, name, sets, reps, weight, rest, position)")
        .eq("created_by_role", "member")
        .eq("member_id", memberId)
        .is("group_id", null)
        .order("created_at", { ascending: false }),
    );
    return rows ?? [];
  });

export const saveMyRoutine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => zMyRoutine.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const memberId = await myMemberId(ctx);
    let routineId = data.id;
    if (routineId) {
      const own = unwrap(
        await ctx.supabase
          .from("routines")
          .update({ name: data.name, kind: data.kind, notes: data.notes ?? null })
          .eq("id", routineId)
          .eq("created_by_role", "member")
          .eq("member_id", memberId)
          .select("id")
          .maybeSingle(),
      );
      if (!own) throw new Error("Esa rutina no existe o no es tuya.");
      const del = await ctx.supabase.from("routine_exercises").delete().eq("routine_id", routineId);
      if (del.error) throw new Error(del.error.message);
    } else {
      const row = unwrap(
        await ctx.supabase
          .from("routines")
          .insert({ name: data.name, kind: data.kind, notes: data.notes ?? null, created_by_role: "member", member_id: memberId, gym_id: await gymIdOf(ctx) })
          .select("id")
          .single(),
      );
      routineId = row!.id;
    }
    unwrap(
      await ctx.supabase
        .from("routine_exercises")
        .insert(
          data.exercises.map((e, i) => ({
            routine_id: routineId!,
            name: e.name,
            sets: e.sets,
            reps: e.reps,
            weight: e.weight ?? null,
            rest: e.rest ?? null,
            position: i,
          })),
        )
        .select("id"),
    );
    return { id: routineId };
  });

export const deleteMyRoutine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const memberId = await myMemberId(ctx);
    const res = unwrap(
      await ctx.supabase
        .from("routines")
        .delete()
        .eq("id", data.id)
        .eq("created_by_role", "member")
        .eq("member_id", memberId)
        .select("id"),
    );
    if (!res || res.length === 0) throw new Error("Esa rutina no existe o no es tuya.");
    return { ok: true };
  });

export const assignRoutine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        member_id: z.string().uuid(),
        routine_id: z.string().uuid().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertAdmin(ctx);
    if (!data.routine_id) {
      const res = await ctx.supabase
        .from("member_routines")
        .delete()
        .eq("member_id", data.member_id);
      if (res.error) throw new Error(res.error.message);
      return { ok: true };
    }
    unwrap(
      await ctx.supabase
        .from("member_routines")
        .upsert(
          { member_id: data.member_id, routine_id: data.routine_id },
          { onConflict: "member_id" },
        )
        .select("member_id")
        .single(),
    );

    if (await routineNotificationsOn(ctx)) {
      const member = unwrap(
        await ctx.supabase.from("members").select("user_id").eq("id", data.member_id).maybeSingle(),
      );
      const routine = unwrap(
        await ctx.supabase.from("routines").select("name").eq("id", data.routine_id).maybeSingle(),
      );
      const stamp = minuteStamp();
      await pushNotifications(ctx, [
        {
          member_id: data.member_id,
          user_id: member?.user_id ?? null,
          kind: "rutina_asignada",
          title: "Tenés una rutina nueva",
          body: `Te asignaron la rutina "${routine?.name ?? "nueva"}". Entrá a "Mi rutina" para verla.`,
          dedup_key: `rutasig:${data.member_id}:${data.routine_id}:${stamp}`,
        },
      ]);
    }
    return { ok: true };
  });

/* ---------------------------------------------------------------- dashboard */

/** Suma todos los pagos del rango sin traer filas de más al navegador. */
async function sumPayments(ctx: Ctx, from: string, to: string) {
  const PAGE = 1000;
  let total = 0;
  let count = 0;
  let offset = 0;
  // Recorre la tabla por páginas del lado del servidor: el total no depende
  // de ningún límite arbitrario (antes se sumaban sólo los últimos 50 pagos).
  for (;;) {
    const rows =
      unwrap(
        await ctx.supabase
          .from("payments")
          .select("amount")
          .is("voided_at", null)
          .gte("paid_on", from)
          .lte("paid_on", to)
          .order("paid_on", { ascending: false })
          .range(offset, offset + PAGE - 1),
      ) ?? [];
    for (const r of rows) total += Number(r.amount ?? 0);
    count += rows.length;
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return { total, count };
}

/** Días de aviso configurados en Avisos; el panel usa el mismo número. */
async function soonDaysOf(ctx: Ctx): Promise<number> {
  const { data } = await ctx.supabase
    .from("gym_notification_settings")
    .select("days_before")
    .eq("gym_id", await gymIdOf(ctx))
    .maybeSingle();
  return data?.days_before ?? SOON_DAYS;
}

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        from: calendarDate("La fecha desde").optional(),
        to: calendarDate("La fecha hasta").optional(),
      })
      .partial()
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertAdmin(ctx);

    const today = todayISO();
    const monthStart = startOfMonth(today);
    const monthEnd = endOfMonth(today);
    // Misma ventana que los recordatorios de vencimiento: una sola regla.
    const soonDays = await soonDaysOf(ctx);
    const soonLimit = addDays(today, soonDays);

    // Todos los contadores se calculan en la base (count exact, sin traer filas).
    // RLS + gym_id ya limitan cada consulta al gimnasio de quien consulta.
    const countOf = async (
      q: PromiseLike<{ count: number | null; error: { message: string } | null }>,
    ) => {
      const res = await q;
      if (res.error) throw new Error(res.error.message);
      return res.count ?? 0;
    };

    const base = () => ctx.supabase.from("members").select("id", { count: "exact", head: true });

    const [
      totalMembers,
      activeMembers,
      soonCount,
      overdueCount,
      withoutMembership,
      inactiveMembers,
      routines,
      month,
    ] = await Promise.all([
      countOf(base()),
      countOf(base().eq("active", true).gt("expires_at", soonLimit)),
      countOf(base().eq("active", true).gte("expires_at", today).lte("expires_at", soonLimit)),
      countOf(base().eq("active", true).lt("expires_at", today)),
      countOf(base().eq("active", true).is("expires_at", null)),
      countOf(base().eq("active", false)),
      ctx.supabase.from("routines").select("id", { count: "exact", head: true }).is("group_id", null),
      sumPayments(ctx, monthStart, monthEnd),
    ]);

    // Período elegido (si el usuario pide uno); por defecto, el mes en curso.
    const periodFrom = data.from ?? monthStart;
    const periodTo = data.to ?? monthEnd;
    const period =
      periodFrom === monthStart && periodTo === monthEnd
        ? month
        : await sumPayments(ctx, periodFrom, periodTo);

    // Listados para mostrar (sólo lo que se ve en pantalla).
    const recentMembers =
      unwrap(
        await ctx.supabase
          .from("members")
          .select(
            "id, first_name, last_name, expires_at, created_at, active, plans(name), plan_id, dni, email, phone, birth_date, notes, join_date, user_id",
          )
          .order("created_at", { ascending: false })
          .limit(5),
      ) ?? [];

    const recentPayments =
      unwrap(
        await ctx.supabase
          .from("payments")
          .select("id, amount, paid_on, concept, members(first_name, last_name)")
          .is("voided_at", null)
          .order("paid_on", { ascending: false })
          .limit(5),
      ) ?? [];

    const attention =
      unwrap(
        await ctx.supabase
          .from("members")
          .select("id, first_name, last_name, expires_at, active, plans(name)")
          .eq("active", true)
          .not("expires_at", "is", null)
          .lte("expires_at", soonLimit)
          .order("expires_at", { ascending: true })
          .limit(20),
      ) ?? [];

    return {
      totalMembers,
      activeMembers,
      soonCount,
      overdueCount,
      withoutMembership,
      inactiveMembers,
      incomeThisMonth: month.total,
      paymentsThisMonth: month.count,
      periodFrom,
      periodTo,
      incomePeriod: period.total,
      paymentsPeriod: period.count,
      routinesCount: routines.count ?? 0,
      soonDays,
      today,
      recentMembers,
      recentPayments,
      overdueMembers: attention.filter(
        (m) => memberStatus(m.expires_at, m.active, soonDays) === "vencido",
      ),
      soonMembers: attention.filter(
        (m) => memberStatus(m.expires_at, m.active, soonDays) === "por_vencer",
      ),
    };
  });

/* ------------------------------------------------------------ portal socio */

export const getMyPortal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    const member = unwrap(
      await ctx.supabase
        .from("members")
        .select(MEMBER_SELECT)
        .eq("user_id", ctx.userId)
        .maybeSingle(),
    );
    const payInfo = unwrap(
      await ctx.supabase
        .from("gyms")
        .select("name, bank_alias, bank_cbu, bank_holder, payment_instructions")
        .eq("id", await gymIdOf(ctx))
        .maybeSingle(),
    );
    const payPlans = unwrap(
      await ctx.supabase
        .from("plans")
        .select("id, name, price, months, payment_link")
        .eq("active", true)
        .order("price"),
    );
    const payOptions = {
      settings: payInfo ? { ...payInfo, name: payInfo.name ?? "" } : null,
      plans: payPlans ?? [],
    };
    if (!member) return { member: null, payments: [], routine: null, payOptions };
    const payments = unwrap(
      await ctx.supabase
        .from("payments")
        .select("*, plans(name)")
        .eq("member_id", member.id)
        .is("voided_at", null)
        .order("paid_on", { ascending: false }),
    );
    const routineId = firstRoutineId(member.member_routines);
    let routine = null;
    if (routineId) {
      routine = unwrap(
        await ctx.supabase
          .from("routines")
          .select("*, routine_exercises(id, name, sets, reps, position)")
          .eq("id", routineId)
          .maybeSingle(),
      );
    }
    return { member, payments: payments ?? [], routine, payOptions };
  });

/* ------------------------------------------------- alta inicial del gimnasio */

/**
 * El registro de nuevos gimnasios está siempre abierto: cada administrador
 * crea su propio gimnasio con sus datos aislados del resto.
 */
export const gymSetupStatus = createServerFn({ method: "GET" }).handler(async () => {
  return { needsSetup: true };
});

/* Los planes que se precargan al crear un gimnasio viven en ./gym-provisioning. */

/**
 * Crea la cuenta del administrador y su gimnasio. Cada administrador queda
 * como dueño de un gimnasio propio, con sus socios, pagos y rutinas aislados.
 */
export const setupGym = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        email: z.string().email("Email inválido"),
        password: passwordSchema,
        full_name: z.string().min(1, "Ingresá tu nombre y apellido"),
        gym_name: z.string().min(1).max(120).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await provisionGym(supabaseAdmin as unknown as AdminLike, data);
    return { ok: true };
  });

/* --------------------------------------------------------------- asistencias */

export const markAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        member_id: z.string().uuid(),
        attended_on: zRequiredDate("La fecha de asistencia", DATE_RULES.attendance),
        note: zNotes,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertAdmin(ctx);
    if (data.attended_on > todayISO()) {
      throw new Error("No se puede registrar una asistencia con fecha futura.");
    }
    const res = await ctx.supabase.from("attendance").upsert(
      {
        member_id: data.member_id,
        attended_on: data.attended_on,
        note: data.note || null,
      },
      { onConflict: "member_id,attended_on" },
    );
    if (res.error) throw new Error(res.error.message);
    return { ok: true };
  });

/**
 * El socio marca su propia asistencia de hoy. La base de datos decide socio,
 * gimnasio y fecha a partir de la sesión: no se acepta ningún dato del cliente.
 */
export const checkInMyself = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    const res = await ctx.supabase.rpc("member_check_in");
    if (res.error) throw new Error(res.error.message);
    return res.data as { status: "created" | "already"; attended_on: string; check_in: string | null };
  });

export const listMyAttendance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    const me = unwrap(
      await ctx.supabase.from("members").select("id").eq("user_id", ctx.userId).maybeSingle(),
    );
    if (!me) return { rows: [], today: todayISO() };
    const rows = unwrap(
      await ctx.supabase
        .from("attendance")
        .select("id, attended_on, check_in")
        .eq("member_id", me.id)
        .order("attended_on", { ascending: false })
        .limit(180),
    );
    return { rows: rows ?? [], today: todayISO() };
  });

/** Todas las asistencias del gimnasio del administrador (RLS limita al gimnasio). */
export const listGymAttendance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    await assertAdmin(ctx);
    const rows = unwrap(
      await ctx.supabase
        .from("attendance")
        .select("id, attended_on, check_in, created_by, member_id, members(id, first_name, last_name)")
        .order("attended_on", { ascending: false })
        .order("check_in", { ascending: false })
        .limit(1000),
    );
    return { rows: rows ?? [], today: todayISO() };
  });

export const removeAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertAdmin(ctx);
    const res = await ctx.supabase.from("attendance").delete().eq("id", data.id);
    if (res.error) throw new Error(res.error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ progreso */

export const addProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        member_id: z.string().uuid(),
        measured_on: zRequiredDate("La fecha de la medición", DATE_RULES.progress),
        weight_kg: zMeasure("El peso", LIMITS.weightKg, " kg"),
        body_fat: zMeasure("El porcentaje de grasa", LIMITS.bodyFat, " %"),
        chest_cm: zMeasure("La medida de pecho", LIMITS.chestCm, " cm"),
        waist_cm: zMeasure("La medida de cintura", LIMITS.waistCm, " cm"),
        arm_cm: zMeasure("La medida de brazo", LIMITS.armCm, " cm"),
        notes: zNotes,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertAdmin(ctx);
    const hasValue = [
      data.weight_kg,
      data.body_fat,
      data.chest_cm,
      data.waist_cm,
      data.arm_cm,
    ].some((v) => v !== null);
    if (!hasValue && !data.notes) {
      throw new Error("Cargá al menos una medición o una nota.");
    }
    unwrap(
      await ctx.supabase
        .from("member_progress")
        .insert({ ...data, notes: data.notes || null })
        .select("id")
        .single(),
    );
    return { ok: true };
  });

export const removeProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertAdmin(ctx);
    const res = await ctx.supabase.from("member_progress").delete().eq("id", data.id);
    if (res.error) throw new Error(res.error.message);
    return { ok: true };
  });

/* ---------------------------------------------------------------- foto socio */

/**
 * Comprueba que los primeros bytes del archivo correspondan de verdad
 * al tipo de imagen declarado: así una imagen falsa (o un archivo con
 * otra extensión disfrazada) no llega nunca al almacenamiento.
 */
function isRealImage(bytes: Buffer, contentType: string): boolean {
  if (contentType === "image/png") {
    return bytes.length > 8 && bytes.subarray(0, 8).equals(PNG_MAGIC);
  }
  if (contentType === "image/webp") {
    return (
      bytes.length > 12 &&
      bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }
  // JPEG
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export const setMemberPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        member_id: z.string().uuid(),
        // Imagen en formato data:image/...;base64,... o null para quitarla
        image: z.string().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertAdmin(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Las reglas de la base sólo devuelven socios del gimnasio de quien consulta:
    // si el socio pertenece a otro gimnasio, acá no aparece y la operación se corta
    // ANTES de tocar ningún archivo.
    const current = unwrap(
      await ctx.supabase
        .from("members")
        .select("id, gym_id, photo_url")
        .eq("id", data.member_id)
        .maybeSingle(),
    );
    if (!current) throw new Error("Socio no encontrado en tu gimnasio.");

    if (!data.image) {
      unwrap(
        await ctx.supabase
          .from("members")
          .update({ photo_url: null })
          .eq("id", data.member_id)
          .select("id")
          .single(),
      );
      if (current.photo_url) {
        await supabaseAdmin.storage.from("member-photos").remove([current.photo_url]);
      }
      return { photoUrl: null };
    }

    const match = /^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/.exec(data.image);
    if (!match) throw new Error("La foto tiene que ser una imagen JPG, PNG o WEBP.");
    const declared = match[1]!;
    const contentType = declared === "image/jpg" ? "image/jpeg" : declared;
    let bytes: Buffer;
    try {
      bytes = Buffer.from(match[3]!, "base64");
    } catch {
      throw new Error("No pudimos leer la imagen. Probá con otro archivo.");
    }
    if (bytes.byteLength === 0) throw new Error("El archivo está vacío.");
    if (bytes.byteLength > 3_000_000) throw new Error("La foto es demasiado pesada (máximo 3 MB).");
    if (!isRealImage(bytes, contentType)) {
      throw new Error("El archivo no es una imagen válida (JPG, PNG o WEBP).");
    }

    const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
    // Carpeta por gimnasio y por socio: cada gimnasio queda aislado del resto.
    const path = `gym/${current.gym_id}/member/${data.member_id}/${Date.now()}.${ext}`;
    const up = await supabaseAdmin.storage
      .from("member-photos")
      .upload(path, bytes, { contentType, upsert: true });
    if (up.error) throw new Error(up.error.message);

    const saved = await ctx.supabase
      .from("members")
      .update({ photo_url: path })
      .eq("id", data.member_id)
      .select("id")
      .single();
    if (saved.error || !saved.data) {
      // Si la ficha no se pudo actualizar, no dejamos el archivo suelto.
      await supabaseAdmin.storage.from("member-photos").remove([path]);
      throw new Error(saved.error?.message ?? "No se pudo guardar la foto.");
    }
    if (current.photo_url && current.photo_url !== path) {
      await supabaseAdmin.storage.from("member-photos").remove([current.photo_url]);
    }
    return { photoUrl: await signedPhoto(path, current.gym_id, data.member_id) };
  });

/** Borra del almacenamiento todas las fotos guardadas para un socio. */
async function removeMemberPhotoFiles(gymId: string, memberId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const prefix = `gym/${gymId}/member/${memberId}`;
  const { data: files } = await supabaseAdmin.storage.from("member-photos").list(prefix, {
    limit: 100,
  });
  const paths = (files ?? []).map((f) => `${prefix}/${f.name}`);
  // Compatibilidad con fotos guardadas antes, en la carpeta vieja {member_id}/...
  const { data: legacy } = await supabaseAdmin.storage.from("member-photos").list(memberId, {
    limit: 100,
  });
  paths.push(...(legacy ?? []).map((f) => `${memberId}/${f.name}`));
  if (paths.length) await supabaseAdmin.storage.from("member-photos").remove(paths);
}

/**
 * Limpieza de archivos huérfanos: recorre la carpeta del gimnasio y borra
 * las fotos que ya no están enlazadas a ninguna ficha de socio.
 */
export const cleanupMemberPhotos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    await assertAdmin(ctx);
    const members = unwrap(await ctx.supabase.from("members").select("id, gym_id, photo_url"));
    const gymId = members?.[0]?.gym_id;
    if (!gymId) return { removed: 0 };
    const keep = new Set((members ?? []).map((m) => m.photo_url).filter(Boolean) as string[]);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const orphans: string[] = [];
    for (const member of members ?? []) {
      const prefix = `gym/${gymId}/member/${member.id}`;
      const { data: files } = await supabaseAdmin.storage
        .from("member-photos")
        .list(prefix, { limit: 100 });
      for (const file of files ?? []) {
        const full = `${prefix}/${file.name}`;
        if (!keep.has(full)) orphans.push(full);
      }
    }
    if (orphans.length) await supabaseAdmin.storage.from("member-photos").remove(orphans);
    return { removed: orphans.length };
  });
