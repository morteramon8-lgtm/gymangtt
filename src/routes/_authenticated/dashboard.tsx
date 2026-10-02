import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { AppShell, useSoonDays } from "@/components/gym/AppShell";
import { getDashboard } from "@/lib/gym.functions";
import {
  formatDate,
  initials,
  memberStatus,
  money,
  STATUS_BADGE,
  STATUS_LABEL,
} from "@/lib/gym-shared";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — GYMANGT" },
      { name: "description", content: "Socios activos, ingresos del mes y cuotas vencidas." },
      { property: "og:title", content: "Dashboard — GYMANGT" },
      { property: "og:description", content: "Resumen de tu gimnasio en GYMANGT." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  // Ventana de aviso configurada en Avisos: una sola regla para todo el sistema.
  const soonDays = useSoonDays();
  const fn = useServerFn(getDashboard);
  const { data, isLoading, error } = useQuery({ queryKey: ["dashboard"], queryFn: () => fn() });

  return (
    <AppShell title="Dashboard">
      {error ? <div className="alert">{(error as Error).message}</div> : null}
      {isLoading || !data ? (
        <div className="dashboard-loading"><span /><span /><span /></div>
      ) : (
        <>
          <header className="dashboard-hero">
            <div>
              <div className="eyebrow">SYSTEM / OVERVIEW / {formatDate(data.today)}</div>
              <h1>DASHBOARD<span>.</span></h1>
            </div>
            <div className="hero-side"><i /> CONTROL OPERATIVO<br/>EN TIEMPO REAL</div>
          </header>
          {data.overdueCount > 0 ? (
            <div className="alert">
              <span>⚠️</span>
              <span>
                <strong>
                  {data.overdueCount} socio{data.overdueCount === 1 ? "" : "s"}
                </strong>{" "}
                con la cuota vencida.{" "}
                <Link to="/pagos" style={{ color: "inherit", textDecoration: "underline" }}>
                  Ver pagos →
                </Link>
              </span>
            </div>
          ) : null}

          <div className="stats-row dashboard-stats">
            <div className="stat-card">
              <div className="stat-label">Socios activos</div>
              <div className="stat-value">{data.activeMembers}</div>
              <div className="stat-change">de {data.totalMembers} registrados</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Ingresos del mes</div>
              <div className="stat-value">{money(data.incomeThisMonth)}</div>
              <div className="stat-change up">cobrado este mes</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Cuotas vencidas</div>
              <div className="stat-value">{data.overdueCount}</div>
              <div className={`stat-change ${data.overdueCount ? "down" : ""}`}>
                {data.soonCount} por vencer
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Rutinas creadas</div>
              <div className="stat-value">{data.routinesCount}</div>
              <div className="stat-change">plantillas disponibles</div>
            </div>
          </div>

          <div className="dashboard-grid">
            <div className="panel dashboard-members">
              <div className="panel-head">
                <span><small>01 / REGISTRO</small>Socios recientes</span>
                <Link to="/socios" className="btn btn-ghost btn-sm">
                  Ver todos
                </Link>
              </div>
              <div className="panel-body">
                {data.recentMembers.length === 0 ? (
                  <div className="empty">
                    <div className="empty-index">00 / SIN REGISTROS</div>
                    Todavía no registraste socios.
                  </div>
                ) : (
                  <table className="gym-table">
                    <tbody>
                      {data.recentMembers.map((m) => {
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
                            <td>
                              <span className={STATUS_BADGE[st]}>{STATUS_LABEL[st]}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="panel dashboard-activity">
              <div className="panel-head"><span><small>02 / ACTIVIDAD</small>Pagos recientes</span></div>
              <div className="panel-body">
                {data.recentPayments.length === 0 ? (
                  <div className="empty">
                    <div className="empty-index">00 / SIN MOVIMIENTOS</div>
                    Todavía no registraste pagos.
                  </div>
                ) : (
                  data.recentPayments.map((p) => (
                    <div className="list-item" key={p.id}>
                      <div>
                        <div style={{ fontWeight: 500 }}>
                          {p.members?.first_name} {p.members?.last_name}
                        </div>
                        <div className="rsub">
                          {p.concept} · {formatDate(p.paid_on)}
                        </div>
                      </div>
                      <div style={{ color: "var(--success)", fontWeight: 600 }}>
                        {money(p.amount)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="panel dashboard-expiry" style={{ marginTop: 16 }}>
            <div className="panel-head"><span><small>03 / CONTROL</small>Próximos vencimientos y cuotas vencidas</span></div>
            <div className="panel-body">
              {[...data.overdueMembers, ...data.soonMembers].length === 0 ? (
                <div className="empty">Ningún vencimiento pendiente. Todo al día.</div>
              ) : (
                <table className="gym-table">
                  <thead>
                    <tr>
                      <th>Socio</th>
                      <th>Plan</th>
                      <th>Vencimiento</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.overdueMembers, ...data.soonMembers].map((m) => {
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
                          <td>
                            <span className={STATUS_BADGE[st]}>{STATUS_LABEL[st]}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
