// Testa a projeção da DRE: modos (crescimento e % da receita), taxas e valores digitados, subtotais, distribuição
// mensal, conversão para o orçamento e a planilha-modelo.
import { describe, expect, it } from "vitest";
import {
  aplicarPlanilha,
  distribuirMensal,
  lerPlanilhaProjecao,
  paraOrcamento,
  premissasIniciais,
  projetar,
  variacao,
} from "./projecao";
import type { LinhaDre } from "./projecao";

const DRE: LinhaDre[] = [
  { codigo: "receita_bruta", nome: "Receita bruta de vendas e serviços", ordem: 10, natureza: "R", soma: null },
  { codigo: "deducoes", nome: "(−) Impostos sobre o faturamento", ordem: 30, natureza: "P", soma: null },
  { codigo: "receita_liquida", nome: "Receita líquida", ordem: 40, natureza: null, soma: ["receita_bruta", "deducoes"] },
  { codigo: "custos", nome: "(−) Custo dos produtos e serviços", ordem: 50, natureza: "P", soma: null },
  { codigo: "lucro_bruto", nome: "Lucro bruto", ordem: 60, natureza: null, soma: ["receita_liquida", "custos"] },
  { codigo: "despesas_administrativas", nome: "(−) Despesas administrativas", ordem: 80, natureza: "P", soma: null },
  { codigo: "nao_classificado", nome: "Não classificado", ordem: 105, natureza: null, soma: null },
  {
    codigo: "resultado_operacional",
    nome: "Resultado operacional",
    ordem: 110,
    natureza: null,
    soma: ["lucro_bruto", "despesas_administrativas", "nao_classificado"],
  },
];
// realizado com sinal, como sai da DRE
const REAL = { receita_bruta: 1_000_000, deducoes: -100_000, custos: -400_000, despesas_administrativas: -200_000, nao_classificado: -5000 };

const linha = (p: ReturnType<typeof projetar>, cod: string) => p.linhas.find((l) => l.codigo === cod)!;

describe("projetar", () => {
  it("receita cresce pela premissa; impostos e custos acompanham a receita; despesa cresce pela inflação", () => {
    const p = premissasIniciais(DRE, 2, 10, 5);
    const r = projetar(DRE, 2025, REAL, p);
    expect(r.anos).toEqual([2025, 2026, 2027]);
    expect(linha(r, "receita_bruta").valores).toEqual([1_000_000, 1_100_000, 1_210_000]);
    expect(linha(r, "deducoes").valores).toEqual([-100_000, -110_000, -121_000]);
    expect(linha(r, "deducoes").taxas).toEqual([10, 10]);
    expect(linha(r, "custos").valores).toEqual([-400_000, -440_000, -484_000]);
    expect(linha(r, "despesas_administrativas").valores).toEqual([-200_000, -210_000, -220_500]);
    expect(linha(r, "lucro_bruto").valores).toEqual([500_000, 550_000, 605_000]);
    // não classificado fica fora do estudo (classifique antes)
    expect(r.linhas.some((l) => l.codigo === "nao_classificado")).toBe(false);
    expect(linha(r, "resultado_operacional").valores).toEqual([300_000, 340_000, 384_500]);
  });

  it("taxa própria da linha e valor digitado vencem o padrão; o ano seguinte parte do digitado", () => {
    const p = premissasIniciais(DRE, 2, 10, 5);
    p.linhas.custos = { modo: "receita", taxas: [35, null, null, null, null] };
    p.valores.despesas_administrativas = [250_000, null, null, null, null];
    const r = projetar(DRE, 2025, REAL, p);
    expect(linha(r, "custos").valores[1]).toBe(-385_000);
    expect(linha(r, "custos").valores[2]).toBe(-484_000); // volta aos 40% do ano-base
    expect(linha(r, "despesas_administrativas").valores).toEqual([-200_000, -250_000, -262_500]);
    expect(linha(r, "despesas_administrativas").manual).toEqual([false, true, false]);
  });

  it("ajuste do ano-base muda a base da projeção; receita bruta nunca vai por % da própria receita", () => {
    const p = premissasIniciais(DRE, 1, 0, 0);
    p.base.receita_bruta = 2_000_000;
    p.linhas.receita_bruta = { modo: "receita", taxas: [null, null, null, null, null] };
    const r = projetar(DRE, 2025, REAL, p);
    expect(linha(r, "receita_bruta").valores).toEqual([2_000_000, 2_000_000]);
    expect(linha(r, "receita_bruta").modo).toBe("crescimento");
    expect(linha(r, "deducoes").taxas[0]).toBe(5); // 100 mil sobre 2 milhões
  });

  it("variação % entre anos", () => {
    expect(variacao(100, 110)).toBe(10);
    expect(variacao(0, 5)).toBeNull();
  });
});

