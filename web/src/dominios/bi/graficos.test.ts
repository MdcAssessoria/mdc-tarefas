import { describe, expect, it } from "vitest";
import { acumulado, cascata, curto, escalaRedonda } from "./graficos";
import type { Matriz } from "./relatorio";

describe("escalaRedonda", () => {
  it("cobre o intervalo com passos redondos e inclui o zero", () => {
    const e = escalaRedonda(-21_000, 118_000);
    expect(e.de).toBeLessThanOrEqual(-21_000);
    expect(e.ate).toBeGreaterThanOrEqual(118_000);
    expect(e.marcas).toContain(0);
    const passo = e.marcas[1] - e.marcas[0];
    expect([25_000, 50_000]).toContain(passo);
  });
  it("só positivos começa no zero; tudo zero não quebra", () => {
    expect(escalaRedonda(5, 87).de).toBe(0);
    expect(escalaRedonda(0, 0)).toEqual({ de: 0, ate: 1, marcas: [0, 1] });
  });
});

describe("acumulado", () => {
  it("soma mês a mês", () => expect(acumulado([10, -5, 20])).toEqual([10, 5, 25]));
});

describe("cascata", () => {
  const m: Matriz = {
    meses: ["2026-01"],
    linhas: [
      { codigo: "receita_bruta", nome: "Receita bruta", subtotal: false, valores: [100], total: 100 },
      { codigo: "deducoes", nome: "Impostos", subtotal: false, valores: [-10], total: -10 },
      { codigo: "receita_liquida", nome: "Receita líquida", subtotal: true, valores: [90], total: 90 },
      { codigo: "custos", nome: "Custos", subtotal: false, valores: [-50], total: -50 },
      { codigo: "vazia", nome: "Sem valor", subtotal: false, valores: [0], total: 0 },
      { codigo: "resultado_liquido", nome: "Resultado", subtotal: true, valores: [40], total: 40 },
    ],
  };
  it("sobe e desce a partir do acumulado; subtotal vai de zero ao total; conta zerada sai", () => {
    expect(cascata(m)).toEqual([
      { codigo: "receita_bruta", nome: "Receita bruta", de: 0, ate: 100, valor: 100, subtotal: false },
      { codigo: "deducoes", nome: "Impostos", de: 100, ate: 90, valor: -10, subtotal: false },
      { codigo: "receita_liquida", nome: "Receita líquida", de: 0, ate: 90, valor: 90, subtotal: true },
      { codigo: "custos", nome: "Custos", de: 90, ate: 40, valor: -50, subtotal: false },
      { codigo: "resultado_liquido", nome: "Resultado", de: 0, ate: 40, valor: 40, subtotal: true },
    ]);
  });
});

describe("curto", () => {
  it("mi, mil e unidades com sinal", () => {
    expect(curto(1_260_000)).toBe("1,3 mi");
    expect(curto(-350_400)).toBe("−350 mil");
    expect(curto(980)).toBe("980");
  });
});
