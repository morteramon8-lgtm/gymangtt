import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell } from "lucide-react";
import { useState } from "react";

import { markNotificationRead, myNotifications } from "@/lib/notifications.functions";
import { formatDate } from "@/lib/gym-shared";

export function NotificationBell() {
  const listFn = useServerFn(myNotifications);
  const readFn = useServerFn(markNotificationRead);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const q = useQuery({
    queryKey: ["my-notifications"],
    queryFn: () => listFn(),
    refetchInterval: 60_000,
    retry: false,
  });

  const rows = q.data?.rows ?? [];
  const unread = q.data?.unread ?? 0;

  async function markAll() {
    await readFn({ data: {} });
    await queryClient.invalidateQueries({ queryKey: ["my-notifications"] });
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
