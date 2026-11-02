import { describe, expect, it } from "vitest";
import { saltoRotulos } from "./useLargura";

describe("saltoRotulos", () => {
  it("mostra todos quando cada rótulo tem espaço", () => {
    expect(saltoRotulos(60)).toBe(1);
  });
  it("pula rótulos quando a coluna é estreita (12 meses no celular)", () => {
    expect(saltoRotulos(24)).toBe(2);
    expect(saltoRotulos(12)).toBe(4);
  });
  it("não quebra com passo zero", () => {
    expect(saltoRotulos(0)).toBe(46);
  });
});
