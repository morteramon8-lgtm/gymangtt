import { describe, expect, it } from "vitest";

import {
  addDays,
  addMonths,
  daysBetween,
  daysUntil,
  endOfMonth,
  formatDate,
  isISODate,
  startOfMonth,
  todayISO,
} from "./dates";
import { memberStatus } from "./gym-shared";

describe("addMonths (renovación de una cuota mensual)", () => {
  it("conserva el día del mes", () => {
    expect(addMonths("2026-09-24", 1)).toBe("2026-10-24");
    expect(addMonths("2026-01-01", 1)).toBe("2026-02-01");
    expect(addMonths("2026-04-30", 1)).toBe("2026-05-30");
  });

  it("usa el último día cuando el día no existe en el mes destino", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2026-01-30", 1)).toBe("2026-02-28");
    expect(addMonths("2026-03-31", 1)).toBe("2026-04-30");
    expect(addMonths("2026-05-31", 1)).toBe("2026-06-30");
  });

  it("maneja el 29/02 de un año bisiesto", () => {
    expect(addMonths("2024-02-29", 1)).toBe("2024-03-29");
    expect(addMonths("2024-02-29", 12)).toBe("2025-02-28");
  });

  it("cruza el cambio de año", () => {
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonths("2026-12-31", 1)).toBe("2027-01-31");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
  });

  it("planes de varios meses", () => {
    expect(addMonths("2026-01-31", 3)).toBe("2026-04-30");
    expect(addMonths("2026-02-28", 12)).toBe("2027-02-28");
  });
});

describe("daysBetween / daysUntil", () => {
  it("cuenta días exactos sin corrimientos", () => {
    expect(daysBetween("2026-09-23", "2026-09-24")).toBe(1);
    expect(daysBetween("2026-09-24", "2026-09-24")).toBe(0);
    expect(daysBetween("2026-09-25", "2026-09-24")).toBe(-1);
  });

  it("cruza mes y año", () => {
    expect(daysBetween("2026-01-31", "2026-02-01")).toBe(1);
    expect(daysBetween("2026-02-28", "2026-03-01")).toBe(1);
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetween("2026-04-30", "2026-05-01")).toBe(1);
  });

  it("no depende del huso: el día de hoy en Argentina cuenta 0", () => {
    expect(daysUntil(todayISO())).toBe(0);
  });
});

describe("addDays / límites de mes", () => {
  it("suma y resta días", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("primer y último día del mes", () => {
    expect(startOfMonth("2026-09-24")).toBe("2026-09-01");
    expect(endOfMonth("2026-02-10")).toBe("2026-02-28");
    expect(endOfMonth("2024-02-10")).toBe("2024-02-29");
    expect(endOfMonth("2026-04-01")).toBe("2026-04-30");
    expect(endOfMonth("2026-12-05")).toBe("2026-12-31");
  });
});

describe("formatDate", () => {
  it("muestra la fecha de calendario sin corrimiento", () => {
    expect(formatDate("2026-09-24")).toBe("24 sep 2026");
    expect(formatDate("2026-01-01")).toBe("01 ene 2026");
    expect(formatDate("2026-12-31")).toBe("31 dic 2026");
    expect(formatDate(null)).toBe("—");
  });

  it("valida fechas de calendario", () => {
    expect(isISODate("2026-02-29")).toBe(false);
    expect(isISODate("2024-02-29")).toBe(true);
    expect(isISODate("2026-13-01")).toBe(false);
    expect(isISODate("24/09/2026")).toBe(false);
  });
});

describe("memberStatus (misma cuenta que los avisos)", () => {
  const today = todayISO();

  it("usa la ventana de días configurada", () => {
    expect(memberStatus(addDays(today, 10), true, 7)).toBe("activo");
    expect(memberStatus(addDays(today, 7), true, 7)).toBe("por_vencer");
    expect(memberStatus(addDays(today, 10), true, 15)).toBe("por_vencer");
    expect(memberStatus(today, true, 7)).toBe("por_vencer");
    expect(memberStatus(addDays(today, -1), true, 7)).toBe("vencido");
  });

  it("baja y sin membresía tienen prioridad", () => {
    expect(memberStatus(addDays(today, 30), false, 7)).toBe("baja");
    expect(memberStatus(null, true, 7)).toBe("sin_membresia");
  });
});
