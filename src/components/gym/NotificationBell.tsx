import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell } from "lucide-react";
import { useState } from "react";

import { respondGroupInvitation } from "@/lib/groups.functions";
import { markNotificationRead, myNotifications } from "@/lib/notifications.functions";
import { formatDate } from "@/lib/gym-shared";

export function NotificationBell() {
  const listFn = useServerFn(myNotifications);
  const readFn = useServerFn(markNotificationRead);
  const respondFn = useServerFn(respondGroupInvitation);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busyInvitation, setBusyInvitation] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["my-notifications"],
    queryFn: () => listFn(),
    refetchInterval: 60_000,
    retry: false,
  });

  const rows = q.data?.rows ?? [];
  const unread = q.data?.unread ?? 0;
  const invitationStatus = q.data?.invitationStatus ?? {};

  async function markAll() {
    await readFn({ data: {} });
    await queryClient.invalidateQueries({ queryKey: ["my-notifications"] });
  }

  async function respond(invitationId: string, accept: boolean) {
    setBusyInvitation(invitationId);
    setInviteError(null);
    try {
      const res = await respondFn({ data: { invitationId, accept } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["my-notifications"] }),
        queryClient.invalidateQueries({ queryKey: ["groups"] }),
      ]);
      if (res.status === "aceptada") {
        setOpen(false);
        void navigate({ to: "/grupos/$id", params: { id: res.groupId } });
      }
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : "No pudimos responder la invitación.");
      await queryClient.invalidateQueries({ queryKey: ["my-notifications"] });
    } finally {
      setBusyInvitation(null);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="btn btn-ghost relative"
        onClick={() => setOpen((v) => !v)}
        aria-label="Avisos"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
            {unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-lg border border-border bg-card p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <strong className="text-sm">Avisos</strong>
            {unread > 0 ? (
              <button type="button" className="btn btn-ghost text-xs" onClick={markAll}>
                Marcar todo como leído
              </button>
            ) : null}
          </div>
          {inviteError ? <p className="mb-2 text-xs text-destructive">{inviteError}</p> : null}
          {rows.length === 0 ? (
            <p className="muted text-xs">Todavía no tenés avisos.</p>
          ) : (
            <ul className="max-h-80 space-y-2 overflow-y-auto">
              {rows.map((n) => (
                <li
                  key={n.id}
                  className={`rounded-md border border-border p-2 ${n.read_at ? "opacity-60" : ""}`}
                >
                  <div className="text-sm font-semibold">{n.title}</div>
                  <div className="text-xs">{n.body}</div>
                  {n.kind === "grupo_invitacion" && n.invitation_id && invitationStatus[n.invitation_id] === "pendiente" ? (
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={busyInvitation === n.invitation_id}
                        onClick={() => void respond(n.invitation_id!, true)}
                      >
                        Aceptar
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busyInvitation === n.invitation_id}
                        onClick={() => void respond(n.invitation_id!, false)}
                      >
                        Rechazar
                      </button>
                    </div>
                  ) : n.kind === "grupo_invitacion" && n.invitation_id ? (
                    <div className="muted mt-1 text-[11px]">
                      {invitationStatus[n.invitation_id] === "aceptada"
                        ? "Aceptaste esta invitación."
                        : invitationStatus[n.invitation_id] === "rechazada"
                          ? "Rechazaste esta invitación."
                          : "Esta invitación ya no está disponible."}
                    </div>
                  ) : n.group_id && n.kind.startsWith("grupo_") ? (
                    <Link
                      to="/grupos/$id"
                      params={{ id: n.group_id }}
                      className="mt-1 inline-block text-[11px] font-semibold underline"
                      onClick={() => setOpen(false)}
                    >
                      Ver grupo
                    </Link>
                  ) : null}
                  <div className="muted mt-1 text-[11px]">{formatDate(n.created_at)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
