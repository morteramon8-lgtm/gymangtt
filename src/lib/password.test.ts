import { describe, expect, it } from "vitest";
import { passwordSchema, PASSWORD_MIN_LENGTH } from "./validation";

describe("contraseña mínima unificada", () => {
  it("el mínimo es 8", () => expect(PASSWORD_MIN_LENGTH).toBe(8));
  it("7 caracteres → rechazado", () => expect(passwordSchema.safeParse("a".repeat(7)).success).toBe(false));
  it("8 caracteres → aceptado", () => expect(passwordSchema.safeParse("a".repeat(8)).success).toBe(true));
  it("más de 8 → aceptado", () => expect(passwordSchema.safeParse("a".repeat(20)).success).toBe(true));
});
