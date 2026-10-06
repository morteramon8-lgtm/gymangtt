import { describe, expect, it } from "vitest";
import { subscriptionAccess, type SubRow } from "./billing-shared";

const base: SubRow = {
  status: "trial",
  price_ars: 34500,
  trial_ends_at: "2026-10-20T00:00:00Z",
  current_period_end: null,
  past_due_since: null,
};
const now = new Date("2026-10-10T00:00:00Z");

describe("subscriptionAccess", () => {
  it("prueba vigente permite operar", () => {
    const r = subscriptionAccess(base, now);
    expect(r.state).toBe("trial");
    expect(r.allowed).toBe(true);
    expect(r.daysLeft).toBe(10);
  });
  it("prueba terminada pasa a vencida", () => {
    const r = subscriptionAccess({ ...base, trial_ends_at: "2026-10-01T00:00:00Z" }, now);
    expect(r.state).toBe("expired");
    expect(r.allowed).toBe(false);
  });
  it("activa siempre permite", () => {
    expect(subscriptionAccess({ ...base, status: "active" }, now).allowed).toBe(true);
  });
  it("pago rechazado: gracia de 7 días y luego bloqueo", () => {
    const pd: SubRow = { ...base, status: "past_due", past_due_since: "2026-10-08T00:00:00Z" };
    expect(subscriptionAccess(pd, now).allowed).toBe(true);
    expect(subscriptionAccess(pd, new Date("2026-10-16T00:00:00Z")).allowed).toBe(false);
  });
  it("cancelada sigue hasta el fin del período pagado", () => {
    const c: SubRow = { ...base, status: "cancelled", current_period_end: "2026-10-25T00:00:00Z" };
    expect(subscriptionAccess(c, now).allowed).toBe(true);
    expect(subscriptionAccess(c, new Date("2026-10-26T00:00:00Z")).allowed).toBe(false);
  });
  it("sin fila no bloquea", () => {
    expect(subscriptionAccess(null, now).allowed).toBe(true);
  });
});
