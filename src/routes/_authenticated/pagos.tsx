import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { AppShell, useSoonDays } from "@/components/gym/AppShell";
import { deletePayment, listMembers, listPayments } from "@/lib/gym.functions";
import {
  formatDate,
  initials,
  memberStatus,
  money,
  STATUS_BADGE,
  STATUS_LABEL,
} from "@/lib/gym-shared";

export const Route = createFileRoute("/_authenticated/pagos")({
  head: () => ({
    meta: [
      { title: "Pagos — GYMANGT" },
      { name: "description", content: "Cobros registrados y cuotas pendientes del gimnasio." },
      { property: "og:title", content: "Pagos — GYMANGT" },
      { property: "og:description", content: "Control de cobros y vencimientos." },
    ],
  }),
  component: PaymentsPage,
});

function PaymentsPage() {
  // Ventana de aviso configurada en Avisos: una sola regla para todo el sistema.
  const soonDays = useSoonDays();
  const paymentsFn = useServerFn(listPayments);
  const membersFn = useServerFn(listMembers);
  const deletePaymentFn = useServerFn(deletePayment);
  const queryClient = useQueryClient();
  const payments = useQuery({ queryKey: ["payments"], queryFn: () => paymentsFn() });
  const members = useQuery({ queryKey: ["members"], queryFn: () => membersFn() });
  const [tab, setTab] = useState<"cobrados" | "pendientes">("cobrados");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleVoid(id: string) {
    const reason = window.prompt(
      "¿Anular este pago? Queda guardado como anulado y el vencimiento del socio se recalcula. Indicá el motivo:",
    );
    if (reason === null) return;
    if (reason.trim().length < 3) {
      window.alert("Indicá el motivo de la anulación.");
      return;
    }
    setBusyId(id);
    try {
      await deletePaymentFn({ data: { id, reason: reason.trim() } });
      await queryClient.invalidateQueries();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "No pudimos anular el pago.");
    } finally {
      setBusyId(null);
    }
  }

  const pending = (members.data ?? []).filter((m) => {
    const st = memberStatus(m.expires_at, m.active, soonDays);
    return st === "vencido" || st === "por_vencer" || st === "sin_membresia";
  });

  return (
    <AppShell title="Pagos">
      <div className="tabs">
        <button
          className={`tab ${tab === "cobrados" ? "active" : ""}`}
          onClick={() => setTab("cobrados")}
        >
          Cobrados ({payments.data?.length ?? 0})
        </button>
        <button
          className={`tab ${tab === "pendientes" ? "active" : ""}`}
          onClick={() => setTab("pendientes")}
        >
          Pendientes ({pending.length})
        </button>
      </div>

      <div className="table-wrap">
        {tab === "cobrados" ? (
          payments.isLoading ? (
            <div className="empty">Cargando pagos…</div>
          ) : (payments.data ?? []).length === 0 ? (
            <div className="empty">
              <div className="empty-icon">💳</div>
              Todavía no registraste pagos. Podés cobrar desde la ficha de cada socio.
            </div>
          ) : (
            <table className="gym-table">
              <thead>
                <tr>
                  <th>Socio</th>
                  <th>Concepto</th>
                  <th>Plan</th>
                  <th>Fecha</th>
                  <th>Cubre hasta</th>
                  <th>Método</th>
                  <th>Monto</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {payments.data!.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.members ? (
                        <Link
                          to="/socios/$id"
                          params={{ id: p.members.id }}
                          className="cell-name"
                          style={{ color: "inherit" }}
                        >
                          <div className="avatar">
                            {initials(p.members.first_name, p.members.last_name)}
                          </div>
                          {p.members.first_name} {p.members.last_name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{p.concept}</td>
                    <td className="muted">{p.plans?.name ?? "—"}</td>
                    <td className="muted">{formatDate(p.paid_on)}</td>
                    <td className="muted">{formatDate(p.covers_until)}</td>
                    <td className="muted">{p.method}</td>
                    <td style={{ color: "var(--success)", fontWeight: 600 }}>{money(p.amount)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busyId === p.id}
                        onClick={() => handleVoid(p.id)}
                      >
                        {busyId === p.id ? "Anulando…" : "Anular"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : pending.length === 0 ? (
          <div className="empty">Todos los socios están al día.</div>
        ) : (
          <table className="gym-table">
            <thead>
              <tr>
                <th>Socio</th>
                <th>Plan</th>
                <th>Vencimiento</th>
                <th>Importe del plan</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pending.map((m) => {
                const st = memberStatus(m.expires_at, m.active, soonDays);
                return (
                  <tr key={m.id}>
                    <td>
                      <div className="cell-name">
                        <div className="avatar">{initials(m.first_name, m.last_name)}</div>
                        {m.first_name} {m.last_name}
                      </div>
                    </td>
                    <td className="muted">{m.plans?.name ?? "Sin plan"}</td>
                    <td className="muted">{formatDate(m.expires_at)}</td>
                    <td className="muted">{m.plans ? money(m.plans.price) : "—"}</td>
                    <td>
                      <span className={STATUS_BADGE[st]}>{STATUS_LABEL[st]}</span>
                    </td>
                    <td>
                      <Link
                        to="/socios/$id"
                        params={{ id: m.id }}
                        className="btn btn-primary btn-sm"
                      >
                        Cobrar
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}
