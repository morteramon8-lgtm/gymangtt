import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { subscriptionAccess, type SubRow } from "./billing-shared";

// Este archivo viaja al navegador: lo que es sólo-servidor se importa
// dinámicamente DENTRO de los handlers (igual que indica client.server.ts).

type Ctx = {
  supabase: SupabaseClient;
  userId: string;
  claims?: { email?: string };
};

async function assertAdminAndGym(ctx: Ctx): Promise<string> {
  const { data: role } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!role) throw new Error("Esta acción es sólo para el administrador del gimnasio.");

  const { data: gymId, error } = await ctx.supabase.rpc("current_gym_id");
  if (error || !gymId) throw new Error("No encontramos tu gimnasio.");
  return gymId as string;
}

/** Estado de la suscripción GYMANGT del gimnasio. Para socios devuelve null. */
export const getSubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;

    const { data: role } = await ctx.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", ctx.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) return null;

    // Lee con el usuario (respeta RLS): sólo ve la suscripción de su gimnasio.
    const { data, error } = await ctx.supabase
      .from("gym_subscriptions")
      .select("status, price_ars, trial_ends_at, current_period_end, past_due_since, mp_preapproval_id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;

    const sub = data as SubRow & { mp_preapproval_id: string | null };
    return {
      status: sub.status,
      priceArs: Number(sub.price_ars),
      trialEndsAt: sub.trial_ends_at,
      currentPeriodEnd: sub.current_period_end,
      hasMercadoPago: Boolean(sub.mp_preapproval_id),
      access: subscriptionAccess(sub),
      defaultEmail: ctx.claims?.email ?? "",
    };
  });

/** Crea (o reutiliza) la suscripción en Mercado Pago y devuelve el link de pago. */
export const startSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ payerEmail: z.string().trim().email("Email inválido.") }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const gymId = await assertAdminAndGym(ctx);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const mpServer = await import("./mercadopago.server");
    const admin = supabaseAdmin as unknown as SupabaseClient;

    const { data: sub, error } = await admin
      .from("gym_subscriptions")
      .select("status, mp_preapproval_id")
      .eq("gym_id", gymId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!sub) throw new Error("No encontramos la suscripción de tu gimnasio.");
    if (sub.status === "active") throw new Error("Tu suscripción ya está activa.");

    // Si ya había un checkout pendiente, lo reutilizamos (evita suscripciones huérfanas).
    if (sub.mp_preapproval_id) {
      const existing = await mpServer.getPreapproval(sub.mp_preapproval_id);
      if (existing.status === "authorized") {
        await mpServer.syncPreapproval(sub.mp_preapproval_id);
        throw new Error("Tu suscripción ya está activa.");
      }
      if (existing.status === "pending" && existing.init_point) {
        return { url: existing.init_point };
      }
    }

    const { data: gym } = await admin.from("gyms").select("name").eq("id", gymId).maybeSingle();
    const pre = await mpServer.createPreapproval({
      gymId,
      payerEmail: data.payerEmail,
      gymName: (gym?.name as string | undefined) ?? "Gimnasio",
    });
    if (!pre.init_point) throw new Error("Mercado Pago no devolvió el link de pago.");

    const { error: upErr } = await admin
      .from("gym_subscriptions")
      .update({ mp_preapproval_id: pre.id, mp_payer_email: data.payerEmail, updated_at: new Date().toISOString() })
      .eq("gym_id", gymId);
    if (upErr) throw new Error(upErr.message);

    return { url: pre.init_point };
  });

/** Cancela el cobro mensual. Mantiene el acceso hasta el fin del período pagado. */
export const cancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    const gymId = await assertAdminAndGym(ctx);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const mpServer = await import("./mercadopago.server");
    const admin = supabaseAdmin as unknown as SupabaseClient;

    const { data: sub } = await admin
      .from("gym_subscriptions")
      .select("mp_preapproval_id")
      .eq("gym_id", gymId)
      .maybeSingle();
    if (!sub?.mp_preapproval_id) throw new Error("No hay una suscripción para cancelar.");

    await mpServer.cancelPreapproval(sub.mp_preapproval_id as string);
    await mpServer.syncPreapproval(sub.mp_preapproval_id as string);
    return { ok: true };
  });
