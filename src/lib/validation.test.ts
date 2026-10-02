import { describe, expect, it } from "vitest";

import {
  checkAmount,
  checkDate,
  checkMemberForm,
  checkPhone,
  checkProgressForm,
  checkRoutineForm,
  DATE_RULES,
  zMeasure,
  LIMITS,
} from "./validation";

describe("validaciones", () => {
  it("rechaza fechas inexistentes que antes pasaban con min(8)", () => {
    expect(checkDate("2025-02-30", "La fecha")).toMatch(/no es una fecha válida/);
    expect(checkDate("abcdefgh", "La fecha")).toMatch(/no es una fecha válida/);
    expect(checkDate("2024-02-29", "La fecha")).toBeNull();
  });
  it("nacimiento: no futura ni anterior a 1900", () => {
    expect(checkDate("2999-01-01", "X", DATE_RULES.birth)).not.toBeNull();
    expect(checkDate("1850-01-01", "X", DATE_RULES.birth)).not.toBeNull();
    expect(checkDate("1990-05-10", "X", DATE_RULES.birth)).toBeNull();
  });
  it("socio: nombre con letras, email y teléfono", () => {
    const ok = { first_name: "José", last_name: "Núñez" };
    expect(checkMemberForm(ok)).toBeNull();
    expect(checkMemberForm({ ...ok, first_name: "  " })).toMatch(/obligatorio/);
    expect(checkMemberForm({ ...ok, first_name: "123" })).toMatch(/letras/);
    expect(checkMemberForm({ ...ok, email: "a@b" })).toMatch(/email/);
    expect(checkPhone("+54 9 (11) 5555-1234")).toBeNull();
    expect(checkPhone("12")).not.toBeNull();
    expect(checkPhone("abc123456")).not.toBeNull();
  });
  it("pagos: importe", () => {
    expect(checkAmount("0")).not.toBeNull();
    expect(checkAmount("-5")).not.toBeNull();
    expect(checkAmount("18000")).toBeNull();
    expect(checkAmount("15000,50")).toBeNull();
    expect(checkAmount(LIMITS.amountMax + 1)).not.toBeNull();
  });
  it("progreso: rangos amplios, acepta coma decimal", () => {
    const base = { measured_on: "2025-01-10" };
    expect(checkProgressForm({ ...base, weight_kg: "250,5", body_fat: "55" })).toBeNull();
    expect(checkProgressForm({ ...base, weight_kg: "7000" })).toMatch(/peso/);
    expect(checkProgressForm({ ...base, body_fat: "120" })).toMatch(/grasa/);
    expect(checkProgressForm({ ...base, arm_cm: "abc" })).toMatch(/número/);
    expect(zMeasure("P", LIMITS.weightKg, " kg").parse("72,5")).toBe(72.5);
  });
  it("rutinas", () => {
    const ex = { name: "Sentadilla", sets: "4", reps: "8-12" };
    expect(checkRoutineForm({ name: "Fuerza", exercises: [ex] })).toBeNull();
    expect(checkRoutineForm({ name: "Fuerza", exercises: [] })).toMatch(/al menos/);
    expect(checkRoutineForm({ name: "Fuerza", exercises: [{ ...ex, sets: "0" }] })).toMatch(/series/);
    expect(checkRoutineForm({ name: "Fuerza", exercises: [{ ...ex, sets: "2.5" }] })).toMatch(/series/);
    expect(checkRoutineForm({ name: "Fuerza", exercises: [{ ...ex, reps: "muchas" }] })).toMatch(/repeticiones/);
  });
});
