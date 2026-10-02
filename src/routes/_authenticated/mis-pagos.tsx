import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { AppShell, useSoonDays } from "@/components/gym/AppShell";
import { getMyPortal } from "@/lib/gym.functions";
import { formatDate, memberStatus, money, STATUS_BADGE, STATUS_LABEL } from "@/lib/gym-shared";

export const Route = createFileRoute("/_authenticated/mis-pagos")({
  head: () => ({
    meta: [
      { title: "Mis pagos — GYMANGT" },
      { name: "description", content: "Tus pagos registrados y la fecha de vencimiento." },
      { property: "og:title", content: "Mis pagos — GYMANGT" },
      { property: "og:description", content: "Historial de pagos del socio." },
    ],
  }),
  component: MyPayments,
});

function MyPayments() {
  // Ventana de aviso configurada en Avisos: una sola regla para todo el sistema.
  const soonDays = useSoonDays();
  const fn = useServerFn(getMyPortal);
  const { data, isLoading } = useQuery({ queryKey: ["portal"], queryFn: () => fn() });
  const st = memberStatus(data?.member?.expires_at ?? null, data?.member?.active ?? true, soonDays);

  return (
    <AppShell title="Mis pagos">
      {isLoading ? (
        <div className="empty">Cargando pagos…</div>
      ) : (
        <>
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-label">Estado de la cuota</div>
              <div className="stat-value" style={{ fontSize: 20 }}>
                <span className={STATUS_BADGE[st]}>{STATUS_LABEL[st]}</span>
              </div>
              <div className="stat-change">
                Vence {formatDate(data?.member?.expires_at ?? null)}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Pagos registrados</div>
              <div className="stat-value">{data?.payments.length ?? 0}</div>
            </div>
          </div>

          <PayPanel data={data?.payOptions} currentPlanId={data?.member?.plan_id ?? null} />

          <div className="table-wrap">
            {(data?.payments ?? []).length === 0 ? (
              <div className="empty">Todavía no hay pagos registrados a tu nombre.</div>
            ) : (
              <table className="gym-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Concepto</th>
                    <th>Plan</th>
                    <th>Cubre hasta</th>
                    <th>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.payments.map((p) => (
                    <tr key={p.id}>
                      <td className="muted">{formatDate(p.paid_on)}</td>
                      <td>{p.concept}</td>
                      <td className="muted">{p.plans?.name ?? "—"}</td>
                      <td className="muted">{formatDate(p.covers_until)}</td>
                      <td style={{ color: "var(--success)", fontWeight: 600 }}>
                        {money(p.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </AppShell>
  );
}

type PayOptions = {
  settings: {
    name: string;
    bank_alias: string | null;
    bank_cbu: string | null;
    bank_holder: string | null;
    payment_instructions: string | null;
  } | null;
  plans: { id: string; name: string; price: number; months: number; payment_link: string | null }[];
};

function PayPanel({
  data,
  currentPlanId,
}: {
  data: PayOptions | undefined;
  currentPlanId: string | null;
}) {
  if (!data) return null;
  const s = data.settings;
  const linked = data.plans.filter((p) => p.payment_link);
  const hasBank = !!(s?.bank_alias || s?.bank_cbu);
  if (linked.length === 0 && !hasBank) return null;
  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-head">Pagar mi cuota</div>
      <div className="panel-body">
        {linked.map((p) => (
          <div className="list-item" key={p.id}>
            <div>
              <div style={{ fontWeight: 500 }}>
                {p.name} {p.id === currentPlanId ? "(tu plan)" : ""}
              </div>
              <div className="rsub">{money(p.price)}</div>
            </div>
            <a
              className="btn btn-primary btn-sm"
              href={p.payment_link!}
              target="_blank"
              rel="noopener noreferrer"
            >
              Pagar con Mercado Pago
            </a>
          </div>
        ))}
        {hasBank ? (
          <div className="list-item" style={{ display: "block" }}>
            <div style={{ fontWeight: 500 }}>Transferencia bancaria</div>
            {s?.bank_alias ? <div className="rsub">Alias: {s.bank_alias}</div> : null}
            {s?.bank_cbu ? <div className="rsub">CBU/CVU: {s.bank_cbu}</div> : null}
            {s?.bank_holder ? <div className="rsub">Titular: {s.bank_holder}</div> : null}
          </div>
        ) : null}
        {s?.payment_instructions ? (
          <p className="muted mt-2 text-xs">{s.payment_instructions}</p>
        ) : null}
        <p className="muted mt-2 text-xs">
          Tu pago figura como registrado cuando el gimnasio lo confirma.
        </p>
      </div>
    </div>
  );
}
