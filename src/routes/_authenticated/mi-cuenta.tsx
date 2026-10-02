import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import { AppShell, useSoonDays } from "@/components/gym/AppShell";
import { checkInMyself, getMyPortal, listMyAttendance } from "@/lib/gym.functions";
import {
  formatDate,
  initials,
  memberStatus,
  money,
  STATUS_BADGE,
  STATUS_LABEL,
} from "@/lib/gym-shared";

export const Route = createFileRoute("/_authenticated/mi-cuenta")({
  head: () => ({
    meta: [
      { title: "Mi perfil — GYMANGT" },
      { name: "description", content: "Tus datos personales y el estado de tu membresía." },
      { property: "og:title", content: "Mi perfil — GYMANGT" },
      { property: "og:description", content: "Datos y membresía del socio." },
    ],
  }),
  component: MyAccount,
});

function MyAccount() {
  // Ventana de aviso configurada en Avisos: una sola regla para todo el sistema.
  const soonDays = useSoonDays();
  const fn = useServerFn(getMyPortal);
  const { data, isLoading } = useQuery({ queryKey: ["portal"], queryFn: () => fn() });
  const m = data?.member;
  const st = memberStatus(m?.expires_at ?? null, m?.active ?? true, soonDays);

  return (
    <AppShell title="Mi perfil">
      {isLoading ? (
        <div className="empty">Cargando tus datos…</div>
      ) : !m ? (
        <div className="empty">
          Tu cuenta todavía no está vinculada a una ficha de socio. Pedile al administrador del
          gimnasio que la vincule.
        </div>
      ) : (
        <div className="two-col">
          <div className="panel">
            <div className="panel-head">Mis datos</div>
            <div className="panel-body">
              <div className="cell-name" style={{ marginBottom: 12 }}>
                <div className="avatar">{initials(m.first_name, m.last_name)}</div>
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {m.first_name} {m.last_name}
                  </div>
                  <div className="rsub">
                    <span className={STATUS_BADGE[st]}>{STATUS_LABEL[st]}</span>
                  </div>
                </div>
              </div>
              <div className="list-item">
                <span className="muted">DNI</span>
                <span>{m.dni ?? "—"}</span>
              </div>
              <div className="list-item">
                <span className="muted">Email</span>
                <span>{m.email ?? "—"}</span>
              </div>
              <div className="list-item">
                <span className="muted">Teléfono</span>
                <span>{m.phone ?? "—"}</span>
              </div>
              <div className="list-item">
                <span className="muted">Socio desde</span>
                <span>{formatDate(m.join_date ?? m.created_at)}</span>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">Mi membresía</div>
            <div className="panel-body">
              <div className="list-item">
                <span className="muted">Plan</span>
                <span>{m.plans?.name ?? "Sin plan"}</span>
              </div>
              <div className="list-item">
                <span className="muted">Valor</span>
                <span>{m.plans ? money(m.plans.price) : "—"}</span>
              </div>
              <div className="list-item">
                <span className="muted">Vence</span>
                <span>{formatDate(m.expires_at)}</span>
              </div>
              {st === "vencido" ? (
                <div className="alert" style={{ marginTop: 12 }}>
                  Tu cuota está vencida. Acercate al gimnasio para renovarla.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
      {m ? <MyAttendance /> : null}
    </AppShell>
  );
}

function hour(ts: string | null | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

function MyAttendance() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMyAttendance);
  const checkFn = useServerFn(checkInMyself);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const { data } = useQuery({ queryKey: ["my-attendance"], queryFn: () => listFn() });
  const doneToday = !!data?.rows.some((r) => r.attended_on === data.today);

  const check = useMutation({
    mutationFn: () => checkFn(),
    onSuccess: (r) => {
      setNotice(
        r.status === "created"
          ? { ok: true, text: `¡Asistencia registrada! Hoy a las ${hour(r.check_in)}.` }
          : { ok: false, text: `Tu asistencia de hoy ya estaba registrada (${hour(r.check_in)}).` },
      );
      qc.invalidateQueries({ queryKey: ["my-attendance"] });
    },
    onError: (e) =>
      setNotice({ ok: false, text: e instanceof Error ? e.message : "No se pudo registrar la asistencia." }),
  });

  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <div className="panel-head">Mis asistencias</div>
      <div className="panel-body">
        <button
          type="button"
          className="btn btn-primary"
          disabled={check.isPending}
          onClick={() => check.mutate()}
        >
          {check.isPending ? "Registrando…" : doneToday ? "Asistencia de hoy registrada ✓" : "Marcar asistencia"}
        </button>
        {notice ? (
          <div className={notice.ok ? "badge badge-green" : "alert"} style={{ marginTop: 12, display: "block" }}>
            {notice.text}
          </div>
        ) : null}
        <div style={{ marginTop: 16 }}>
          {(data?.rows ?? []).length === 0 ? (
            <div className="empty">Todavía no registraste asistencias.</div>
          ) : (
            data!.rows.map((r) => (
              <div className="list-item" key={r.id}>
                <span>{formatDate(r.attended_on)}</span>
                <span className="muted">{hour(r.check_in)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
