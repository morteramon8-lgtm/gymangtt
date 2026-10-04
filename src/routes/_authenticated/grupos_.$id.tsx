import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { AppShell, Field, Modal } from "@/components/gym/AppShell";
import { GroupMemberPicker, type GroupCandidate } from "@/components/gym/GroupMemberPicker";
import { GroupRoutineEditor, type GroupRoutineDraft } from "@/components/gym/GroupRoutineEditor";
import {
  cancelGroupInvitation,
  deleteGroup,
  deleteGroupRoutine,
  getGroup,
  inviteToGroup,
  leaveGroup,
  removeGroupMember,
  updateGroup,
} from "@/lib/groups.functions";
import { formatDate, initials } from "@/lib/gym-shared";

export const Route = createFileRoute("/_authenticated/grupos_/$id")({
  head: () => ({
    meta: [
      { title: "Grupo — GYMANGT" },
      { name: "description", content: "Integrantes y rutinas del grupo de entrenamiento." },
      { property: "og:title", content: "Grupo — GYMANGT" },
      { property: "og:description", content: "Grupo de entrenamiento del gimnasio." },
    ],
  }),
  component: GroupDetail,
});

type GroupData = Awaited<ReturnType<typeof getGroup>>;

function GroupDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const getFn = useServerFn(getGroup);
  const updateFn = useServerFn(updateGroup);
  const deleteFn = useServerFn(deleteGroup);
  const inviteFn = useServerFn(inviteToGroup);
  const cancelFn = useServerFn(cancelGroupInvitation);
  const leaveFn = useServerFn(leaveGroup);
  const removeFn = useServerFn(removeGroupMember);
  const deleteRoutineFn = useServerFn(deleteGroupRoutine);

  const q = useQuery({ queryKey: ["group", id], queryFn: () => getFn({ data: { id } }), retry: false });
  const data = q.data;

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", description: "" });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [picked, setPicked] = useState<GroupCandidate[]>([]);
  const [routineOpen, setRoutineOpen] = useState(false);
  const [editing, setEditing] = useState<GroupRoutineDraft | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["group", id] });
    await qc.invalidateQueries({ queryKey: ["groups"] });
  };
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : "No se pudo completar la acción.");

  const saveInfo = useMutation({
    mutationFn: () => updateFn({ data: { id, name: editForm.name.trim(), description: editForm.description.trim() || null } }),
    onSuccess: async () => {
      setEditOpen(false);
      setError(null);
      await refresh();
    },
    onError: fail,
  });

  const invite = useMutation({
    mutationFn: () => inviteFn({ data: { groupId: id, userIds: picked.map((p) => p.userId) } }),
    onSuccess: async (res) => {
      setInviteOpen(false);
      setPicked([]);
      setError(null);
      setNotice(
        res.invited === 0
          ? "No se envieron invitaciones nuevas (ya eran integrantes o tenían una pendiente)."
          : `Invitaciones enviadas: ${res.invited}.`,
      );
      await refresh();
    },
    onError: fail,
  });

  const cancelInvite = useMutation({
    mutationFn: (invitationId: string) => cancelFn({ data: { invitationId } }),
    onSuccess: refresh,
    onError: fail,
  });

  const removeMember = useMutation({
    mutationFn: (userId: string) => removeFn({ data: { groupId: id, userId } }),
    onSuccess: async () => {
      setError(null);
      await refresh();
    },
    onError: fail,
  });

  const leave = useMutation({
    mutationFn: () => leaveFn({ data: { id } }),
    onSuccess: async () => {
      qc.removeQueries({ queryKey: ["group", id] });
      await qc.invalidateQueries({ queryKey: ["groups"] });
      void navigate({ to: "/grupos" });
    },
    onError: fail,
  });

  const removeGroup = useMutation({
    mutationFn: () => deleteFn({ data: { id } }),
    onSuccess: async () => {
      qc.removeQueries({ queryKey: ["group", id] });
      await qc.invalidateQueries({ queryKey: ["groups"] });
      void navigate({ to: "/grupos" });
    },
    onError: fail,
  });

  const removeRoutine = useMutation({
    mutationFn: (routineId: string) => deleteRoutineFn({ data: { id: routineId } }),
    onSuccess: refresh,
    onError: fail,
  });

  function openEdit() {
    if (!data) return;
    setEditForm({ name: data.group.name, description: data.group.description ?? "" });
    setError(null);
    setEditOpen(true);
  }

  function openNewRoutine() {
    setEditing(undefined);
    setRoutineOpen(true);
  }

  function openEditRoutine(r: GroupData["routines"][number]) {
    setEditing({
      id: r.id,
      name: r.name,
      kind: r.kind,
      notes: r.notes,
      exercises: r.exercises.map((ex) => ({
        name: ex.name,
        sets: ex.sets,
        reps: ex.reps,
        weight: ex.weight,
        rest: ex.rest,
      })),
    });
    setRoutineOpen(true);
  }

  function confirmLeave() {
    if (!data) return;
    const lastOne = data.members.length === 1;
    const text = data.myRole === "owner"
      ? lastOne
        ? `Sos la única persona del grupo "${data.group.name}". Si salís, el grupo y sus rutinas se eliminan. ¿Salir del grupo?`
        : `Sos quien administra el grupo "${data.group.name}". Si salís, la administración pasa al integrante más antiguo. ¿Salir del grupo?`
      : `¿Salir del grupo "${data.group.name}"? Vas a perder el acceso a sus rutinas.`;
    if (confirm(text)) leave.mutate();
  }

  if (q.isLoading) {
    return (
      <AppShell title="Grupo">
        <div className="empty">Cargando el grupo…</div>
      </AppShell>
    );
  }

  if (q.error || !data) {
    return (
      <AppShell title="Grupo">
        <div className="alert">{q.error?.message ?? "Grupo no encontrado."}</div>
        <Link to="/grupos" className="btn btn-ghost btn-sm" style={{ marginTop: 12 }}>
          ← Volver a Grupos
        </Link>
      </AppShell>
    );
  }

  const { group, members, invitations, routines, canManage, myRole } = data;

  return (
    <AppShell
      title={group.name}
      actions={
        <Link to="/grupos" className="btn btn-ghost btn-sm">
          ← Grupos
        </Link>
      }
    >
      {error ? (
        <div className="alert" style={{ marginBottom: 12 }} role="alert">
          {error}{" "}
          <button className="btn btn-ghost btn-sm" onClick={() => setError(null)}>
            Cerrar
          </button>
        </div>
      ) : null}
      {notice ? (
        <div className="alert" style={{ marginBottom: 12 }} role="status">
          {notice}{" "}
          <button className="btn btn-ghost btn-sm" onClick={() => setNotice(null)}>
            Cerrar
          </button>
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 16 }}>
        {/* Información del grupo */}
        <div className="panel">
          <div className="panel-head">
            <div>
              {group.name}
              <div className="rsub">
                {members.length} {members.length === 1 ? "integrante" : "integrantes"} · Creado el{" "}
                {formatDate(group.created_at)}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {canManage ? (
                <>
                  <button className="btn btn-ghost btn-sm" onClick={openEdit}>
                    Editar
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => {
                      if (confirm(`¿Eliminar el grupo "${group.name}"? Se borran también sus rutinas e invitaciones.`))
                        removeGroup.mutate();
                    }}
                  >
                    Eliminar grupo
                  </button>
                </>
              ) : null}
              {myRole ? (
                <button className="btn btn-ghost btn-sm" disabled={leave.isPending} onClick={confirmLeave}>
                  Salir del grupo
                </button>
              ) : null}
            </div>
          </div>
          {group.description ? (
            <div className="panel-body">
              <p className="muted text-xs">{group.description}</p>
            </div>
          ) : null}
        </div>

        {/* Rutinas del grupo */}
        <div className="panel">
          <div className="panel-head">
            <div>
              Rutinas del grupo
              <div className="rsub">
                {routines.length} {routines.length === 1 ? "rutina" : "rutinas"} · Sólo las ve quien integra el grupo
              </div>
            </div>
            <button className="btn btn-primary" onClick={openNewRoutine}>
              + Crear rutina en conjunto
            </button>
          </div>
          <div className="panel-body">
            {routines.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">🏋️</div>
                Todavía no hay rutinas en este grupo. Usá "Crear rutina en conjunto" para armar la primera.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 16 }}>
                {routines.map((r) => (
                  <div className="panel" key={r.id}>
                    <div className="panel-head">
                      <div>
                        {r.name}
                        <div className="rsub">
                          {r.kind} · {r.exercises.length} ejercicios
                          {r.createdByName ? ` · Por ${r.createdByName}` : ""} · {formatDate(r.created_at)}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {r.canEdit ? (
                          <button className="btn btn-ghost btn-sm" onClick={() => openEditRoutine(r)}>
                            Editar
                          </button>
                        ) : null}
                        {r.canDelete ? (
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => {
                              if (confirm(`¿Eliminar la rutina "${r.name}" del grupo?`)) removeRoutine.mutate(r.id);
                            }}
                          >
                            Eliminar
                          </button>
                        ) : null}
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
                            {r.exercises.map((ex) => (
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
          </div>
        </div>

        {/* Integrantes */}
        <div className="panel">
          <div className="panel-head">
            <div>
              Integrantes
              <div className="rsub">{members.length} en el grupo</div>
            </div>
            {canManage ? (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  setPicked([]);
                  setError(null);
                  setInviteOpen(true);
                }}
              >
                + Agregar integrantes
              </button>
            ) : null}
          </div>
          <div className="panel-body">
            {members.map((m) => (
              <div
                key={m.userId}
                className="cell-name"
                style={{ justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}
              >
                <div className="cell-name">
                  <div className="avatar" style={{ overflow: "hidden" }}>
                    {m.photoUrl ? (
                      <img src={m.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      initials(m.firstName, m.lastName)
                    )}
                  </div>
                  <div>
                    {m.firstName} {m.lastName}
                    {m.isMe ? <span className="muted"> (vos)</span> : null}
                  </div>
                  {m.role === "owner" ? (
                    <span className="badge badge-green">Creador / administrador</span>
                  ) : m.isGymAdmin ? (
                    <span className="badge badge-blue">Administrador del gimnasio</span>
                  ) : (
                    <span className="badge">Integrante</span>
                  )}
                </div>
                {canManage && m.role !== "owner" ? (
                  <button
                    className="btn btn-danger btn-sm"
                    disabled={removeMember.isPending}
                    onClick={() => {
                      if (confirm(`¿Quitar a ${m.firstName} ${m.lastName} del grupo?`)) removeMember.mutate(m.userId);
                    }}
                  >
                    Quitar
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {/* Invitaciones pendientes (sólo quien administra el grupo) */}
        {canManage ? (
          <div className="panel">
            <div className="panel-head">
              <div>
                Invitaciones pendientes
                <div className="rsub">Todavía no respondieron</div>
              </div>
            </div>
            <div className="panel-body">
              {invitations.length === 0 ? (
                <p className="muted text-xs">No hay invitaciones pendientes.</p>
              ) : (
                invitations.map((i) => (
                  <div
                    key={i.id}
                    className="cell-name"
                    style={{ justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}
                  >
                    <div>
                      {i.firstName} {i.lastName}
                      <div className="rsub">
                        Invitó {i.invitedBy} · {formatDate(i.createdAt)}
                      </div>
                    </div>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={cancelInvite.isPending}
                      onClick={() => cancelInvite.mutate(i.id)}
                    >
                      Cancelar invitación
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>

      {editOpen ? (
        <Modal
          title="Editar grupo"
          onClose={() => setEditOpen(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setEditOpen(false)}>
                Cancelar
              </button>
              <button className="btn btn-primary" disabled={saveInfo.isPending} onClick={() => saveInfo.mutate()}>
                {saveInfo.isPending ? "Guardando…" : "Guardar"}
              </button>
            </>
          }
        >
          {error ? <div className="alert">{error}</div> : null}
          <Field label="Nombre del grupo">
            <input
              className="field"
              maxLength={80}
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
            />
          </Field>
          <Field label="Descripción (opcional)">
            <textarea
              className="field"
              rows={2}
              maxLength={500}
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
            />
          </Field>
        </Modal>
      ) : null}

      {inviteOpen ? (
        <Modal
          title="Agregar integrantes"
          onClose={() => setInviteOpen(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setInviteOpen(false)}>
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                disabled={invite.isPending || picked.length === 0}
                onClick={() => invite.mutate()}
              >
                {invite.isPending ? "Enviando…" : `Enviar invitaciones${picked.length ? ` (${picked.length})` : ""}`}
              </button>
            </>
          }
        >
          {error ? <div className="alert">{error}</div> : null}
          <p className="muted mb-2 text-xs">
            Reciben una invitación y entran al grupo recién cuando la aceptan.
          </p>
          <GroupMemberPicker groupId={id} selected={picked} onChange={setPicked} />
        </Modal>
      ) : null}

      {routineOpen ? (
        <GroupRoutineEditor
          groupId={id}
          initial={editing}
          onClose={() => setRoutineOpen(false)}
          onSaved={async () => {
            setRoutineOpen(false);
            await refresh();
          }}
        />
      ) : null}
    </AppShell>
  );
}
