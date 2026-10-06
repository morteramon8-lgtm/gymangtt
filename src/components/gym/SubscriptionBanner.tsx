import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getSubscription } from "@/lib/billing.functions";

/**
 * Aviso discreto (una línea) sólo cuando hace falta actuar.
 * No bloquea nada y, si algo falla al consultar, no muestra nada.
 */
export function SubscriptionBanner() {
  const fn = useServerFn(getSubscription);
  const { data } = useQuery({
    queryKey: ["subscription"],
    queryFn: () => fn(),
    retry: false,
    staleTime: 5 * 60_000,
  });

  if (!data) return null;
  const { state, daysLeft } = data.access;

  let text: string | null = null;
  if (state === "trial" && (daysLeft ?? 99) <= 7) text = `Tu prueba de GYMANGT termina en ${daysLeft} día${daysLeft === 1 ? "" : "s"}.`;
  if (state === "past_due") text = `No pudimos cobrar tu suscripción. Regularizala en ${daysLeft} día${daysLeft === 1 ? "" : "s"}.`;
  if (state === "cancelled") text = `Tu suscripción termina en ${daysLeft} día${daysLeft === 1 ? "" : "s"}.`;
  if (state === "expired") text = "Tu suscripción de GYMANGT está vencida. Tus datos están a salvo.";
  if (!text) return null;

  return (
    <div className="alert" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
      <span>{text}</span>
      <Link to="/suscripcion" className="btn btn-primary btn-sm">
        {state === "expired" ? "Activar" : "Ver suscripción"}
      </Link>
    </div>
  );
}
