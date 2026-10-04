import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { AppShell, Field, Modal } from "@/components/gym/AppShell";
import { GroupMemberPicker, type GroupCandidate } from "@/components/gym/GroupMemberPicker";
import { createGroup, listGroups } from "@/lib/groups.functions";
import { formatDate } from "@/lib/gym-shared";

export const Route = createFileRoute("/_authenticated/grupos")({
  head: () => ({
    meta: [
      { title: "Grupos — GYMANGT" },
      { name: "description", content: "Creá grupos de entrenamiento con otros socios de tu gimnasio." },
      { property: "og:title", content: "Grupos — GYMANGT" },
      { property: "og:description", content: "Grupos de entrenamiento del gimnasio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GroupsPage,
});

const ROLE_LABEL = { owner: "Creador del grupo", member: "Integrante" } as const;

function GroupsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const listFn = useServerFn(listGroups);
  const createFn = useServerFn(createGroup);
  const groups = useQuery({ queryKey: ["groups"], queryFn: () => listFn() });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });
  const [selected, setSelected] = useState<GroupCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);

  function openNew() {
    setForm({ name: "", description: "" });
    setSelected([]);
    setError(null);
    setOpen(true);
  }

  const create = useMutation({
    mutationFn: () => {
      if (!form.name.trim()) return Promise.reject(new Error("Ponele un nombre al grupo."));
      return createFn({
        data: {
          name: form.name.trim(),
          description: form.description.trim() || null,
          inviteUserIds: selected.map((s) => s.userId),
        },
      });
    },
    onSuccess: async (res) => {
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["groups"] });
      void navigate({ to: "/grupos/$id", params: { id: res.id } });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "No se pudo crear el grupo."),
  });

  return (
    <AppShell
      title="Grupos"
      actions={
        <button className="btn btn-primary btn-sm" onClick={openNew}>
          + Crear grupo
        </button>
      }
    >
      {groups.isLoading ? (
        <div className="empty">Cargando tus grupos…</div>
      ) : groups.error ? (
        <div className="alert">{groups.error.message}</div>
      ) : (groups.data ?? []).length === 0 ? (
        <div className="empty">
          <div className="empty-icon">👥</div>
          Todavía no estás en ningún grupo. Usá "+ Crear grupo" para entrenar con otros socios del gimnasio.
        </div>
      ) : (
        <div className="two-col">
          {groups.data!.map((g) => (
            <div className="panel" key={g.id}>
              <div className="panel-head">
                <div>
                  {g.name}
                  <div className="rsub">
                    {g.memberCount} {g.memberCount === 1 ? "integrante" : "integrantes"} ·{" "}
                    {g.myRole ? ROLE_LABEL[g.myRole] : "Administrás este grupo"} · Creado el {formatDate(g.created_at)}
                  </div>
                </div>
                <Link to="/grupos/$id" params={{ id: g.id }} className="btn btn-ghost btn-sm">
                  Abrir
                </Link>
              </div>
              {g.description ? (
                <div className="panel-body">
                  <p className="muted text-xs">{g.description}</p>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {open ? (
        <Modal
          title="Crear grupo"
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setOpen(false)}>
                Cancelar
              </button>
              <button className="btn btn-primary" disabled={create.isPending} onClick={() => create.mutate()}>
                {create.isPending ? "Creando…" : "Crear grupo"}
              </button>
            </>
          }
        >
          {error ? <div className="alert">{error}</div> : null}
          <Field label="Nombre del grupo">
            <input
              className="field"
              maxLength={80}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ej: Entrenamiento de los lunes"
            />
          </Field>
          <Field label="Descripción (opcional)">
            <textarea
              className="field"
              rows={2}
              maxLength={500}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>

          <label className="mb-1 block text-xs">Agregar integrantes</label>
          <p className="muted mb-2 text-xs">
            Reciben una invitación y entran al grupo recién cuando la aceptan.
          </p>
          <GroupMemberPicker selected={selected} onChange={setSelected} />
        </Modal>
      ) : null}
    </AppShell>
  );
}
