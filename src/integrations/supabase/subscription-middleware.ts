import { createMiddleware } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireSupabaseAuth } from "./auth-middleware";

/**
 * requireSupabaseAuth + bloqueo por suscripción.
 * Úsalo en toda server function de la app, salvo las de sesión (getMe) y las de
 * facturación (para que un gimnasio bloqueado pueda pagar y reactivarse).
 */
export const requireActiveSubscription = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const ctx = context as unknown as { supabase: SupabaseClient; userId: string };
    // Import dinámico: el código de servidor no debe viajar al navegador.
    const { assertGymAccess } = await import("@/lib/subscription-guard.server");
    await assertGymAccess(ctx);
    return next();
  });
