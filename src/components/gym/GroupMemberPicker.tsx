import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { searchGroupCandidates } from "@/lib/groups.functions";
import { initials } from "@/lib/gym-shared";

export type GroupCandidate = { userId: string; firstName: string; lastName: string };

/**
 * "Agregar integrantes": lista y busca socios del PROPIO gimnasio.
 * El filtro por gimnasio NO se hace acá: lo aplica la base de datos con la
 * sesión del usuario, así que aunque se altere la petición no hay datos de otro gimnasio.
 * Con `groupId` excluye a quienes ya están en el grupo o tienen una invitación pendiente.
 */
export function GroupMemberPicker({
  groupId,
  selected,
  onChange,
}: {
  groupId?: string;
  selected: GroupCandidate[];
  onChange: (next: GroupCandidate[]) => void;
}) {
  const searchFn = useServerFn(searchGroupCandidates);
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");

  // Actualiza los resultados mientras se escribe, sin disparar una consulta por tecla.
  useEffect(() => {
    const t = setTimeout(() => setQuery(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);

  const results = useQuery({
    queryKey: ["group-candidates", groupId ?? "new", query],
    queryFn: () => searchFn({ data: { query, ...(groupId ? { groupId } : {}) } }),
    placeholderData: (previous) => previous,
    retry: false,
  });

  const isSelected = (id: string) => selected.some((s) => s.userId === id);
  const toggle = (c: GroupCandidate) =>
    onChange(isSelected(c.userId) ? selected.filter((s) => s.userId !== c.userId) : [...selected, c]);

  return (
    <div>
      <input
        className="search-input"
        style={{ width: "100%" }}
        placeholder="Buscar socio por nombre o apellido…"
        aria-label="Buscar socios"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-2" style={{ marginTop: 10 }}>
          {selected.map((s) => (
            <span className="badge badge-green" key={s.userId}>
              {s.firstName} {s.lastName}{" "}
              <button
                type="button"
                aria-label={`Quitar a ${s.firstName} ${s.lastName}`}
                onClick={() => toggle(s)}
                style={{ marginLeft: 4 }}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div style={{ marginTop: 10, maxHeight: 260, overflowY: "auto" }} aria-live="polite">
        {results.isLoading ? (
          <div className="muted text-xs">Buscando…</div>
        ) : results.error ? (
          <div className="alert">{results.error.message}</div>
        ) : (results.data ?? []).length === 0 ? (
          <div className="muted text-xs">
            {query ? "No encontramos socios con ese nombre." : "No hay socios disponibles para invitar."}
          </div>
        ) : (
          (results.data ?? []).map((c) => (
            <div
              key={c.userId}
              className="cell-name"
              style={{ justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)" }}
            >
              <div className="cell-name">
                <div className="avatar">{initials(c.firstName, c.lastName)}</div>
                <div>
                  {c.firstName} {c.lastName}
                </div>
              </div>
              <button
                type="button"
                className={isSelected(c.userId) ? "btn btn-ghost btn-sm" : "btn btn-primary btn-sm"}
                onClick={() => toggle(c)}
              >
                {isSelected(c.userId) ? "Quitar" : "Agregar"}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
