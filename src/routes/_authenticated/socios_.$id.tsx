import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";

import { AppShell, Field, Modal, useSoonDays } from "@/components/gym/AppShell";
import {
  addProgress,
  assignRoutine,
  deleteMember,
  getMember,
  listPlans,
  listRoutines,
  markAttendance,
  registerPayment,
  removeAttendance,
  removeProgress,
  setMemberPhoto,
  updateMember,
} from "@/lib/gym.functions";
import {
  formatDate,
  GOALS,
  goalLabel,
  initials,
  LEVELS,
  levelLabel,
  memberStatus,
  money,
  STATUS_BADGE,
  STATUS_LABEL,
  todayISO,
} from "@/lib/gym-shared";

import { checkAmount, checkDate, checkMemberForm, checkProgressForm, DATE_RULES, parseDecimal } from "@/lib/validation";

export const Route = createFileRoute("/_authenticated/socios_/$id")({
  head: () => ({
    meta: [
      { title: "Ficha del socio — GYMANGT" },
      {
        name: "description",
        content: "Datos, membresía, pagos, asistencias, rutina e historial del socio.",
      },
      { property: "og:title", content: "Ficha del socio — GYMANGT" },
      { property: "og:description", content: "Ficha completa del socio en GYMANGT." },
    ],
  }),
  component: MemberDetail,
});

type TabKey = "pagos" | "asistencias" | "progreso" | "rutina" | "historial";

const TABS: { key: TabKey; label: string }[] = [
  { key: "pagos", label: "Pagos" },
  { key: "asistencias", label: "Asistencias" },
  { key: "progreso", label: "Progreso" },
  { key: "rutina", label: "Rutina" },
  { key: "historial", label: "Historial" },
];

const EVENT_LABEL: Record<string, string> = {
  alta: "Alta del socio",
  edicion: "Edición de la ficha",
};

const FIELD_LABEL: Record<string, string> = {
  nombre: "Nombre",
  apellido: "Apellido",
  dni: "DNI",
  email: "Email",
  telefono: "Teléfono",
  nacimiento: "Fecha de nacimiento",
  observaciones: "Observaciones",
  observaciones_entrenador: "Observaciones del entrenador",
  objetivo: "Objetivo",
  nivel: "Nivel",
  plan: "Plan",
  vencimiento: "Vencimiento",
  foto: "Foto de perfil",
  estado: "Estado",
};

