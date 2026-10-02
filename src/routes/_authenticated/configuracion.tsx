import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { AppShell, Field, Modal } from "@/components/gym/AppShell";
import { deletePlan, getSettings, listPlans, savePlan, saveSettings } from "@/lib/gym.functions";
import { money } from "@/lib/gym-shared";

export const Route = createFileRoute("/_authenticated/configuracion")({
  head: () => ({
    meta: [
      { title: "Configuración — GYMANGT" },
      { name: "description", content: "Datos del gimnasio y planes de membresía." },
      { property: "og:title", content: "Configuración — GYMANGT" },
      { property: "og:description", content: "Ajustes del gimnasio y precios de los planes." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const settingsFn = useServerFn(getSettings);
  const saveSettingsFn = useServerFn(saveSettings);
  const plansFn = useServerFn(listPlans);
  const savePlanFn = useServerFn(savePlan);
  const deletePlanFn = useServerFn(deletePlan);
  const queryClient = useQueryClient();

  const settings = useQuery({ queryKey: ["settings"], queryFn: () => settingsFn() });
  const plans = useQuery({ queryKey: ["plans"], queryFn: () => plansFn() });

  const [gym, setGym] = useState({ name: "", address: "", phone: "", email: "", bank_alias: "", bank_cbu: "", bank_holder: "", payment_instructions: "" });
  const [error, setError] = useState<string | null>(null);
  const [planModal, setPlanModal] = useState(false);
  const [plan, setPlan] = useState({ id: undefined as string | undefined, name: "", price: "", months: "1", payment_link: "" });

  useEffect(() => {
    if (settings.data) {
      setGym({
        name: settings.data.name ?? "",
        address: settings.data.address ?? "",
        phone: settings.data.phone ?? "",
        email: settings.data.email ?? "",
        bank_alias: settings.data.bank_alias ?? "",
        bank_cbu: settings.data.bank_cbu ?? "",
        bank_holder: settings.data.bank_holder ?? "",
        payment_instructions: settings.data.payment_instructions ?? "",
      });
    }
  }, [settings.data]);

  const saveGym = useMutation({
    mutationFn: () => saveSettingsFn({ data: gym }),
    onSuccess: () => void queryClient.invalidateQueries(),
    onError: (e) => setError(e instanceof Error ? e.message : "No se pudo guardar."),
  });

  const doSavePlan = useMutation({
    mutationFn: () =>
      savePlanFn({
        data: {
          ...(plan.id ? { id: plan.id } : {}),
          name: plan.name,
          price: Number(plan.price) || 0,
          months: Number(plan.months) || 1,
          payment_link: plan.payment_link.trim() || null,
        },
      }),
    onSuccess: () => {
      setPlanModal(false);
      void queryClient.invalidateQueries();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "No se pudo guardar el plan."),
  });

  const removePlan = useMutation({
    mutationFn: (id: string) => deletePlanFn({ data: { id } }),
    onSuccess: () => void queryClient.invalidateQueries(),
    onError: (e) =>
      setError(
        e instanceof Error
          ? "No se puede eliminar un plan que ya tiene socios o pagos asociados."
          : "Error",
      ),
  });

  return (
    <AppShell title="Configuración">
      {error ? <div className="alert">{error}</div> : null}
      <div className="two-col">
        <div className="panel">
          <div className="panel-head">Datos del gimnasio</div>
          <div className="panel-body">
            <Field label="Nombre">
              <input
                className="field"
                value={gym.name}
                onChange={(e) => setGym({ ...gym, name: e.target.value })}
              />
            </Field>
            <Field label="Dirección">
              <input
                className="field"
                value={gym.address}
                onChange={(e) => setGym({ ...gym, address: e.target.value })}
              />
            </Field>
            <div className="form-row">
              <Field label="Teléfono">
                <input
                  className="field"
                  value={gym.phone}
                  onChange={(e) => setGym({ ...gym, phone: e.target.value })}
                />
              </Field>
              <Field label="Email">
                <input
                  className="field"
                  value={gym.email}
                  onChange={(e) => setGym({ ...gym, email: e.target.value })}
                />
              </Field>
            </div>
            <div className="panel-head" style={{ padding: "12px 0 8px", border: 0 }}>
              Cobro por transferencia (opcional)
            </div>
            <div className="form-row">
              <Field label="Alias">
                <input className="field" value={gym.bank_alias} onChange={(e) => setGym({ ...gym, bank_alias: e.target.value })} />
              </Field>
              <Field label="CBU / CVU">
                <input className="field" value={gym.bank_cbu} onChange={(e) => setGym({ ...gym, bank_cbu: e.target.value })} />
              </Field>
            </div>
            <Field label="Titular de la cuenta">
              <input className="field" value={gym.bank_holder} onChange={(e) => setGym({ ...gym, bank_holder: e.target.value })} />
            </Field>
            <Field label="Instrucciones para el socio">
              <textarea
                className="field"
                rows={2}
                placeholder="Ej: enviá el comprobante por WhatsApp al…"
                value={gym.payment_instructions}
                onChange={(e) => setGym({ ...gym, payment_instructions: e.target.value })}
              />
            </Field>
            <button
              className="btn btn-primary"
              disabled={saveGym.isPending}
              onClick={() => saveGym.mutate()}
            >
              {saveGym.isPending ? "Guardando…" : "Guardar cambios"}
            </button>
            {saveGym.isSuccess ? <p className="muted mt-2 text-xs">Datos guardados.</p> : null}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            Planes de membresía
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                setPlan({ id: undefined, name: "", price: "", months: "1", payment_link: "" });
                setPlanModal(true);
              }}
            >
              + Nuevo plan
            </button>
          </div>
          <div className="panel-body">
            {(plans.data ?? []).map((p) => (
              <div className="list-item" key={p.id}>
                <div>
                  <div style={{ fontWeight: 500 }}>{p.name}</div>
                  <div className="rsub">
                    {p.months} mes{p.months === 1 ? "" : "es"} · {money(p.price)}
                  </div>
                  <div className="rsub">
                    {p.payment_link ? "Link de Mercado Pago cargado" : "Sin link de pago"}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setPlan({
                        id: p.id,
                        name: p.name,
                        price: String(p.price),
                        months: String(p.months),
                        payment_link: p.payment_link ?? "",
                      });
                      setPlanModal(true);
                    }}
                  >
                    Editar
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => removePlan.mutate(p.id)}>
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
            {(plans.data ?? []).length === 0 ? (
              <div className="empty">No hay planes cargados.</div>
            ) : null}
          </div>
        </div>
      </div>

      {planModal ? (
        <Modal
          title={plan.id ? "Editar plan" : "Nuevo plan"}
          onClose={() => setPlanModal(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setPlanModal(false)}>
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                disabled={doSavePlan.isPending}
                onClick={() => doSavePlan.mutate()}
              >
                Guardar plan
              </button>
            </>
          }
        >
          <Field label="Nombre del plan">
            <input
              className="field"
              value={plan.name}
              onChange={(e) => setPlan({ ...plan, name: e.target.value })}
            />
          </Field>
          <div className="form-row">
            <Field label="Precio">
              <input
                className="field"
                type="number"
                value={plan.price}
                onChange={(e) => setPlan({ ...plan, price: e.target.value })}
              />
            </Field>
            <Field label="Duración (meses)">
              <input
                className="field"
                type="number"
                min={1}
                value={plan.months}
                onChange={(e) => setPlan({ ...plan, months: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Link de pago de Mercado Pago (opcional)">
            <input
              className="field"
              placeholder="https://mpago.la/..."
              value={plan.payment_link}
              onChange={(e) => setPlan({ ...plan, payment_link: e.target.value })}
            />
          </Field>
          <p className="muted text-xs">
            Crealo en tu cuenta de Mercado Pago (Cobrar → Link de pago) y pegalo acá. El dinero va
            directo a tu cuenta; el pago se registra en GYMANGT cuando lo confirmes.
          </p>
        </Modal>
      ) : null}
    </AppShell>
  );
}
