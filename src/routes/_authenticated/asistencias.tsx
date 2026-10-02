import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/gym/AppShell";
import { listGymAttendance } from "@/lib/gym.functions";
import { formatDate, initials } from "@/lib/gym-shared";

export const Route = createFileRoute("/_authenticated/asistencias")({
  head: () => ({
    meta: [
      { title: "Asistencias — GYMANGT" },
      { name: "description", content: "Asistencias marcadas por los socios del gimnasio." },
      { property: "og:title", content: "Asistencias — GYMANGT" },
      { property: "og:description", content: "Registro de asistencias de los socios." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AttendancePage,
});

function hour(ts: string | null | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

function AttendancePage() {
  const fn = useServerFn(listGymAttendance);
  const { data, isLoading, error } = useQuery({
    queryKey: ["gym-attendance"],
    queryFn: () => fn(),
    refetchInterval: 15_000,
  });
  const [day, setDay] = useState<string>("");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.rows ?? []).filter((r) => {
      if (day && r.attended_on !== day) return false;
      if (!term) return true;
      const name = `${r.members?.first_name ?? ""} ${r.members?.last_name ?? ""}`.toLowerCase();
      return name.includes(term);
    });
  }, [data, day, q]);

  const todayCount = (data?.rows ?? []).filter((r) => r.attended_on === data?.today).length;

  return (
    <AppShell title="Asistencias">
      {error ? <div className="alert">{(error as Error).message}</div> : null}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Asistencias hoy</div>
          <div className="stat-value">{todayCount}</div>
          <div className="stat-change">se actualiza sola</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total registradas</div>
          <div className="stat-value">{data?.rows.length ?? 0}</div>
          <div className="stat-change">últimas 1000</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          Registro de asistencias
          <div className="flex items-center gap-2">
            <input
              className="form-input"
              placeholder="Buscar socio…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <input
              className="form-input"
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
            {day ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDay("")}>
                Todas
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setDay(data?.today ?? "")}
              >
                Hoy
              </button>
            )}
          </div>
        </div>
        <div className="panel-body">
          {isLoading ? (
            <div className="empty">Cargando asistencias…</div>
          ) : rows.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">📋</div>
              No hay asistencias para mostrar.
            </div>
          ) : (
            <table className="gym-table">
              <thead>
                <tr>
                  <th>Socio</th>
                  <th>Fecha</th>
                  <th>Hora</th>
                  <th>Origen</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link to="/socios/$id" params={{ id: r.member_id }} className="cell-name">
                        <div className="avatar">
                          {initials(r.members?.first_name ?? "", r.members?.last_name ?? "")}
                        </div>
                        {r.members?.first_name} {r.members?.last_name}
                      </Link>
                    </td>
                    <td className="muted">{formatDate(r.attended_on)}</td>
                    <td className="muted">{hour(r.check_in)}</td>
                    <td className="muted">{r.check_in ? "Marcada por el socio" : "Cargada por admin"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppShell>
  );
}
