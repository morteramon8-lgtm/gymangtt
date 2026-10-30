import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { AppShell, Field } from "@/components/gym/AppShell";
import { cancelSubscription, getSubscription, refreshSubscription, startSubscription } from "@/lib/billing.functions";
import { arsMoney } from "@/lib/billing-shared";

export const Route = createFileRoute("/_authenticated/suscripcion")({
  head: () => ({
    meta: [
      { title: "Suscripción — GYMANGT" },
      { name: "description", content: "Estado y administración de tu suscripción a GYMANGT." },
      { property: "og:title", content: "Suscripción — GYMANGT" },
      { property: "og:description", content: "Estado y administración de tu suscripción a GYMANGT." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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
  const refreshFn = useServerFn(refreshSubscription);
  const queryClient = useQueryClient();

  const sub = useQuery({ queryKey: ["subscription"], queryFn: () => getFn() });
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (sub.data?.defaultEmail && !email) setEmail(sub.data.defaultEmail);
  }, [sub.data?.defaultEmail]); // eslint-disable-line react-hooks/exhaustive-deps

  // Al volver de Mercado Pago consultamos el estado real (no dependemos sólo del aviso/webhook).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("preapproval_id")) {
      const tick = () => {
        void refreshFn()
          .catch(() => undefined)
          .finally(() => {
            void queryClient.invalidateQueries({ queryKey: ["subscription"] });
            void queryClient.invalidateQueries({ queryKey: ["access"] }); // desbloquea apenas entra el pago
          });
      };
      tick();
      const t = setInterval(tick, 4000);
      const stop = setTimeout(() => clearInterval(t), 60_000);
      return () => {
        clearInterval(t);
        clearTimeout(stop);
      };
    }
  }, [queryClient]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = useMutation({
    mutationFn: () => startFn({ data: { payerEmail: email } }),
    onSuccess: ({ url }) => {
      window.location.href = url; // checkout de Mercado Pago
    },
    onError: (e) => setError(e instanceof Error ? e.message : "No se pudo iniciar la suscripción."),
  });

  const refresh = useMutation({
    mutationFn: () => refreshFn(),
    onSuccess: ({ mpStatus }) => {
      void queryClient.invalidateQueries({ queryKey: ["subscription"] });
      void queryClient.invalidateQueries({ queryKey: ["access"] });
      setInfo(
        mpStatus === "authorized"
          ? "¡Listo! Mercado Pago confirmó el pago y tu suscripción está activa."
          : "Mercado Pago todavía no confirma el pago. Si pagaste hace unos minutos, esperá un poco y volvé a probar.",
      );
    },
    onError: (e) => setError(e instanceof Error ? e.message : "No se pudo verificar el estado."),
  });

  const cancel = useMutation({
    mutationFn: () => cancelFn(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["subscription"] });
      void queryClient.invalidateQueries({ queryKey: ["access"] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "No se pudo cancelar."),
  });

  const d = sub.data;
  const state = d?.access.state ?? "trial";
  const label = LABEL[state] ?? LABEL.trial;
  const canSubscribe = state !== "active";

  return (
    <AppShell title="Suscripción GYMANGT">
      {error ? <div className="alert">{error}</div> : null}
      {info ? <div className="alert badge-green">{info}</div> : null}
      {sub.isLoading ? <div className="panel"><div className="panel-body">Cargando…</div></div> : null}
      {sub.isSuccess && !d ? (
        <div className="panel"><div className="panel-body">No hay datos de suscripción para tu gimnasio.</div></div>
      ) : null}

      {d ? (
        <div className="panel subscription-vertical">
          <div className="panel-head subscription-crown">
            <div className="subscription-emblem" aria-hidden="true">
              <span className="subscription-ring" />
              <svg viewBox="0 0 100 100" className="subscription-dumbbell" fill="none">
                <path d="M30 50h40M22 32v36M32 26v48M68 26v48M78 32v36" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
              </svg>
            </div>
            <span>Plan GYMANGT</span>
          </div>
          <div className="panel-body subscription-details">
            <p className="subscription-price">
              {arsMoney(d.priceArs)} <span>/ mes</span>
            </p>
            <p className="subscription-summary">Todo incluido. Podés cancelar cuando quieras.</p>

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

            {d.hasMercadoPago && state !== "active" ? (
              <div className="subscription-verification">
                <p className="muted text-xs" style={{ margin: "0 0 8px" }}>
                  ¿Ya pagaste en Mercado Pago y acá no figura activa?
                </p>
                <button
                  className="btn btn-sm"
                  type="button"
                  disabled={refresh.isPending}
                  onClick={() => {
                    setError(null);
                    setInfo(null);
                    refresh.mutate();
                  }}
                >
                  {refresh.isPending ? "Verificando…" : "Verificar estado del pago"}
                </button>
              </div>
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
