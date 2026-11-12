import { describe, expect, it } from "vitest";
import { LARGURA_MENU, lerLarguraMenu, limitarLarguraMenu } from "./larguraMenu";

describe("largura do menu lateral", () => {
  it("fica entre a mínima e a máxima", () => {
    expect(limitarLarguraMenu(100)).toBe(LARGURA_MENU.minima);
    expect(limitarLarguraMenu(900)).toBe(LARGURA_MENU.maxima);
    expect(limitarLarguraMenu(300.6)).toBe(301);
  });
  it("valor salvo estragado ou vazio volta à padrão", () => {
    expect(lerLarguraMenu(null)).toBe(LARGURA_MENU.padrao);
    expect(lerLarguraMenu("")).toBe(LARGURA_MENU.padrao);
    expect(lerLarguraMenu("abc")).toBe(LARGURA_MENU.padrao);
    expect(limitarLarguraMenu(Number.NaN)).toBe(LARGURA_MENU.padrao);
  });
  it("valor salvo válido é respeitado (e limitado)", () => {
    expect(lerLarguraMenu("320")).toBe(320);
    expect(lerLarguraMenu("5000")).toBe(LARGURA_MENU.maxima);
  });
});
