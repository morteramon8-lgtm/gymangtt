import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { AppShell, Field, Modal } from "@/components/gym/AppShell";
import { deleteRoutine, listRoutines, saveRoutine } from "@/lib/gym.functions";

import { checkRoutineForm } from "@/lib/validation";
import { formatDate } from "@/lib/gym-shared";

export const Route = createFileRoute("/_authenticated/rutinas")({
  head: () => ({
    meta: [
      { title: "Rutinas — GYMANGT" },
      { name: "description", content: "Creá rutinas con ejercicios y asignalas a tus socios." },
      { property: "og:title", content: "Rutinas — GYMANGT" },
      { property: "og:description", content: "Plantillas de entrenamiento del gimnasio." },
    ],
  }),
  component: RoutinesPage,
});

type ExerciseRow = { name: string; sets: string; reps: string };

const emptyRoutine = {
  id: undefined as string | undefined,
  name: "",
  kind: "Fuerza",
  notes: "",
};

function RoutinesPage() {
  const listFn = useServerFn(listRoutines);
  const saveFn = useServerFn(saveRoutine);
  const deleteFn = useServerFn(deleteRoutine);
  const queryClient = useQueryClient();

  const routines = useQuery({ queryKey: ["routines"], queryFn: () => listFn() });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyRoutine);
  const [rows, setRows] = useState<ExerciseRow[]>([{ name: "", sets: "3", reps: "10" }]);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState<"all" | "admin" | "member">("all");
  const [search, setSearch] = useState("");
  const term = search.trim().toLowerCase();
  const visible = (routines.data ?? []).filter((r) => {
    if (origin !== "all" && r.created_by_role !== origin) return false;
    if (!term) return true;
    const names = [
      r.name,
      r.owner ? `${r.owner.first_name} ${r.owner.last_name}` : "",
      ...(r.member_routines ?? []).map((a) => (a.members ? `${a.members.first_name} ${a.members.last_name}` : "")),
    ];
    return names.some((n) => n.toLowerCase().includes(term));
  });

  function openNew() {
    setForm(emptyRoutine);
    setRows([{ name: "", sets: "3", reps: "10" }]);
    setError(null);
    setOpen(true);
  }

  function openEdit(r: NonNullable<typeof routines.data>[number]) {
    setForm({ id: r.id, name: r.name, kind: r.kind, notes: r.notes ?? "" });
    setRows(
      [...(r.routine_exercises ?? [])]
        .sort((a, b) => a.position - b.position)
        .map((ex) => ({ name: ex.name, sets: String(ex.sets), reps: ex.reps })),
    );
    setError(null);
    setOpen(true);
  }

  const save = useMutation({
    mutationFn: () => {
      const exercises = rows.filter((r) => r.name.trim());
      const invalid = checkRoutineForm({ name: form.name, exercises });
      if (invalid) return Promise.reject(new Error(invalid));
      return saveFn({
        data: {
          ...(form.id ? { id: form.id } : {}),
          name: form.name.trim(),
          kind: form.kind,
          notes: form.notes || null,
          exercises: exercises.map((r) => ({
            name: r.name.trim(),
            sets: Number(r.sets),
            reps: r.reps.trim(),
          })),
        },
      });
    },
    onSuccess: () => {
      setOpen(false);
      void queryClient.invalidateQueries();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "No se pudo guardar la rutina."),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => void queryClient.invalidateQueries(),
  });

  return (
    <AppShell
      title="Rutinas"
      actions={
        <button className="btn btn-primary btn-sm" onClick={openNew}>
          + Nueva rutina
        </button>
      }
    >
      <div className="flex flex-wrap gap-2" style={{ marginBottom: 16 }}>
        <input
          className="field"
          style={{ maxWidth: 320 }}
          aria-label="Buscar por rutina o socio"
          placeholder="Buscar por rutina o socio"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="field"
          style={{ maxWidth: 240 }}
          aria-label="Filtrar por origen"
          value={origin}
          onChange={(e) => setOrigin(e.target.value as typeof origin)}
        >
          <option value="all">Todas</option>
          <option value="admin">Creadas por administrador</option>
          <option value="member">Creadas por socios</option>
        </select>
      </div>
      {routines.isLoading ? (
        <div className="empty">Cargando rutinas…</div>
      ) : (routines.data ?? []).length === 0 ? (
        <div className="empty">
          <div className="empty-icon">🏋️</div>
          Todavía no creaste rutinas.
        </div>
      ) : visible.length === 0 ? (
        <div className="empty">No hay rutinas que coincidan con el filtro.</div>
      ) : (
        <div className="two-col">
          {visible.map((r) => (
            <div className="panel" key={r.id}>
              <div className="panel-head">
                <div>
                  {r.created_by_role === "member" && r.owner
                    ? `Rutina de ${r.owner.first_name} ${r.owner.last_name} — ${r.name}`
                    : r.name}
                  <div className="rsub">
                    <span className={r.created_by_role === "member" ? "badge badge-green" : "badge"}>
                      Creada por: {r.created_by_role === "member" ? "Socio" : "Administrador"}
                    </span>{" "}
                    Activa · {formatDate(r.created_at)}
                  </div>
                  <div className="rsub">
                    {r.kind} · {r.routine_exercises?.length ?? 0} ejercicios ·{" "}
                    {r.member_routines?.length ?? 0} socio(s)
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(r)}>
                    Editar
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => {
                      if (confirm(`¿Eliminar la rutina "${r.name}"?`)) remove.mutate(r.id);
                    }}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
              <div className="panel-body">
                <table className="gym-table">
                  <thead>
                    <tr>
                      <th>Ejercicio</th>
                      <th>Series</th>
                      <th>Reps</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...(r.routine_exercises ?? [])]
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
                {r.notes ? <p className="muted mt-3 text-xs">{r.notes}</p> : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {open ? (
        <Modal
          title={form.id ? "Editar rutina" : "Nueva rutina"}
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
                Guardar rutina
              </button>
            </>
          }
        >
          {error ? <div className="alert">{error}</div> : null}
          <div className="form-row">
            <Field label="Nombre">
              <input
                className="field"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ej: Full body principiante"
              />
            </Field>
            <Field label="Tipo">
              <select
                className="field"
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value })}
              >
                <option>Fuerza</option>
                <option>Hipertrofia</option>
                <option>Cardio</option>
                <option>Funcional</option>
                <option>Rehabilitación</option>
              </select>
            </Field>
          </div>

          <label className="mb-1 block text-xs">Ejercicios</label>
          {rows.map((row, i) => (
            <div className="form-row" key={i} style={{ marginBottom: 8 }}>
              <input
                className="field"
                placeholder="Ejercicio"
                value={row.name}
                onChange={(e) => {
                  const next = [...rows];
                  next[i] = { ...row, name: e.target.value };
                  setRows(next);
                }}
              />
              <input
                className="field"
                type="number"
                placeholder="Series"
                value={row.sets}
                onChange={(e) => {
                  const next = [...rows];
                  next[i] = { ...row, sets: e.target.value };
                  setRows(next);
                }}
              />
              <input
                className="field"
                placeholder="Reps"
                value={row.reps}
                onChange={(e) => {
                  const next = [...rows];
                  next[i] = { ...row, reps: e.target.value };
                  setRows(next);
                }}
              />
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setRows([...rows, { name: "", sets: "3", reps: "10" }])}
          >
            + Agregar ejercicio
          </button>

          <Field label="Notas">
            <textarea
              className="field"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
        </Modal>
      ) : null}
    </AppShell>
  );
}
