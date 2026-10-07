import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { AppShell, Field } from "@/components/gym/AppShell";
import { cancelSubscription, getSubscription, startSubscription } from "@/lib/billing.functions";
import { arsMoney } from "@/lib/billing-shared";

export const Route = createFileRoute("/_authenticated/suscripcion")({
  head: () => ({
    meta: [
      { title: "Suscripción — GYMANGT" },
      { name: "description", content: "Estado y administración de tu suscripción a GYMANGT." },
    ],
  }),
  component: SubscriptionPage,
});

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" }) : "—";

const LABEL: Record<string, { text: string; badge: string }> = {
  trial: { text: "Prueba gratis", badge: "badge badge-blue" },
  active: { text: "Activa", badge: "badge badge-green" },
  past_due: { text: "Pago pendiente", badge: "badge badge-amber" },
  cancelled: { text: "Cancelada", badge: "badge badge-amber" },
  expired: { text: "Vencida", badge: "badge badge-red" },
};

function SubscriptionPage() {
  const getFn = useServerFn(getSubscription);
  const startFn = useServerFn(startSubscription);
  const cancelFn = useServerFn(cancelSubscription);
  const queryClient = useQueryClient();

  const sub = useQuery({ queryKey: ["subscription"], queryFn: () => getFn() });
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sub.data?.defaultEmail && !email) setEmail(sub.data.defaultEmail);
  }, [sub.data?.defaultEmail]); // eslint-disable-line react-hooks/exhaustive-deps

  // Al volver de Mercado Pago el aviso (webhook) puede tardar unos segundos.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("preapproval_id")) {
      const t = setInterval(() => void queryClient.invalidateQueries({ queryKey: ["subscription"] }), 4000);
      const stop = setTimeout(() => clearInterval(t), 60_000);
      return () => {
        clearInterval(t);
        clearTimeout(stop);
      };
    }
  }, [queryClient]);

  const start = useMutation({
    mutationFn: () => startFn({ data: { payerEmail: email } }),
    onSuccess: ({ url }) => {
      window.location.href = url; // checkout de Mercado Pago
    },
    onError: (e) => setError(e instanceof Error ? e.message : "No se pudo iniciar la suscripción."),
  });

  const cancel = useMutation({
    mutationFn: () => cancelFn(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["subscription"] }),
    onError: (e) => setError(e instanceof Error ? e.message : "No se pudo cancelar."),
  });

  const d = sub.data;
  const state = d?.access.state ?? "trial";
  const label = LABEL[state] ?? LABEL.trial;
  const canSubscribe = state !== "active";

  return (
    <AppShell title="Suscripción GYMANGT">
      {error ? <div className="alert">{error}</div> : null}
      {sub.isLoading ? <div className="panel"><div className="panel-body">Cargando…</div></div> : null}
      {sub.isSuccess && !d ? (
        <div className="panel"><div className="panel-body">No hay datos de suscripción para tu gimnasio.</div></div>
      ) : null}

      {d ? (
        <div className="panel">
          <div className="panel-head">Plan GYMANGT</div>
          <div className="panel-body">
            <p style={{ fontSize: 28, fontWeight: 700, margin: "0 0 4px" }}>
              {arsMoney(d.priceArs)} <span style={{ fontSize: 14, fontWeight: 400 }}>/ mes</span>
            </p>
            <p style={{ margin: "0 0 16px" }}>Todo incluido. Podés cancelar cuando quieras.</p>

            <p>
              Estado: <span className={label.badge}>{label.text}</span>
            </p>
            {state === "trial" ? <p>Te quedan {d.access.daysLeft} días de prueba (hasta el {fmtDate(d.trialEndsAt)}).</p> : null}
            {state === "active" ? <p>Próximo cobro: {fmtDate(d.currentPeriodEnd)}</p> : null}
            {state === "past_due" ? (
              <p>No pudimos cobrar tu último pago. Tenés {d.access.daysLeft} días para regularizarlo. Tus datos están a salvo.</p>
            ) : null}
            {state === "cancelled" ? <p>Tu suscripción termina el {fmtDate(d.currentPeriodEnd)}. Podés reactivarla cuando quieras.</p> : null}
            {state === "expired" ? <p>Tu suscripción está vencida. Tus socios, pagos y rutinas siguen guardados: al activarla, todo vuelve a funcionar.</p> : null}

            {canSubscribe ? (
              <>
                <Field label="Email de tu cuenta de Mercado Pago">
                  <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={start.isPending || !email}
                  onClick={() => {
                    setError(null);
                    start.mutate();
                  }}
                >
                  {start.isPending ? "Redirigiendo…" : state === "expired" || state === "cancelled" ? "Reactivar suscripción" : "Activar suscripción"}
                </button>
              </>
            ) : null}

            {state === "active" ? (
              <button
                className="btn btn-danger btn-sm"
                type="button"
                disabled={cancel.isPending}
                onClick={() => {
                  if (window.confirm("¿Cancelar la suscripción? Seguís con acceso hasta el fin del período pagado.")) {
                    setError(null);
                    cancel.mutate();
                  }
                }}
              >
                {cancel.isPending ? "Cancelando…" : "Cancelar suscripción"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
