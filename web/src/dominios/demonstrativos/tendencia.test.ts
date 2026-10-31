// Testes de caracterização de tendencia.ts (reta de tendência dos índices).
import { describe, expect, it } from "vitest";
import { MAIOR_MELHOR, tendenciaLinear } from "./tendencia";

describe("tendenciaLinear", () => {
  it("exige ao menos 3 pontos válidos", () => {
    expect(tendenciaLinear([1, 2])).toBeNull();
    expect(tendenciaLinear([1, null, undefined, 2, NaN])).toBeNull();
  });
  it("série constante: inclinação zero, R² zero e estável", () => {
    const t = tendenciaLinear([5, 5, 5])!;
    expect(t.inclinacao).toBe(0);
    expect(t.r2).toBe(0);
    expect(t.sentido).toBe("estavel");
  });
  it("reta perfeita crescente: melhora quando maior é melhor, piora quando não", () => {
    const t = tendenciaLinear([1, 2, 3, 4])!;
    expect(t.n).toBe(4);
    expect(t.inclinacao).toBeCloseTo(1);
    expect(t.intercepto).toBeCloseTo(1);
    expect(t.r2).toBeCloseTo(1);
    expect(t.inicio).toBeCloseTo(1);
    expect(t.fim).toBeCloseTo(4);
    expect(t.projecao3).toBeCloseTo(7);
    expect(t.sentido).toBe("melhora");
    expect(tendenciaLinear([1, 2, 3, 4], false)!.sentido).toBe("piora");
  });
  it("respeita meses faltantes pela posição na série", () => {
    const t = tendenciaLinear([10, null, 30, 40])!;
    expect(t.n).toBe(3);
    expect(t.inclinacao).toBeCloseTo(10);
    expect(t.inicio).toBeCloseTo(10);
    expect(t.fim).toBeCloseTo(40);
  });
  it("variação menor que 5% do nível é estável", () => {
    expect(tendenciaLinear([100, 101, 102])!.sentido).toBe("estavel");
  });
  it("tabela de sentido dos índices", () => {
    expect(MAIOR_MELHOR.liquidez_corrente).toBe(true);
    expect(MAIOR_MELHOR.endividamento_geral).toBe(false);
  });
});
