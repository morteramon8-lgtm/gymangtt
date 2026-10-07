// Lógica pura (sin servidor) de la suscripción GYMANGT. Segura para el navegador.

export const GRACE_DAYS = 7; // días de gracia tras un pago rechazado
export const DEFAULT_PRICE_ARS = 34500;

export type SubStatus = "trial" | "active" | "past_due" | "cancelled" | "expired";

export type SubRow = {
  status: SubStatus;
  price_ars: number | string;
  trial_ends_at: string;
  current_period_end: string | null;
  past_due_since: string | null;
};

export type SubAccess = {
  /** Estado efectivo que ve el dueño. */
  state: SubStatus;
  /** true = puede operar. (Hoy sólo informa; el bloqueo es una fase posterior.) */
  allowed: boolean;
  /** Días que faltan de prueba / de gracia / hasta el fin del período. */
  daysLeft: number | null;
};

const DAY = 86_400_000;
const daysBetween = (to: Date, from: Date) => Math.ceil((to.getTime() - from.getTime()) / DAY);

export function subscriptionAccess(sub: SubRow | null, now: Date = new Date()): SubAccess {
  // Sin fila: no bloqueamos a nadie por un dato faltante.
  if (!sub) return { state: "trial", allowed: true, daysLeft: null };

  switch (sub.status) {
    case "active":
      return { state: "active", allowed: true, daysLeft: null };

    case "trial": {
      const end = new Date(sub.trial_ends_at);
      if (now < end) return { state: "trial", allowed: true, daysLeft: Math.max(daysBetween(end, now), 0) };
      return { state: "expired", allowed: false, daysLeft: 0 };
    }

    case "past_due": {
      const since = sub.past_due_since ? new Date(sub.past_due_since) : now;
      const graceEnd = new Date(since.getTime() + GRACE_DAYS * DAY);
      if (now < graceEnd) return { state: "past_due", allowed: true, daysLeft: Math.max(daysBetween(graceEnd, now), 0) };
      return { state: "expired", allowed: false, daysLeft: 0 };
    }

    case "cancelled": {
      // Cancelada pero ya pagada: sigue hasta que termine el período.
      const end = sub.current_period_end ? new Date(sub.current_period_end) : null;
      if (end && now < end) return { state: "cancelled", allowed: true, daysLeft: Math.max(daysBetween(end, now), 0) };
      return { state: "expired", allowed: false, daysLeft: 0 };
    }

    default:
      return { state: "expired", allowed: false, daysLeft: 0 };
  }
}

export const arsMoney = (n: number | string) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(Number(n));
