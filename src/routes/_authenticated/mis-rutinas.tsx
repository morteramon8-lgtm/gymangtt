import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { AppShell, Field, Modal } from "@/components/gym/AppShell";
import { deleteMyRoutine, listMyRoutines, saveMyRoutine } from "@/lib/gym.functions";
import { formatDate } from "@/lib/gym-shared";
import { checkRoutineForm } from "@/lib/validation";

export const Route = createFileRoute("/_authenticated/mis-rutinas")({
  head: () => ({
    meta: [
      { title: "Mis rutinas — GYMANGT" },
      { name: "description", content: "Creá y gestioná tus propias rutinas de entrenamiento." },
      { property: "og:title", content: "Mis rutinas — GYMANGT" },
      { property: "og:description", content: "Rutinas creadas por el socio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyRoutinesPage,
});

type Row = { name: string; sets: string; reps: string; weight: string; rest: string };
const blankRow = (): Row => ({ name: "", sets: "3", reps: "10", weight: "", rest: "" });
const emptyForm = { id: undefined as string | undefined, name: "", kind: "Fuerza", notes: "" };

function MyRoutinesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMyRoutines);
  const saveFn = useServerFn(saveMyRoutine);
  const deleteFn = useServerFn(deleteMyRoutine);
  const routines = useQuery({ queryKey: ["my-routines"], queryFn: () => listFn() });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [rows, setRows] = useState<Row[]>([blankRow()]);
  const [error, setError] = useState<string | null>(null);

  function openNew() {
    setForm(emptyForm);
    setRows([blankRow()]);
    setError(null);
    setOpen(true);
  }
  function openEdit(r: NonNullable<typeof routines.data>[number]) {
    setForm({ id: r.id, name: r.name, kind: r.kind, notes: r.notes ?? "" });
    setRows(
      [...(r.routine_exercises ?? [])]
        .sort((a, b) => a.position - b.position)
        .map((ex) => ({ name: ex.name, sets: String(ex.sets), reps: ex.reps, weight: ex.weight ?? "", rest: ex.rest ?? "" })),
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
            weight: r.weight.trim() || null,
            rest: r.rest.trim() || null,
          })),
        },
      });
    },
    onSuccess: () => {
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["my-routines"] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "No se pudo guardar la rutina."),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["my-routines"] }),
    onError: (e) => alert(e instanceof Error ? e.message : "No se pudo eliminar la rutina."),
  });

  const setRow = (i: number, patch: Partial<Row>) => {
    const next = [...rows];
    next[i] = { ...next[i]!, ...patch };
    setRows(next);
  };

  return (
    <AppShell
      title="Mis rutinas"
      actions={
        <button className="btn btn-primary btn-sm" onClick={openNew}>
          + Crear rutina
        </button>
      }
    >
      {routines.isLoading ? (
        <div className="empty">Cargando tus rutinas…</div>
      ) : routines.error ? (
        <div className="alert">{routines.error.message}</div>
      ) : (routines.data ?? []).length === 0 ? (
        <div className="empty">
          <div className="empty-icon">🏋️</div>
          Todavía no creaste rutinas propias. Usá "+ Crear rutina" para armar la primera.
        </div>
      ) : (
        <div className="two-col">
          {routines.data!.map((r) => (
            <div className="panel" key={r.id}>
              <div className="panel-head">
                <div>
                  {r.name}
                  <div className="rsub">
                    {r.kind} · {r.routine_exercises?.length ?? 0} ejercicios · Creada el {formatDate(r.created_at)}
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
                <div className="table-wrap">
                  <table className="gym-table">
                    <thead>
                      <tr>
                        <th>Ejercicio</th>
                        <th>Series</th>
                        <th>Reps</th>
                        <th>Peso</th>
                        <th>Descanso</th>
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
                            <td className="muted">{ex.weight ?? "—"}</td>
                            <td className="muted">{ex.rest ?? "—"}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {r.notes ? <p className="muted mt-3 text-xs">{r.notes}</p> : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {open ? (
        <Modal
          title={form.id ? "Editar rutina" : "Crear rutina"}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setOpen(false)}>
                Cancelar
              </button>
              <button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>
                {save.isPending ? "Guardando…" : "Guardar"}
              </button>
            </>
          }
        >
          {error ? <div className="alert">{error}</div> : null}
          <div className="form-row">
            <Field label="Nombre">
              <input className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej: Piernas lunes" />
            </Field>
            <Field label="Tipo">
              <select className="field" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
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
              <input className="field" aria-label={`Ejercicio ${i + 1}`} placeholder="Ejercicio" value={row.name} onChange={(e) => setRow(i, { name: e.target.value })} />
              <input className="field" aria-label="Series" type="number" placeholder="Series" value={row.sets} onChange={(e) => setRow(i, { sets: e.target.value })} />
              <input className="field" aria-label="Repeticiones" placeholder="Reps" value={row.reps} onChange={(e) => setRow(i, { reps: e.target.value })} />
              <input className="field" aria-label="Peso" placeholder="Peso" value={row.weight} onChange={(e) => setRow(i, { weight: e.target.value })} />
              <input className="field" aria-label="Descanso" placeholder="Descanso" value={row.rest} onChange={(e) => setRow(i, { rest: e.target.value })} />
              <button className="btn btn-ghost btn-sm" aria-label="Quitar ejercicio" onClick={() => setRows(rows.filter((_, idx) => idx !== i))}>
                ✕
              </button>
            </div>
          ))}
          <button className="btn btn-ghost btn-sm" onClick={() => setRows([...rows, blankRow()])}>
            + Agregar ejercicio
          </button>

          <Field label="Descripción / notas (opcional)">
            <textarea className="field" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
        </Modal>
      ) : null}
    </AppShell>
  );
}
