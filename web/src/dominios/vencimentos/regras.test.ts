// Testes das regras da lista de vencimentos: filtro por prazo, contagens e etiqueta de situação.
import { describe, expect, it } from "vitest";
import { contarVencimentos, diasParaVencer, passaPrazo, situacaoDoVencimento } from "./regras";

const HOJE = "2026-11-02";

describe("passaPrazo", () => {
  it("padrão mostra os vencidos e os próximos 90 dias", () => {
    expect(passaPrazo(-200, "padrao")).toBe(true);
    expect(passaPrazo(90, "padrao")).toBe(true);
    expect(passaPrazo(91, "padrao")).toBe(false);
  });
  it("'em até N dias' vai de hoje a N e não inclui os vencidos", () => {
    expect(passaPrazo(0, "7")).toBe(true);
    expect(passaPrazo(7, "7")).toBe(true);
    expect(passaPrazo(8, "7")).toBe(false);
    expect(passaPrazo(-1, "30")).toBe(false);
    expect(passaPrazo(-1, "vencidos")).toBe(true);
    expect(passaPrazo(0, "vencidos")).toBe(false);
    expect(passaPrazo(5000, "todos")).toBe(true);
  });
});

describe("contarVencimentos", () => {
  it("bate com o filtro de cada indicador", () => {
    const itens = ["2026-10-30", HOJE, "2026-11-09", "2026-11-20", "2026-12-25", "2027-06-01"].map((vence_em) => ({ vence_em }));
    const c = contarVencimentos(itens, HOJE);
    expect(c).toEqual({ vencidos: 1, d7: 2, d30: 3, d60: 4 });
    for (const [f, n] of [
      ["vencidos", c.vencidos],
      ["7", c.d7],
      ["30", c.d30],
      ["60", c.d60],
    ] as const)
      expect(itens.filter((i) => passaPrazo(diasParaVencer(i.vence_em, HOJE), f)).length).toBe(n);
  });
});

describe("situacaoDoVencimento", () => {
  it("texto e tom", () => {
    expect(situacaoDoVencimento(-3)).toEqual({ texto: "Vencido há 3 dias", tom: "vermelho" });
    expect(situacaoDoVencimento(-1)).toEqual({ texto: "Venceu ontem", tom: "vermelho" });
    expect(situacaoDoVencimento(0)).toEqual({ texto: "Vence hoje", tom: "ambar" });
    expect(situacaoDoVencimento(1)).toEqual({ texto: "Vence amanhã", tom: "ambar" });
    expect(situacaoDoVencimento(7).tom).toBe("ambar");
    expect(situacaoDoVencimento(8)).toEqual({ texto: "Em 8 dias", tom: "azul" });
  });
});