function MemberDetail() {
  // Ventana de aviso configurada en Avisos: una sola regla para todo el sistema.
  const soonDays = useSoonDays();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const getFn = useServerFn(getMember);
  const plansFn = useServerFn(listPlans);
  const routinesFn = useServerFn(listRoutines);
  const updateFn = useServerFn(updateMember);
  const deleteFn = useServerFn(deleteMember);
  const payFn = useServerFn(registerPayment);
  const assignFn = useServerFn(assignRoutine);
  const attendFn = useServerFn(markAttendance);
  const unattendFn = useServerFn(removeAttendance);
  const progressFn = useServerFn(addProgress);
  const unprogressFn = useServerFn(removeProgress);
  const photoFn = useServerFn(setMemberPhoto);

  const detail = useQuery({ queryKey: ["member", id], queryFn: () => getFn({ data: { id } }) });
  const plans = useQuery({ queryKey: ["plans"], queryFn: () => plansFn() });
  const routines = useQuery({ queryKey: ["routines"], queryFn: () => routinesFn() });

  const [tab, setTab] = useState<TabKey>("pagos");
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  // Identifica este cobro: un doble clic o reintento no lo registra dos veces.
  const payRequestId = useRef<string | null>(null);

  const m = detail.data?.member;
  const status = memberStatus(m?.expires_at ?? null, m?.active ?? true, soonDays);
  const isAdmin = detail.data?.isAdmin ?? false;

  function refresh(message: string) {
    setNotice(message);
    void queryClient.invalidateQueries();
  }

  type EditForm = {
    first_name: string;
    last_name: string;
    dni: string;
    email: string;
    phone: string;
    birth_date: string;
    plan_id: string;
    expires_at: string;
    goal: string;
    level: string;
    trainer_notes: string;
    notes: string;
  };
  const [form, setForm] = useState<EditForm>({
    first_name: "",
    last_name: "",
    dni: "",
    email: "",
    phone: "",
    birth_date: "",
    plan_id: "",
    expires_at: "",
    goal: "",
    level: "",
    trainer_notes: "",
    notes: "",
  });

  function openEdit() {
    if (!m) return;
    setForm({
      first_name: m.first_name ?? "",
      last_name: m.last_name ?? "",
      dni: m.dni ?? "",
      email: m.email ?? "",
      phone: m.phone ?? "",
      birth_date: m.birth_date ?? "",
      plan_id: m.plan_id ?? "",
      expires_at: m.expires_at ?? "",
      goal: m.goal ?? "",
      level: m.level ?? "",
      trainer_notes: m.trainer_notes ?? "",
      notes: m.notes ?? "",
    });
    setError(null);
    setEditing(true);
  }

  const save = useMutation({
    mutationFn: () => {
      const invalid = checkMemberForm(form);
      if (invalid) throw new Error(invalid);
      return updateFn({ data: { id, ...form } as never });
    },
    onSuccess: () => {
      setEditing(false);
      refresh("Los cambios de la ficha se guardaron.");
    },
    onError: (e) => setError(e instanceof Error ? e.message : "No se pudo guardar."),
  });

  const remove = useMutation({
    mutationFn: () => deleteFn({ data: { id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries();
      navigate({ to: "/socios" });
    },
  });

  const photo = useMutation({
    mutationFn: (image: string | null) => photoFn({ data: { member_id: id, image } }),
    onSuccess: () => refresh("La foto del socio se actualizó."),
    onError: (e) => setNotice(e instanceof Error ? e.message : "No se pudo subir la foto."),
  });

  const selectedPlan = plans.data?.find((p) => p.id === (m?.plan_id ?? ""));
  const [pay, setPay] = useState({
    plan_id: "",
    amount: "",
    method: "Efectivo",
    concept: "Cuota mensual",
    paid_on: todayISO(),
  });

  function openPay() {
    setPay({
      plan_id: m?.plan_id ?? plans.data?.[0]?.id ?? "",
      amount: String(selectedPlan?.price ?? plans.data?.[0]?.price ?? ""),
      method: "Efectivo",
      concept: "Cuota",
      paid_on: todayISO(),
    });
    setError(null);
    payRequestId.current = crypto.randomUUID();
    setPaying(true);
  }

  const doPay = useMutation({
    mutationFn: () => {
      if (!pay.plan_id) throw new Error("Elegí el plan que está pagando.");
      const invalid =
        checkAmount(pay.amount) ?? checkDate(pay.paid_on, "La fecha de pago", DATE_RULES.payment);
      if (invalid) throw new Error(invalid);
      return payFn({
        data: {
          member_id: id,
          plan_id: pay.plan_id,
          amount: parseDecimal(pay.amount) as number,
          method: pay.method,
          concept: pay.concept,
          paid_on: pay.paid_on,
          request_id: payRequestId.current ?? undefined,
        },
      });
    },
    onSuccess: () => {
      setPaying(false);
      refresh("El pago quedó registrado y se actualizó el vencimiento.");
    },
    onError: (e) => setError(e instanceof Error ? e.message : "No se pudo registrar el pago."),
  });

  const assign = useMutation({
    mutationFn: (routineId: string) =>
      assignFn({ data: { member_id: id, routine_id: routineId || null } }),
    onSuccess: () => refresh("La rutina asignada se actualizó."),
  });

  const [attendanceDate, setAttendanceDate] = useState(todayISO());
  const attend = useMutation({
    mutationFn: () => {
      const invalid = checkDate(attendanceDate, "La fecha de asistencia", DATE_RULES.attendance);
      if (invalid) return Promise.reject(new Error(invalid));
      return attendFn({ data: { member_id: id, attended_on: attendanceDate } });
    },
    onSuccess: () => refresh("Asistencia registrada."),
    onError: (e) =>
      setNotice(e instanceof Error ? e.message : "No se pudo registrar la asistencia."),
  });
  const unattend = useMutation({
    mutationFn: (attId: string) => unattendFn({ data: { id: attId } }),
    onSuccess: () => refresh("Se borró la asistencia."),
  });

  const [prog, setProg] = useState({
    measured_on: todayISO(),
    weight_kg: "",
    body_fat: "",
    chest_cm: "",
    waist_cm: "",
    arm_cm: "",
    notes: "",
  });
  const addProg = useMutation({
    mutationFn: () => {
      const invalid = checkProgressForm(prog);
      if (invalid) return Promise.reject(new Error(invalid));
      return progressFn({ data: { member_id: id, ...prog } as never });
    },
    onSuccess: () => {
      setProg({
        measured_on: todayISO(),
        weight_kg: "",
        body_fat: "",
        chest_cm: "",
        waist_cm: "",
        arm_cm: "",
        notes: "",
      });
      refresh("Medición guardada.");
    },
    onError: (e) => setNotice(e instanceof Error ? e.message : "No se pudo guardar la medición."),
  });
  const delProg = useMutation({
    mutationFn: (pid: string) => unprogressFn({ data: { id: pid } }),
    onSuccess: () => refresh("Se borró la medición."),
  });

  function onPickPhoto(file: File | undefined) {
    if (!file) return;
    if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(file.type)) {
      setNotice("La foto tiene que ser una imagen JPG, PNG o WEBP.");
      return;
    }
    if (file.size === 0) {
      setNotice("El archivo está vacío.");
      return;
    }
    if (file.size > 3_000_000) {
      setNotice("La foto es demasiado pesada (máximo 3 MB).");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setNotice("No pudimos leer la imagen. Probá con otro archivo.");
    reader.onload = () => photo.mutate(String(reader.result));
    reader.readAsDataURL(file);
  }

  if (detail.isLoading) {
    return (
      <AppShell title="Ficha del socio">
        <div className="empty">Cargando ficha…</div>
      </AppShell>
    );
  }
  if (!m) {
    return (
      <AppShell title="Ficha del socio">
        <div className="empty">
          No encontramos este socio.{" "}
          <Link to="/socios" style={{ textDecoration: "underline" }}>
            Volver al listado
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={`${m.first_name} ${m.last_name}`}
      actions={
        <>
          <Link to="/socios" className="btn btn-ghost btn-sm">
            ← Volver
          </Link>
          {isAdmin ? (
            <>
              <button className="btn btn-ghost btn-sm" onClick={openEdit}>
                Editar
              </button>
              <button className="btn btn-primary btn-sm" onClick={openPay}>
                Registrar pago
              </button>
            </>
          ) : null}
        </>
      }
    >
      {notice ? (
        <div className="alert" style={{ marginBottom: 12 }} role="status">
          {notice}{" "}
          <button className="btn btn-ghost btn-sm" onClick={() => setNotice(null)}>
            Cerrar
          </button>
        </div>
      ) : null}

      <div className="two-col">
        <div className="panel">
          <div className="panel-head">Datos personales</div>
          <div className="panel-body">
            <div className="cell-name" style={{ marginBottom: 12 }}>
              {detail.data?.photoUrl ? (
                <img
                  src={detail.data.photoUrl}
                  alt={`Foto de ${m.first_name}`}
                  className="avatar"
                  style={{ objectFit: "cover" }}
                />
              ) : (
                <div className="avatar">{initials(m.first_name, m.last_name)}</div>
              )}
              <div>
                <div style={{ fontWeight: 600 }}>
                  {m.first_name} {m.last_name}
                </div>
                <div className="rsub">
                  <span className={STATUS_BADGE[status]}>{STATUS_LABEL[status]}</span>
                </div>
              </div>
            </div>

            {isAdmin ? (
              <div className="flex flex-wrap gap-2" style={{ marginBottom: 12 }}>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  style={{ display: "none" }}
                  onChange={(e) => onPickPhoto(e.target.files?.[0])}
                />
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={photo.isPending}
                  onClick={() => fileRef.current?.click()}
                >
                  {photo.isPending ? "Subiendo…" : "Cambiar foto"}
                </button>
                {detail.data?.photoUrl ? (
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={photo.isPending}
                    onClick={() => photo.mutate(null)}
                  >
                    Quitar foto
                  </button>
                ) : null}
              </div>
            ) : null}

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
              <span className="muted">Nacimiento</span>
              <span>{formatDate(m.birth_date)}</span>
            </div>
            <div className="list-item">
              <span className="muted">Socio desde</span>
              <span>{formatDate(m.join_date ?? m.created_at)}</span>
            </div>
            <div className="list-item">
              <span className="muted">Objetivo</span>
              <span>{goalLabel(m.goal)}</span>
            </div>
            <div className="list-item">
              <span className="muted">Nivel</span>
              <span>{levelLabel(m.level)}</span>
            </div>
            <div className="list-item">
              <span className="muted">Acceso propio</span>
              <span>{m.user_id ? "Sí" : "No"}</span>
            </div>
            {m.trainer_notes ? (
              <p className="muted mt-3 text-xs">
                <strong>Entrenador:</strong> {m.trainer_notes}
              </p>
            ) : null}
            {m.notes ? <p className="muted mt-3 text-xs">{m.notes}</p> : null}
            {isAdmin ? (
              <button
                className="btn btn-danger mt-4"
                onClick={() => {
                  if (confirm("¿Eliminar este socio y todos sus datos?")) remove.mutate();
                }}
              >
                Eliminar socio
              </button>
            ) : null}
          </div>
        </div>

        <div>
          <div className="panel">
            <div className="panel-head">Membresía</div>
            <div className="panel-body">
              <div className="list-item">
                <span className="muted">Plan</span>
                <span>{m.plans?.name ?? "Sin plan"}</span>
              </div>
              <div className="list-item">
                <span className="muted">Precio del plan</span>
                <span>{m.plans ? money(m.plans.price) : "—"}</span>
              </div>
              <div className="list-item">
                <span className="muted">Vence</span>
                <span>{formatDate(m.expires_at)}</span>
              </div>
              <div className="list-item">
                <span className="muted">Estado</span>
                <span className={STATUS_BADGE[status]}>{STATUS_LABEL[status]}</span>
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: 16 }}>
            <div className="panel-head">Resumen</div>
            <div className="panel-body">
              <div className="list-item">
                <span className="muted">Pagos registrados</span>
                <span>{detail.data?.payments.length ?? 0}</span>
              </div>
              <div className="list-item">
                <span className="muted">Asistencias registradas</span>
                <span>{detail.data?.attendance.length ?? 0}</span>
              </div>
              <div className="list-item">
                <span className="muted">Mediciones de progreso</span>
                <span>{detail.data?.progress.length ?? 0}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="tabs" style={{ padding: "0 16px" }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`tab ${tab === t.key ? "active" : ""}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="panel-body">
          {tab === "pagos" ? (
            (detail.data?.payments ?? []).length === 0 ? (
              <div className="empty">Sin pagos registrados.</div>
            ) : (
              <table className="gym-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Concepto</th>
                    <th>Método</th>
                    <th>Cubre hasta</th>
                    <th>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.data!.payments.map((p) => (
                    <tr key={p.id}>
                      <td className="muted">{formatDate(p.paid_on)}</td>
                      <td>{p.concept}</td>
                      <td className="muted">{p.method}</td>
                      <td className="muted">{formatDate(p.covers_until)}</td>
                      <td style={{ color: "var(--success)", fontWeight: 600 }}>
                        {money(p.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : null}

          {tab === "asistencias" ? (
            <>
              {isAdmin ? (
                <div className="form-row" style={{ alignItems: "end" }}>
                  <Field label="Fecha de asistencia">
                    <input
                      className="field"
                      type="date"
                      max={todayISO()}
                      value={attendanceDate}
                      onChange={(e) => setAttendanceDate(e.target.value)}
                    />
                  </Field>
                  <button
                    className="btn btn-primary"
                    disabled={attend.isPending}
                    onClick={() => attend.mutate()}
                  >
                    Registrar asistencia
                  </button>
                </div>
              ) : null}
              {(detail.data?.attendance ?? []).length === 0 ? (
                <div className="empty">Todavía no hay asistencias registradas.</div>
              ) : (
                <table className="gym-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Nota</th>
                      {isAdmin ? <th /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.data!.attendance.map((a) => (
                      <tr key={a.id}>
                        <td>{formatDate(a.attended_on)}</td>
                        <td className="muted">{a.note ?? "—"}</td>
                        {isAdmin ? (
                          <td>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => {
                                if (confirm("¿Borrar esta asistencia?")) unattend.mutate(a.id);
                              }}
                            >
                              Borrar
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          ) : null}

          {tab === "progreso" ? (
            <>
              {isAdmin ? (
                <>
                  <div className="form-row">
                    <Field label="Fecha">
                      <input
                        className="field"
                        type="date"
                        value={prog.measured_on}
                        onChange={(e) => setProg({ ...prog, measured_on: e.target.value })}
                      />
                    </Field>
                    <Field label="Peso (kg)">
                      <input
                        className="field"
                        type="number"
                        value={prog.weight_kg}
                        onChange={(e) => setProg({ ...prog, weight_kg: e.target.value })}
                      />
                    </Field>
                  </div>
                  <div className="form-row">
                    <Field label="Grasa corporal (%)">
                      <input
                        className="field"
                        type="number"
                        value={prog.body_fat}
                        onChange={(e) => setProg({ ...prog, body_fat: e.target.value })}
                      />
                    </Field>
                    <Field label="Pecho (cm)">
                      <input
                        className="field"
                        type="number"
                        value={prog.chest_cm}
                        onChange={(e) => setProg({ ...prog, chest_cm: e.target.value })}
                      />
                    </Field>
                  </div>
                  <div className="form-row">
                    <Field label="Cintura (cm)">
                      <input
                        className="field"
                        type="number"
                        value={prog.waist_cm}
                        onChange={(e) => setProg({ ...prog, waist_cm: e.target.value })}
                      />
                    </Field>
                    <Field label="Brazo (cm)">
                      <input
                        className="field"
                        type="number"
                        value={prog.arm_cm}
                        onChange={(e) => setProg({ ...prog, arm_cm: e.target.value })}
                      />
                    </Field>
                  </div>
                  <Field label="Notas">
                    <textarea
                      className="field"
                      rows={2}
                      value={prog.notes}
                      onChange={(e) => setProg({ ...prog, notes: e.target.value })}
                    />
                  </Field>
                  <button
                    className="btn btn-primary"
                    disabled={addProg.isPending}
                    onClick={() => addProg.mutate()}
                  >
                    Guardar medición
                  </button>
                </>
              ) : null}
              {(detail.data?.progress ?? []).length === 0 ? (
                <div className="empty">Sin mediciones cargadas.</div>
              ) : (
                <table className="gym-table" style={{ marginTop: 12 }}>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Peso</th>
                      <th>Grasa</th>
                      <th>Pecho</th>
                      <th>Cintura</th>
                      <th>Brazo</th>
                      <th>Notas</th>
                      {isAdmin ? <th /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.data!.progress.map((p) => (
                      <tr key={p.id}>
                        <td>{formatDate(p.measured_on)}</td>
                        <td className="muted">{p.weight_kg ?? "—"}</td>
                        <td className="muted">{p.body_fat ?? "—"}</td>
                        <td className="muted">{p.chest_cm ?? "—"}</td>
                        <td className="muted">{p.waist_cm ?? "—"}</td>
                        <td className="muted">{p.arm_cm ?? "—"}</td>
                        <td className="muted">{p.notes ?? "—"}</td>
                        {isAdmin ? (
                          <td>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => {
                                if (confirm("¿Borrar esta medición?")) delProg.mutate(p.id);
                              }}
                            >
                              Borrar
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          ) : null}

          {tab === "rutina" ? (
            <>
              {isAdmin ? (
                <Field label="Elegí una rutina">
                  <select
                    className="field"
                    value={detail.data?.routine?.id ?? ""}
                    onChange={(e) => assign.mutate(e.target.value)}
                  >
                    <option value="">Sin rutina</option>
                    {(routines.data ?? []).map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
              {detail.data?.routine ? (
                <table className="gym-table">
                  <thead>
                    <tr>
                      <th>Ejercicio</th>
                      <th>Series</th>
                      <th>Reps</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...(detail.data.routine.routine_exercises ?? [])]
                      .sort((a, b) => a.position - b.position)
                      .map((ex) => (
                        <tr key={ex.id}>
                          <td>{ex.name}</td>
                          <td className="muted">{ex.sets}</td>
                          <td className="muted">{ex.reps}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty">Este socio todavía no tiene rutina.</div>
              )}
            </>
          ) : null}

          {tab === "historial" ? (
            !isAdmin ? (
              <div className="empty">Solo el administrador puede ver el historial de cambios.</div>
            ) : (detail.data?.events ?? []).length === 0 ? (
              <div className="empty">Todavía no hay cambios registrados.</div>
            ) : (
              <table className="gym-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Cambio</th>
                    <th>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.data!.events.map((ev) => {
                    const detailObj = (ev.detail ?? {}) as Record<string, unknown>;
                    const fields =
                      ev.kind === "alta"
                        ? String(detailObj["nombre"] ?? "")
                        : Object.keys(detailObj)
                            .map((k) => FIELD_LABEL[k] ?? k)
                            .join(", ");
                    return (
                      <tr key={ev.id}>
                        <td className="muted">{formatDate(ev.created_at)}</td>
                        <td>{EVENT_LABEL[ev.kind] ?? ev.kind}</td>
                        <td className="muted">{fields || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          ) : null}
        </div>
      </div>

      {editing ? (
        <Modal
          title="Editar socio"
          onClose={() => setEditing(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setEditing(false)}>
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                disabled={save.isPending}
                onClick={() => save.mutate()}
              >
                {save.isPending ? "Guardando…" : "Guardar cambios"}
              </button>
            </>
          }
        >
          {error ? <div className="alert">{error}</div> : null}
          <div className="form-row">
            <Field label="Nombre *">
              <input
                className="field"
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              />
            </Field>
            <Field label="Apellido *">
              <input
                className="field"
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              />
            </Field>
          </div>
          <div className="form-row">
            <Field label="DNI">
              <input
                className="field"
                value={form.dni}
                onChange={(e) => setForm({ ...form, dni: e.target.value })}
              />
            </Field>
            <Field label="Teléfono">
              <input
                className="field"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Email">
            <input
              className="field"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <div className="form-row">
            <Field label="Fecha de nacimiento">
              <input
                className="field"
                type="date"
                value={form.birth_date}
                onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
              />
            </Field>
            <Field label="Plan">
              <select
                className="field"
                value={form.plan_id}
                onChange={(e) => setForm({ ...form, plan_id: e.target.value })}
              >
                <option value="">Sin plan</option>
                {(plans.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="form-row">
            <Field label="Objetivo de entrenamiento">
              <select
                className="field"
                value={form.goal}
                onChange={(e) => setForm({ ...form, goal: e.target.value })}
              >
                <option value="">Sin definir</option>
                {GOALS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Nivel">
              <select
                className="field"
                value={form.level}
                onChange={(e) => setForm({ ...form, level: e.target.value })}
              >
                <option value="">Sin definir</option>
                {LEVELS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Vencimiento">
            <input
              className="field"
              type="date"
              value={form.expires_at}
              onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
            />
          </Field>
          <Field label="Observaciones del entrenador">
            <textarea
              className="field"
              rows={2}
              value={form.trainer_notes}
              onChange={(e) => setForm({ ...form, trainer_notes: e.target.value })}
            />
          </Field>
          <Field label="Observaciones generales">
            <textarea
              className="field"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
        </Modal>
      ) : null}

      {paying ? (
        <Modal
          title="Registrar pago"
          onClose={() => setPaying(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setPaying(false)}>
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                disabled={doPay.isPending}
                onClick={() => doPay.mutate()}
              >
                Confirmar pago
              </button>
            </>
          }
        >
          {error ? <div className="alert">{error}</div> : null}
          <Field label="Plan pagado">
            <select
              className="field"
              value={pay.plan_id}
              onChange={(e) => {
                const plan = plans.data?.find((p) => p.id === e.target.value);
                setPay({
                  ...pay,
                  plan_id: e.target.value,
                  amount: String(plan?.price ?? pay.amount),
                });
              }}
            >
              {(plans.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {money(p.price)}
                </option>
              ))}
            </select>
          </Field>
          <div className="form-row">
            <Field label="Monto">
              <input
                className="field"
                type="number"
                value={pay.amount}
                onChange={(e) => setPay({ ...pay, amount: e.target.value })}
              />
            </Field>
            <Field label="Fecha de pago">
              <input
                className="field"
                type="date"
                value={pay.paid_on}
                onChange={(e) => setPay({ ...pay, paid_on: e.target.value })}
              />
            </Field>
          </div>
          <div className="form-row">
            <Field label="Método">
              <select
                className="field"
                value={pay.method}
                onChange={(e) => setPay({ ...pay, method: e.target.value })}
              >
                <option>Efectivo</option>
                <option>Transferencia</option>
                <option>Débito</option>
                <option>Crédito</option>
              </select>
            </Field>
            <Field label="Concepto">
              <input
                className="field"
                value={pay.concept}
                onChange={(e) => setPay({ ...pay, concept: e.target.value })}
              />
            </Field>
          </div>
          <p className="muted text-xs">
            El vencimiento del socio se extiende automáticamente según la duración del plan.
          </p>
        </Modal>
      ) : null}
    </AppShell>
  );
}
