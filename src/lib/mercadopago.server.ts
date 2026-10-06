// SOLO SERVIDOR. Nunca importar desde componentes o rutas de página.
// Variables de entorno necesarias (se cargan como secretos del servidor):
//   MP_ACCESS_TOKEN    -> Access Token PRIVADO de Mercado Pago (TEST- o APP_USR-)
//   MP_WEBHOOK_SECRET  -> "Clave secreta" del webhook (Tus integraciones > Webhooks)
//   APP_URL            -> https://tu-dominio.com (sin barra final)
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DEFAULT_PRICE_ARS } from "./billing-shared";

const MP_API = "https://api.mercadopago.com";

// Las tablas nuevas todavía no están en types.ts: usamos el cliente sin tipos.
const db = () => supabaseAdmin as unknown as SupabaseClient;

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name}.`);
  return v;
}

async function mp<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${MP_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env("MP_ACCESS_TOKEN")}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`[MercadoPago] ${init.method ?? "GET"} ${path} -> ${res.status}: ${text}`);
    throw new Error("Mercado Pago no pudo procesar la solicitud.");
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export type MpPreapproval = {
  id: string;
  status: "pending" | "authorized" | "paused" | "cancelled" | string;
  external_reference?: string;
  payer_email?: string;
  init_point?: string;
  next_payment_date?: string | null;
  summarized?: { last_charged_date?: string | null } | null;
};

type MpAuthorizedPayment = {
  id: number | string;
  preapproval_id?: string;
  status?: string; // scheduled | processed | recycling | cancelled
  payment?: { status?: string } | null; // approved | rejected | ...
};

/** Crea la suscripción mensual y devuelve el link de pago (init_point). */
export async function createPreapproval(input: {
  gymId: string;
  payerEmail: string;
  gymName: string;
  priceArs?: number;
}): Promise<MpPreapproval> {
  const price = input.priceArs ?? Number(process.env.GYMANGT_PRICE_ARS ?? DEFAULT_PRICE_ARS);
  return mp<MpPreapproval>("/preapproval", {
    method: "POST",
    body: JSON.stringify({
      reason: "Suscripción GYMANGT",
      external_reference: input.gymId,
      payer_email: input.payerEmail,
      back_url: `${env("APP_URL")}/suscripcion`,
      status: "pending",
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: price,
        currency_id: "ARS",
      },
    }),
  });
}

export const getPreapproval = (id: string) => mp<MpPreapproval>(`/preapproval/${encodeURIComponent(id)}`);

export const cancelPreapproval = (id: string) =>
  mp<MpPreapproval>(`/preapproval/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ status: "cancelled" }),
  });

const getAuthorizedPayment = (id: string) =>
  mp<MpAuthorizedPayment>(`/authorized_payments/${encodeURIComponent(id)}`);

/** Valida x-signature según la documentación de Mercado Pago. */
export function verifyWebhookSignature(request: Request, dataId: string): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return false;

  const signature = request.headers.get("x-signature") ?? "";
  const requestId = request.headers.get("x-request-id") ?? "";

  let ts = "";
  let v1 = "";
  for (const part of signature.split(",")) {
    const [k, ...rest] = part.split("=");
    const value = rest.join("=").trim();
    if (k?.trim() === "ts") ts = value;
    if (k?.trim() === "v1") v1 = value;
  }
  if (!ts || !v1) return false;

  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(v1, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Marca un aviso como procesado. Devuelve false si ya se había procesado. */
export async function claimEvent(key: string, topic: string, resourceId: string, payload: unknown) {
  const { error } = await db()
    .from("billing_events")
    .insert({ event_key: key, topic, resource_id: resourceId, payload });
  if (!error) return true;
  if (error.code === "23505") return false; // ya existía
  throw new Error(error.message);
}

/** Libera el aviso para que Mercado Pago pueda reintentarlo si falló el procesamiento. */
export async function releaseEvent(key: string) {
  await db().from("billing_events").delete().eq("event_key", key);
}

type SubRowDb = {
  gym_id: string;
  status: string;
  started_at: string | null;
  past_due_since: string | null;
  current_period_end: string | null;
};

async function findSubByPreapproval(preapprovalId: string): Promise<SubRowDb | null> {
  const { data, error } = await db()
    .from("gym_subscriptions")
    .select("gym_id, status, started_at, past_due_since, current_period_end")
    .eq("mp_preapproval_id", preapprovalId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SubRowDb | null) ?? null;
}

/**
 * Consulta el estado REAL en Mercado Pago (no confiamos en el contenido del aviso)
 * y actualiza gym_subscriptions. Sólo toca suscripciones que nosotros creamos
 * (mp_preapproval_id guardado al iniciar el checkout).
 */
export async function syncPreapproval(preapprovalId: string) {
  const sub = await findSubByPreapproval(preapprovalId);
  if (!sub) {
    console.warn(`[MercadoPago] preapproval ${preapprovalId} desconocido; se ignora.`);
    return;
  }
  const pre = await getPreapproval(preapprovalId);
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updated_at: now };

  switch (pre.status) {
    case "authorized":
      patch.status = "active";
      patch.past_due_since = null;
      patch.cancelled_at = null;
      patch.started_at = sub.started_at ?? now;
      patch.current_period_start = pre.summarized?.last_charged_date ?? now;
      patch.current_period_end = pre.next_payment_date ?? null;
      break;
    case "paused":
      patch.status = "past_due";
      patch.past_due_since = sub.past_due_since ?? now;
      break;
    case "cancelled":
      patch.status = "cancelled";
      patch.cancelled_at = now;
      break;
    default:
      return; // pending u otro: sin cambios
  }

  const { error } = await db().from("gym_subscriptions").update(patch).eq("gym_id", sub.gym_id);
  if (error) throw new Error(error.message);
}

/** Aviso de cobro mensual: si fue rechazado, entra en período de gracia. */
export async function syncAuthorizedPayment(paymentId: string) {
  const ap = await getAuthorizedPayment(paymentId);
  if (!ap.preapproval_id) return;

  const rejected = ap.payment?.status === "rejected";
  if (!rejected) {
    await syncPreapproval(ap.preapproval_id);
    return;
  }

  const sub = await findSubByPreapproval(ap.preapproval_id);
  if (!sub) return;
  const now = new Date().toISOString();
  const { error } = await db()
    .from("gym_subscriptions")
    .update({ status: "past_due", past_due_since: sub.past_due_since ?? now, updated_at: now })
    .eq("gym_id", sub.gym_id);
  if (error) throw new Error(error.message);
}
