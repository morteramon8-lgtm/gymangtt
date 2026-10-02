import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { AppShell } from "@/components/gym/AppShell";
import { getMyPortal } from "@/lib/gym.functions";

export const Route = createFileRoute("/_authenticated/mi-rutina")({
  head: () => ({
    meta: [
      { title: "Mi rutina — GYMANGT" },
      { name: "description", content: "La rutina de entrenamiento que te asignó el gimnasio." },
      { property: "og:title", content: "Mi rutina — GYMANGT" },
      { property: "og:description", content: "Rutina asignada al socio." },
    ],
  }),
  component: MyRoutine,
});

function MyRoutine() {
  const fn = useServerFn(getMyPortal);
  const { data, isLoading } = useQuery({ queryKey: ["portal"], queryFn: () => fn() });
  const routine = data?.routine;

  return (
    <AppShell title="Mi rutina">
      {isLoading ? (
        <div className="empty">Cargando tu rutina…</div>
      ) : !routine ? (
        <div className="empty">
          <div className="empty-icon">🏋️</div>
          Todavía no tenés una rutina asignada.
        </div>
      ) : (
        <div className="panel">
          <div className="panel-head">
            <div>
              {routine.name}
              <div className="rsub">{routine.kind}</div>
            </div>
          </div>
          <div className="panel-body">
            <table className="gym-table">
              <thead>
                <tr>
                  <th>Ejercicio</th>
                  <th>Series</th>
                  <th>Repeticiones</th>
                </tr>
              </thead>
              <tbody>
                {[...(routine.routine_exercises ?? [])]
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
            {routine.notes ? <p className="muted mt-3 text-xs">{routine.notes}</p> : null}
          </div>
        </div>
      )}
    </AppShell>
  );
}
