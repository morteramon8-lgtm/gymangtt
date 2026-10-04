import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { Field, Modal } from "@/components/gym/AppShell";
import { saveGroupRoutine } from "@/lib/groups.functions";
import { checkRoutineForm } from "@/lib/validation";

type Row = { name: string; sets: string; reps: string; weight: string; rest: string };
const blankRow = (): Row => ({ name: "", sets: "3", reps: "10", weight: "", rest: "" });

export type GroupRoutineDraft = {
  id?: string;
  name: string;
  kind: string;
  notes: string | null;
  exercises: { name: string; sets: number; reps: string; weight: string | null; rest: string | null }[];
};

/**
 * Misma pantalla de armado de rutinas que ya usa la app (campos, tipos, validación
 * y estilos), pero la rutina queda asociada al grupo. Quién puede crear o editar
 * lo decide la base de datos, no este formulario.
 */
export function GroupRoutineEditor({
  groupId,
  initial,
  onClose,
  onSaved,
}: {
  groupId: string;
  initial?: GroupRoutineDraft;
  onClose: () => void;
  onSaved: () => void;
}) {
  const saveFn = useServerFn(saveGroupRoutine);
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    kind: initial?.kind ?? "Fuerza",
    notes: initial?.notes ?? "",
  });
  const [rows, setRows] = useState<Row[]>(
    initial && initial.exercises.length > 0
      ? initial.exercises.map((ex) => ({
          name: ex.name,
          sets: String(ex.sets),
          reps: ex.reps,
          weight: ex.weight ?? "",
          rest: ex.rest ?? "",
        }))
      : [blankRow()],
  );
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const exercises = rows.filter((r) => r.name.trim());
      const invalid = checkRoutineForm({ name: form.name, exercises });
      if (invalid) return Promise.reject(new Error(invalid));
      return saveFn({
        data: {
          groupId,
          ...(initial?.id ? { id: initial.id } : {}),
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
    onSuccess: onSaved,
    onError: (e) => setError(e instanceof Error ? e.message : "No se pudo guardar la rutina."),
  });

  const setRow = (i: number, patch: Partial<Row>) => {
    const next = [...rows];
    next[i] = { ...next[i]!, ...patch };
    setRows(next);
  };

  return (
    <Modal
      title={initial?.id ? "Editar rutina del grupo" : "Crear rutina en conjunto"}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
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
          <input
            className="field"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Ej: Tren superior — Miércoles"
          />
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

      <Field label="Descripción / observaciones (opcional)">
        <textarea className="field" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </Field>
    </Modal>
  );
}
