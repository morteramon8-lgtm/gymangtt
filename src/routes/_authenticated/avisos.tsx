import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { MessageCircle, Send } from "lucide-react";

import { AppShell, Field } from "@/components/gym/AppShell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DEFAULT_WHATSAPP_TEMPLATE,
  listNotifications,
  runExpiryScan,
  saveNotificationSettings,
} from "@/lib/notifications.functions";
import { formatDate } from "@/lib/gym-shared";

export const Route = createFileRoute("/_authenticated/avisos")({
  head: () => ({
    meta: [
      { title: "Avisos — GYMANGT" },
      {
        name: "description",
        content: "Recordatorios de vencimiento y avisos de rutina para los socios del gimnasio.",
      },
      { property: "og:title", content: "Avisos — GYMANGT" },
      { property: "og:description", content: "Estado de los avisos enviados a los socios." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotificationsPage,
});

const STATUS_LABEL: Record<string, string> = {
  entregado: "Entregado",
  leido: "Leído",
  pendiente: "Pendiente",
  fallido: "Fallido",
};

const KIND_LABEL: Record<string, string> = {
  vencimiento: "Vencimiento",
  rutina_asignada: "Rutina asignada",
  rutina_modificada: "Rutina modificada",
};

type WhatsAppDraft = {
  phone: string;
  memberName: string;
  message: string;
};

function fillWhatsAppTemplate(
  template: string,
  values: Record<"nombre" | "gimnasio" | "vencimiento" | "link_pago" | "alias", string>,
) {
  return template.replace(/\{(nombre|gimnasio|vencimiento|link_pago|alias)\}/g, (_, key: keyof typeof values) => values[key]);
}

function whatsappPhone(phone: string) {
  const digits = phone.replace(/\D/g, "").replace(/^00/, "");
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

function NotificationsPage() {
  const listFn = useServerFn(listNotifications);
  const scanFn = useServerFn(runExpiryScan);
  const saveFn = useServerFn(saveNotificationSettings);
  const queryClient = useQueryClient();

  const q = useQuery({ queryKey: ["notifications-admin"], queryFn: () => listFn() });

  const [form, setForm] = useState({
    expiry_enabled: true,
    days_before: 5,
    notify_on_due_date: true,
    notify_overdue: true,
    routine_enabled: true,
    whatsapp_template: DEFAULT_WHATSAPP_TEMPLATE,
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [whatsappDraft, setWhatsappDraft] = useState<WhatsAppDraft | null>(null);

  useEffect(() => {
    const s = q.data?.settings;
    if (s) {
      setForm({
        expiry_enabled: s.expiry_enabled ?? true,
        days_before: s.days_before ?? 5,
        notify_on_due_date: s.notify_on_due_date ?? true,
        notify_overdue: s.notify_overdue ?? true,
        routine_enabled: s.routine_enabled ?? true,
        whatsapp_template: s.whatsapp_template ?? DEFAULT_WHATSAPP_TEMPLATE,
      });
    }
  }, [q.data?.settings]);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await saveFn({ data: form });
      await queryClient.invalidateQueries({ queryKey: ["notifications-admin"] });
      setMsg("Configuración guardada.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "No pudimos guardar la configuración.");
    } finally {
      setBusy(false);
    }
  }

  async function scan() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await scanFn();
      await queryClient.invalidateQueries();
      setMsg(
        res.disabled
          ? "Los recordatorios de vencimiento están desactivados."
          : `Revisamos ${res.checked} membresías y generamos ${res.created} aviso${res.created === 1 ? "" : "s"} nuevo${res.created === 1 ? "" : "s"}.`,
      );
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "No pudimos revisar los vencimientos.");
    } finally {
      setBusy(false);
    }
  }

  const stats = q.data?.stats;

  function prepareWhatsApp(member: {
    first_name: string;
    last_name: string;
    phone: string | null;
    expires_at: string | null;
    plans: { payment_link: string | null } | null;
  }) {
    if (!member.phone) return;
    const phone = whatsappPhone(member.phone);
    if (!phone) {
      setMsg(`El teléfono de ${member.first_name} no tiene un formato válido para WhatsApp.`);
      return;
    }
    const gym = q.data?.gym;
    const message = fillWhatsAppTemplate(form.whatsapp_template, {
      nombre: member.first_name,
      gimnasio: gym?.name || "el gimnasio",
      vencimiento: member.expires_at ? formatDate(member.expires_at) : "la fecha indicada",
      link_pago: member.plans?.payment_link || "consultanos por el link de pago",
      alias: gym?.bank_alias || "consultanos por los datos de transferencia",
    });
    setWhatsappDraft({
      phone,
      memberName: `${member.first_name} ${member.last_name}`,
      message,
    });
  }

  function openWhatsApp() {
    if (!whatsappDraft) return;
    window.open(
      `https://wa.me/${whatsappDraft.phone}?text=${encodeURIComponent(whatsappDraft.message)}`,
      "_blank",
      "noopener,noreferrer",
    );
    setWhatsappDraft(null);
  }

  return (
    <AppShell
      title="Avisos"
      actions={
        <Button type="button" onClick={scan} disabled={busy}>
          Revisar vencimientos ahora
        </Button>
      }
    >
      {msg ? <div className="card mb-4 text-sm">{msg}</div> : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <div className="card">
          <div className="muted text-xs">Total</div>
          <div className="text-2xl font-bold">{stats?.total ?? 0}</div>
        </div>
        <div className="card">
          <div className="muted text-xs">Entregados</div>
          <div className="text-2xl font-bold">{stats?.entregados ?? 0}</div>
        </div>
        <div className="card">
          <div className="muted text-xs">Leídos</div>
          <div className="text-2xl font-bold">{stats?.leidos ?? 0}</div>
        </div>
        <div className="card">
          <div className="muted text-xs">Sin cuenta / pendientes</div>
          <div className="text-2xl font-bold">{stats?.pendientes ?? 0}</div>
        </div>
      </div>

      <div className="card mb-4">
        <h3 className="mb-3 font-semibold">Configuración</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Días de anticipación para el aviso de vencimiento">
            <input
              type="number"
              min={1}
              max={60}
              value={form.days_before}
              onChange={(e) => setForm({ ...form, days_before: Number(e.target.value) })}
            />
          </Field>
          <div className="form-group">
            <label>Opciones</label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.expiry_enabled}
                onChange={(e) => setForm({ ...form, expiry_enabled: e.target.checked })}
              />
              Avisar antes del vencimiento
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.notify_on_due_date}
                onChange={(e) => setForm({ ...form, notify_on_due_date: e.target.checked })}
              />
              Avisar el día del vencimiento
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.notify_overdue}
                onChange={(e) => setForm({ ...form, notify_overdue: e.target.checked })}
              />
              Avisar cuando ya está vencida
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.routine_enabled}
                onChange={(e) => setForm({ ...form, routine_enabled: e.target.checked })}
              />
              Avisar al asignar o modificar una rutina
            </label>
          </div>
        </div>
        <Field label="Mensaje de WhatsApp">
          <textarea
            rows={5}
            maxLength={2000}
            value={form.whatsapp_template}
            onChange={(e) => setForm({ ...form, whatsapp_template: e.target.value })}
          />
        </Field>
        <div className="muted mt-1 text-xs">
          Variables disponibles: {"{nombre}"}, {"{gimnasio}"}, {"{vencimiento}"}, {"{link_pago}"} y {"{alias}"}.
        </div>
        <Button type="button" className="mt-3" onClick={save} disabled={busy}>
          Guardar configuración
        </Button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Socio</th>
              <th>Tipo</th>
              <th>Aviso</th>
              <th>Estado</th>
              <th>Fecha</th>
              <th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {(q.data?.rows ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  Todavía no se generó ningún aviso.
                </td>
              </tr>
            ) : (
              (q.data?.rows ?? []).map((n) => {
                const m = n.members as {
                  first_name: string;
                  last_name: string;
                  phone: string | null;
                  expires_at: string | null;
                  plans: { payment_link: string | null } | null;
                } | null;
                return (
                  <tr key={n.id}>
                    <td>{m ? `${m.first_name} ${m.last_name}` : "—"}</td>
                    <td>{KIND_LABEL[n.kind] ?? n.kind}</td>
                    <td>
                      <div className="font-medium">{n.title}</div>
                      <div className="muted text-xs">{n.body}</div>
                    </td>
                    <td>
                      <span className="badge">{STATUS_LABEL[n.status] ?? n.status}</span>
                      {n.error ? <div className="muted text-xs">{n.error}</div> : null}
                    </td>
                    <td>{formatDate(n.created_at)}</td>
                    <td>
                      {n.kind === "vencimiento" && m?.phone ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => prepareWhatsApp(m)}
                        >
                          <MessageCircle aria-hidden="true" />
                          WhatsApp
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={Boolean(whatsappDraft)} onOpenChange={(open) => !open && setWhatsappDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mensaje para {whatsappDraft?.memberName}</DialogTitle>
            <DialogDescription>
              Modificá el texto como quieras. Nada se envía hasta que lo confirmes en WhatsApp.
            </DialogDescription>
          </DialogHeader>
          <Field label="Mensaje">
            <textarea
              rows={9}
              maxLength={2000}
              value={whatsappDraft?.message ?? ""}
              onChange={(e) =>
                setWhatsappDraft((current) => current ? { ...current, message: e.target.value } : null)
              }
            />
          </Field>
          <div className="muted text-right text-xs">{whatsappDraft?.message.length ?? 0}/2000</div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setWhatsappDraft(null)}>
              Cancelar
            </Button>
            <Button type="button" onClick={openWhatsApp} disabled={!whatsappDraft?.message.trim()}>
              <Send aria-hidden="true" />
              Abrir WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