describe("distribuirMensal e paraOrcamento", () => {
  it("segue a sazonalidade e fecha no centavo", () => {
    const m = distribuirMensal(1000, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(m.reduce((a, b) => a + b, 0)).toBeCloseTo(1000, 2);
    expect(distribuirMensal(1200, [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1])).toEqual([800, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 400]);
    expect(distribuirMensal(120, [])).toEqual(Array(12).fill(10));
  });
  it("grava só os anos projetados, em valor positivo e mês zerado em branco", () => {
    const r = projetar(DRE, 2025, REAL, premissasIniciais(DRE, 1, 10, 5));
    const o = paraOrcamento(r, "11222333000181", { custos: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
    expect(o.every((x) => x.competencia.startsWith("2026"))).toBe(true);
    const custos = o.filter((x) => x.linha === "custos");
    expect(custos[0]).toEqual({ cnpj: "11222333000181", relatorio: "dre", linha: "custos", competencia: "2026-01-01", valor: 440_000 });
    expect(custos[1].valor).toBeNull();
    expect(o.filter((x) => x.linha === "despesas_administrativas").every((x) => x.valor === 17_500)).toBe(true);
  });
});

describe("planilha-modelo", () => {
  const abas = {
    Projeção: [
      ["MDC Assessoria · Projeção"],
      ["subtítulo"],
      [],
      ["Linha", "Código", "2025 (base)", "2026", "2027"],
      ["Receita bruta de vendas e serviços", "receita_bruta", 1_000_000, 1_100_000, 1_210_000],
      ["Receita líquida", "receita_liquida", 900_000, 990_000, 1_089_000],
      ["(−) Despesas administrativas", "", "200.000,00", "300.000,00", ""],
      ["Linha que não existe", "", 1, 2, 3],
    ],
    Premissas: [["Premissa", "2026", "2027"], ["Crescimento da receita (%)", 10, 10], ["Inflação (%)", 5, "6"]],
  };
  it("lê valores por ano (título do modelo ignorado), ignora subtotal e aponta linha inválida", () => {
    const l = lerPlanilhaProjecao(abas, DRE, 2025, REAL);
    expect(l.anos).toBe(2);
    expect(l.valores.despesas_administrativas).toEqual([300_000, null, null, null, null]);
    expect(l.valores.receita_liquida).toBeUndefined();
    expect(l.inflacao).toEqual([5, 6]);
    expect(l.base).toEqual({});
    expect(l.erros).toEqual(['Linha 8: "Linha que não existe" não é uma linha da DRE']);
  });
  it("aplicar: valor igual ao calculado não vira digitado; o que difere vira", () => {
    const l = lerPlanilhaProjecao(abas, DRE, 2025, REAL);
    const p = aplicarPlanilha(premissasIniciais(DRE, 3, 0, 0), l, DRE, 2025, REAL);
    expect(p.anos).toBe(2);
    expect(p.inflacao.slice(0, 2)).toEqual([5, 6]);
    expect(p.valores.receita_bruta.slice(0, 2)).toEqual([null, null]);
    expect(p.valores.despesas_administrativas[0]).toBe(300_000);
    const r = projetar(DRE, 2025, REAL, p);
    expect(linha(r, "despesas_administrativas").valores).toEqual([-200_000, -300_000, -318_000]);
  });
  it("sem cabeçalho avisa para usar o modelo", () => {
    expect(lerPlanilhaProjecao({ x: [["a", "b"]] }, DRE, 2025, REAL).erros[0]).toMatch(/Baixar modelo/);
  });
});
