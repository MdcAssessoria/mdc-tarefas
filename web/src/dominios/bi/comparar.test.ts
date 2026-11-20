import { describe, expect, it } from "vitest";
import {
  analiseVertical,
  compararMatrizes,
  fmtVariacao,
  matrizPorEmpresas,
  mesesInteiros,
  periodoComparado,
  serie,
  somarMeses,
} from "./comparar";
import { montarMatriz } from "./relatorio";
import type { LinhaBanco } from "./relatorio";

const l = (codigo: string, ordem: number, competencia: string, valor: number, subtotal = false): LinhaBanco => ({
  codigo,
  nome: codigo,
  ordem,
  subtotal,
  natureza: null,
  competencia,
  valor,
});

describe("períodos de comparação", () => {
  it("reconhece meses inteiros", () => {
    expect(mesesInteiros("2026-01-01", "2026-12-31")).toBe(12);
    expect(mesesInteiros("2026-02-01", "2026-02-28")).toBe(1);
    expect(mesesInteiros("2026-01-05", "2026-01-31")).toBeNull();
  });
  it("soma meses segurando o fim do mês", () => {
    expect(somarMeses("2026-03-31", -1)).toBe("2026-02-28");
    expect(somarMeses("2024-02-29", -12)).toBe("2023-02-28");
    expect(somarMeses("2026-02-28", -12, true)).toBe("2025-02-28");
    expect(somarMeses("2025-02-28", 12, true)).toBe("2026-02-28");
  });
  it("período anterior com o mesmo tamanho", () => {
    expect(periodoComparado("2026-01-01", "2026-12-31", "anterior")).toEqual({ de: "2025-01-01", ate: "2025-12-31" });
    expect(periodoComparado("2026-03-01", "2026-03-31", "anterior")).toEqual({ de: "2026-02-01", ate: "2026-02-28" });
    expect(periodoComparado("2026-01-11", "2026-01-20", "anterior")).toEqual({ de: "2026-01-01", ate: "2026-01-10" });
  });
  it("mesmo período do ano passado e orçamento", () => {
    expect(periodoComparado("2026-01-01", "2026-11-30", "ano_passado")).toEqual({ de: "2025-01-01", ate: "2025-11-30" });
    expect(periodoComparado("2024-02-01", "2024-02-29", "ano_passado")).toEqual({ de: "2023-02-01", ate: "2023-02-28" });
    expect(periodoComparado("2026-01-01", "2026-06-30", "orcado")).toEqual({ de: "2026-01-01", ate: "2026-06-30" });
  });
});

describe("compararMatrizes", () => {
  it("diferença e variação linha a linha; base zero sem variação", () => {
    const atual = montarMatriz([l("receita", 10, "2026-01-01", 120), l("despesa", 20, "2026-01-01", -50), l("nova", 30, "2026-01-01", 5)]);
    const base = montarMatriz([l("receita", 10, "2025-01-01", 100), l("despesa", 20, "2025-01-01", -40), l("antiga", 40, "2025-01-01", 7)]);
    const c = compararMatrizes(atual, base);
    expect(c.map((x) => x.codigo)).toEqual(["receita", "despesa", "nova", "antiga"]);
    expect(c[0]).toMatchObject({ atual: 120, base: 100, diferenca: 20 });
    expect(c[0].variacao).toBeCloseTo(0.2);
    expect(c[1]).toMatchObject({ diferenca: -10 });
    expect(c[1].variacao).toBeCloseTo(-0.25);
    expect(c[2].variacao).toBeNull();
    expect(c[3]).toMatchObject({ atual: 0, base: 7, diferenca: -7 });
  });
});

describe("análise vertical, empresas e série", () => {
  const m = montarMatriz([
    l("receita_liquida", 40, "2026-01-01", 200),
    l("receita_liquida", 40, "2026-02-01", 300),
    l("resultado_liquido", 160, "2026-02-01", 50, true),
  ]);
  it("fração da receita líquida", () => {
    const v = analiseVertical(m);
    expect(v.get("receita_liquida")).toBe(1);
    expect(v.get("resultado_liquido")).toBeCloseTo(0.1);
    expect(analiseVertical(montarMatriz([l("x", 1, "2026-01-01", 5)])).get("x")).toBeNull();
  });
  it("uma coluna por empresa, soma, eliminações e consolidado", () => {
    const a = montarMatriz([l("receita", 1, "2026-01-01", 100)]);
    const b = montarMatriz([l("receita", 1, "2026-01-01", 60)]);
    const cons = montarMatriz([l("receita", 1, "2026-01-01", 140)]);
    expect(matrizPorEmpresas([a, b], cons)).toEqual([
      { codigo: "receita", nome: "receita", subtotal: false, valores: [100, 60], soma: 160, eliminacoes: -20, consolidado: 140 },
    ]);
  });
  it("série mensal alinhada aos meses pedidos", () => {
    expect(serie(m, "resultado_liquido")).toEqual([0, 50]);
    expect(serie(m, "inexistente", ["2026-01", "2026-03"])).toEqual([0, 0]);
  });
  it("formata a variação", () => {
    expect(fmtVariacao(0.125)).toBe("+12,5%");
    expect(fmtVariacao(-0.03)).toBe("−3,0%");
    expect(fmtVariacao(null)).toBe("—");
  });
});
