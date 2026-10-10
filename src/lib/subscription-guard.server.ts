// SOLO SERVIDOR. Decide si el gimnasio del usuario puede usar el sistema según
// su suscripción GYMANGT. Se importa dinámicamente desde el middleware y desde
// getAccessStatus (igual que mercadopago.server.ts).
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isActiveLapsed, subscriptionAccess, type SubAccess, type SubRow } from "./billing-shared";
import { syncPreapproval } from "./mercadopago.server";

type Ctx = { supabase: SupabaseClient; userId: string };
type SubDb = SubRow & { mp_preapproval_id: string | null };

export type GymAccess = SubAccess & { role: "admin" | "socio" };

const SELECT = "status, price_ars, trial_ends_at, current_period_end, past_due_since, mp_preapproval_id";
const ALLOW_CACHE_MS = 15_000; // sólo se cachea "permitido": al pagar, el desbloqueo es inmediato
const RECONCILE_EVERY_MS = 10 * 60_000;

const allowedUntil = new Map<string, number>();
const lastReconcile = new Map<string, number>();

const db = () => supabaseAdmin as unknown as SupabaseClient;

async function readSub(gymId: string): Promise<SubDb | null> {
  const { data, error } = await db().from("gym_subscriptions").select(SELECT).eq("gym_id", gymId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SubDb | null) ?? null;
}

/** Acceso efectivo del gimnasio del usuario (administrador o socio). */
export async function resolveGymAccess(ctx: Ctx, opts: { useCache?: boolean } = {}): Promise<GymAccess> {
  const { data: roleRow } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .eq("role", "admin")
    .maybeSingle();
  const role: GymAccess["role"] = roleRow ? "admin" : "socio";

  const { data: gymId, error: gymErr } = await ctx.supabase.rpc("current_gym_id");
  // Sin gimnasio no hay datos que proteger; el resto de la función ya responde "No encontramos tu gimnasio".
  if (gymErr || !gymId) return { state: "trial", allowed: true, daysLeft: null, role };
  const gym = gymId as string;

  if (opts.useCache && (allowedUntil.get(gym) ?? 0) > Date.now()) {
    return { state: "active", allowed: true, daysLeft: null, role };
  }

  try {
    let sub = await readSub(gym);

    // Gimnasio sin fila de suscripción (p. ej. creado antes de existir el trigger):
    // se le crea su período de prueba. Sin esto quedaría gratis y sin bloqueo para siempre.
    if (!sub) {
      const { error: insErr } = await db().from("gym_subscriptions").upsert({ gym_id: gym }, { onConflict: "gym_id", ignoreDuplicates: true });
      if (insErr) console.error("[subscription-guard] no se pudo crear la suscripción de prueba", insErr.message);
      else sub = await readSub(gym);
    }

    // "Activa" pero con el período vencido hace días: puede haberse perdido un aviso de MP.
    if (sub && isActiveLapsed(sub) && sub.mp_preapproval_id) {
      const last = lastReconcile.get(gym) ?? 0;
      if (Date.now() - last > RECONCILE_EVERY_MS) {
        lastReconcile.set(gym, Date.now());
        try {
          await syncPreapproval(sub.mp_preapproval_id);
          sub = await readSub(gym);
        } catch (e) {
          console.error("[subscription-guard] no se pudo reconciliar con Mercado Pago", e);
        }
      }
    }

    const access = subscriptionAccess(sub);
    if (access.allowed) allowedUntil.set(gym, Date.now() + ALLOW_CACHE_MS);
    else allowedUntil.delete(gym);
    return { ...access, role };
  } catch (e) {
    // Un error técnico al consultar NO debe dejar a todos sin servicio.
    console.error("[subscription-guard] error al leer la suscripción; se permite el acceso", e);
    return { state: "trial", allowed: true, daysLeft: null, role };
  }
}

/** Lanza un error legible si el gimnasio está bloqueado por la suscripción. */
export async function assertGymAccess(ctx: Ctx): Promise<void> {
  const access = await resolveGymAccess(ctx, { useCache: true });
  if (access.allowed) return;
  throw new Error(
    access.role === "admin"
      ? "La suscripción de GYMANGT está vencida. Activala desde “Suscripción” para volver a usar el sistema."
      : "El acceso de tu gimnasio a GYMANGT está suspendido por el momento. Consultá en recepción.",
  );
}
