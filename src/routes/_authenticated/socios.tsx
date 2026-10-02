import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";

import { AppShell, Field, Modal, useSoonDays } from "@/components/gym/AppShell";
import { createMember, listMembers, listPlans } from "@/lib/gym.functions";
import {
  formatDate,
  GOALS,
  goalLabel,
  initials,
  LEVELS,
  levelLabel,
  memberStatus,
  STATUS_BADGE,
  STATUS_LABEL,
  type MemberStatus,
} from "@/lib/gym-shared";

import { checkMemberForm } from "@/lib/validation";

export const Route = createFileRoute("/_authenticated/socios")({
  head: () => ({
    meta: [
      { title: "Socios — GYMANGT" },
      { name: "description", content: "Registrá, editá y consultá la ficha de cada socio." },
      { property: "og:title", content: "Socios — GYMANGT" },
      { property: "og:description", content: "Gestión de socios del gimnasio." },
    ],
  }),
  component: MembersPage,
});

const emptyForm = {
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
  create_account: false,
  password: "",
};

const FILTERS: { value: "todos" | MemberStatus; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "activo", label: "Activos" },
  { value: "por_vencer", label: "Por vencer" },
  { value: "vencido", label: "Vencidos" },
  { value: "sin_membresia", label: "Sin membresía" },
];

type SortKey = "registro" | "vencimiento" | "nombre";

function MembersPage() {
  // Ventana de aviso configurada en Avisos: una sola regla para todo el sistema.
  const soonDays = useSoonDays();
  const list = useServerFn(listMembers);
  const plansFn = useServerFn(listPlans);
  const create = useServerFn(createMember);
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"todos" | MemberStatus>("todos");
  const [sort, setSort] = useState<SortKey>("registro");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const members = useQuery({ queryKey: ["members"], queryFn: () => list() });
  const plans = useQuery({ queryKey: ["plans"], queryFn: () => plansFn() });

  const save = useMutation({
    mutationFn: () => {
      const invalid = checkMemberForm(form);
      if (invalid) throw new Error(invalid);
      if (form.create_account && !form.email.trim())
        throw new Error("Para crear la cuenta del socio hace falta un email.");
      return create({
        data: {
          ...form,
          plan_id: form.plan_id || null,
          password: form.password || undefined,
        },
      });
    },
    onSuccess: () => {
      setOpen(false);
      setSaved(`${form.first_name} ${form.last_name} quedó cargado como socio.`);
      setForm(emptyForm);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["members"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "No se pudo guardar."),
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    const filtered = (members.data ?? []).filter((m) => {
      if (filter !== "todos" && memberStatus(m.expires_at, m.active, soonDays) !== filter)
        return false;
      if (!q) return true;
      const haystack =
        `${m.first_name} ${m.last_name} ${m.email ?? ""} ${m.dni ?? ""}`.toLowerCase();
      const phone = (m.phone ?? "").replace(/\D/g, "");
      return haystack.includes(q) || (digits.length >= 3 && phone.includes(digits));
    });
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sort === "nombre")
        return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
      if (sort === "vencimiento") {
        const av = a.expires_at ?? "9999-12-31";
        const bv = b.expires_at ?? "9999-12-31";
        return av.localeCompare(bv);
      }
      return (b.created_at ?? "").localeCompare(a.created_at ?? "");
    });
    return sorted;
  }, [members.data, search, filter, sort, soonDays]);

  const counters = useMemo(() => {
    const all = members.data ?? [];
    return {
      todos: all.length,
      activo: all.filter((m) => memberStatus(m.expires_at, m.active, soonDays) === "activo").length,
      por_vencer: all.filter((m) => memberStatus(m.expires_at, m.active, soonDays) === "por_vencer")
        .length,
      vencido: all.filter((m) => memberStatus(m.expires_at, m.active, soonDays) === "vencido")
        .length,
      sin_membresia: all.filter(
        (m) => memberStatus(m.expires_at, m.active, soonDays) === "sin_membresia",
      ).length,
      baja: all.filter((m) => memberStatus(m.expires_at, m.active, soonDays) === "baja").length,
    };
  }, [members.data, soonDays]);

  return (
    <AppShell title="Socios">
      {saved ? (
        <div className="alert" style={{ marginBottom: 12 }} role="status">
          {saved}{" "}
          <button className="btn btn-ghost btn-sm" onClick={() => setSaved(null)}>
            Cerrar
          </button>
        </div>
      ) : null}

      <div className="table-wrap">
        <div className="table-header">
          <div className="table-title">Todos los socios</div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="search-input"
              placeholder="Buscar por nombre, email o teléfono…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="field"
              style={{ width: "auto" }}
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="Ordenar socios"
            >
              <option value="registro">Más nuevos primero</option>
              <option value="vencimiento">Por vencimiento</option>
              <option value="nombre">Por nombre</option>
            </select>
            <button className="btn btn-primary" onClick={() => setOpen(true)}>
              + Nuevo socio
            </button>
          </div>
        </div>

        <div className="tabs" style={{ padding: "0 16px" }}>
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`tab ${filter === f.value ? "active" : ""}`}
              onClick={() => setFilter(f.value)}
            >
              {f.label} ({counters[f.value]})
            </button>
          ))}
        </div>

        {members.isLoading ? (
          <div className="empty">Cargando socios…</div>
        ) : rows.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">👥</div>
            {search || filter !== "todos"
              ? "Ningún socio coincide con la búsqueda."
              : "Todavía no hay socios cargados."}
          </div>
        ) : (
          <table className="gym-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Contacto</th>
                <th>Objetivo / Nivel</th>
                <th>Plan</th>
                <th>Vencimiento</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const st = memberStatus(m.expires_at, m.active, soonDays);
                return (
                  <tr key={m.id}>
                    <td>
                      <div className="cell-name">
                        <div className="avatar">{initials(m.first_name, m.last_name)}</div>
                        <div>
                          {m.first_name} {m.last_name}
                          <div className="rsub">
                            Desde {formatDate(m.join_date ?? m.created_at)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="muted">
                      {m.email ?? "—"}
                      <div className="rsub">{m.phone ?? "Sin teléfono"}</div>
                    </td>
                    <td className="muted">
                      {goalLabel(m.goal)}
                      <div className="rsub">{levelLabel(m.level)}</div>
                    </td>
                    <td className="muted">{m.plans?.name ?? "Sin plan"}</td>
                    <td className="muted">{formatDate(m.expires_at)}</td>
                    <td>
                      <span className={STATUS_BADGE[st]}>{STATUS_LABEL[st]}</span>
                    </td>
                    <td>
                      <Link to="/socios/$id" params={{ id: m.id }} className="btn btn-ghost btn-sm">
                        Ver ficha
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {open ? (
        <Modal
          title="Nuevo socio"
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setOpen(false)}>
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                disabled={save.isPending}
                onClick={() => save.mutate()}
              >
                {save.isPending ? "Guardando…" : "Guardar socio"}
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
          <Field label="Vencimiento de la cuota (opcional)">
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
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={form.create_account}
              onChange={(e) => setForm({ ...form, create_account: e.target.checked })}
            />
            Crear cuenta de acceso para el socio
          </label>
          {form.create_account ? (
            <Field label="Contraseña inicial del socio">
              <input
                className="field"
                type="text"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Mínimo 8 caracteres"
                minLength={8}
              />
            </Field>
          ) : null}
        </Modal>
      ) : null}
    </AppShell>
  );
}
