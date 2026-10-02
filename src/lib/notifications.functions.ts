import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

import { nowTimestamp } from "./dates";

export const DEFAULT_WHATSAPP_TEMPLATE =
  "Hola {nombre}! Te recordamos que tu cuota de {gimnasio} vence el {vencimiento}. Podés abonarla online desde este link de Mercado Pago: {link_pago} o por transferencia al Alias: {alias}. Muchas gracias!";

type Ctx = {
  supabase: import("@supabase/supabase-js").SupabaseClient<
    import("@/integrations/supabase/types").Database
  >;
  userId: string;
};

function unwrap<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

async function isAdmin(ctx: Ctx) {
  const { data } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .eq("role", "admin")
    .maybeSingle();
  return Boolean(data);
}

async function assertAdmin(ctx: Ctx) {
  if (!(await isAdmin(ctx))) {
    throw new Error("Esta acción es sólo para el administrador del gimnasio.");
  }
}

/** Gimnasio real del usuario; las configuraciones se filtran por él. */
async function gymIdOf(ctx: Ctx): Promise<string> {
  const { data, error } = await ctx.supabase.rpc("current_gym_id");
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No encontramos tu gimnasio.");
  return data;
}

export type NewNotification = {
  member_id: string;
  user_id: string | null;
  kind: "vencimiento" | "rutina_asignada" | "rutina_modificada";
  title: string;
  body: string;
  dedup_key: string;
};

/**
 * Guarda avisos dentro de la aplicación. La clave `dedup_key` evita que el
 * mismo aviso se repita: si ya existe, la base lo ignora en silencio.
 * Si el socio todavía no tiene cuenta, el aviso queda "pendiente" para que
 * el administrador sepa que nadie lo va a ver dentro de la app.
 */
export async function pushNotifications(ctx: Ctx, items: NewNotification[]): Promise<number> {
  if (items.length === 0) return 0;
  const rows = items.map((n) => ({
    ...n,
    channel: "in_app" as const,
    status: n.user_id ? ("entregado" as const) : ("pendiente" as const),
    error: n.user_id ? null : "El socio todavía no tiene cuenta en la aplicación.",
  }));
  const res = await ctx.supabase
    .from("notifications")
    .upsert(rows, { onConflict: "dedup_key", ignoreDuplicates: true })
    .select("id");
  if (res.error) throw new Error(res.error.message);
  return res.data?.length ?? 0;
}

/* ------------------------------------------------------------- ajustes */

export const getNotificationSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    return unwrap(
      await ctx.supabase
        .from("gym_notification_settings")
        .select("*")
        .eq("gym_id", await gymIdOf(ctx))
        .maybeSingle(),
    );
  });

export const saveNotificationSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        expiry_enabled: z.boolean(),
        days_before: z.number().int().min(1).max(60),
        notify_on_due_date: z.boolean(),
        notify_overdue: z.boolean(),
        routine_enabled: z.boolean(),
        whatsapp_template: z.string().trim().min(1, "El mensaje no puede quedar vacío").max(2000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertAdmin(ctx);
    unwrap(
      await ctx.supabase
        .from("gym_notification_settings")
        .update({ ...data, updated_at: nowTimestamp() })
        .eq("gym_id", await gymIdOf(ctx))
        .select("gym_id")
        .single(),
    );
    return { ok: true };
  });

/* --------------------------------------------------- avisos de vencimiento */

/**
 * Revisa las membresías y genera los recordatorios que correspondan hoy.
 * Sólo crea avisos nuevos: los ya generados no se duplican.
 */
export const runExpiryScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    await assertAdmin(ctx);
    const settings = unwrap(
      await ctx.supabase
        .from("gym_notification_settings")
        .select("*")
        .eq("gym_id", await gymIdOf(ctx))
        .maybeSingle(),
    );
    if (settings && settings.expiry_enabled === false) {
      return { created: 0, disabled: true as const, checked: 0 };
    }
    // Misma revisión que corre sola todos los días; en la base se limita al
    // gimnasio del administrador y no repite avisos ya generados.
    const res = unwrap(await ctx.supabase.rpc("run_expiry_scan", {})) as unknown as {
      created: number;
      checked: number;
    };
    return { created: res.created, disabled: false as const, checked: res.checked };
  });

/* --------------------------------------------------------- lectura de datos */

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    await assertAdmin(ctx);
    const rows =
      unwrap(
        await ctx.supabase
          .from("notifications")
          .select(
            "*, members(id, first_name, last_name, email, phone, expires_at, plans(payment_link))",
          )
          .order("created_at", { ascending: false })
          .limit(300),
      ) ?? [];
    const gymId = await gymIdOf(ctx);
    const settings = unwrap(
      await ctx.supabase.from("gym_notification_settings").select("*").eq("gym_id", gymId).maybeSingle(),
    );
    const gym = unwrap(
      await ctx.supabase
        .from("gyms")
        .select("name, bank_alias")
        .eq("id", gymId)
        .maybeSingle(),
    );
    const stats = {
      total: rows.length,
      entregados: rows.filter((r) => r.status === "entregado").length,
      leidos: rows.filter((r) => r.status === "leido").length,
      pendientes: rows.filter((r) => r.status === "pendiente").length,
      fallidos: rows.filter((r) => r.status === "fallido").length,
    };
    return { rows, settings, stats, gym };
  });

export const myNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    const rows =
      unwrap(
        await ctx.supabase
          .from("notifications")
          .select("id, kind, title, body, status, read_at, created_at")
          .eq("user_id", ctx.userId)
          .order("created_at", { ascending: false })
          .limit(50),
      ) ?? [];
    return { rows, unread: rows.filter((r) => !r.read_at).length };
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    let q = ctx.supabase
      .from("notifications")
      .update({ read_at: nowTimestamp(), status: "leido" })
      .eq("user_id", ctx.userId)
      .is("read_at", null);
    if (data.id) q = q.eq("id", data.id);
    const res = await q.select("id");
    if (res.error) throw new Error(res.error.message);
    return { ok: true, updated: res.data?.length ?? 0 };
  });
