import { describe, expect, it } from "vitest";
import { margem, montarMatriz, periodoDoBi, periodoLongo, temMovimento, totalDe } from "./relatorio";
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

describe("montarMatriz", () => {
  it("põe as contas na ordem do relatório e os meses em ordem, com total do período", () => {
    const m = montarMatriz([
      l("lucro_bruto", 60, "2026-02-01", 30, true),
      l("receita_liquida", 40, "2026-02-01", 100),
      l("receita_liquida", 40, "2026-01-01", 50.1),
      l("lucro_bruto", 60, "2026-01-01", 20.2, true),
    ]);
    expect(m.meses).toEqual(["2026-01", "2026-02"]);
    expect(m.linhas.map((x) => x.codigo)).toEqual(["receita_liquida", "lucro_bruto"]);
    expect(m.linhas[0]).toMatchObject({ valores: [50.1, 100], total: 150.1, subtotal: false });
    expect(m.linhas[1]).toMatchObject({ valores: [20.2, 30], total: 50.2, subtotal: true });
  });

  it("mês sem valor conta zero e soma sem erro de centavos", () => {
    const m = montarMatriz([l("a", 1, "2026-01-01", 0.1), l("a", 1, "2026-01-01", 0.2), l("b", 2, "2026-03-01", 5)]);
    expect(m.meses).toEqual(["2026-01", "2026-03"]);
    expect(m.linhas[0].valores).toEqual([0.3, 0]);
    expect(totalDe(m, "b")).toBe(5);
    expect(totalDe(m, "inexistente")).toBe(0);
  });

  it("sem linhas: matriz vazia e sem movimento", () => {
    const m = montarMatriz([]);
    expect(m).toEqual({ meses: [], linhas: [] });
    expect(temMovimento(m)).toBe(false);
    expect(temMovimento(montarMatriz([l("a", 1, "2026-01-01", 0)]))).toBe(false);
    expect(temMovimento(montarMatriz([l("a", 1, "2026-01-01", -3)]))).toBe(true);
  });
});

describe("periodoDoBi", () => {
  const hoje = "2026-11-19";
  it("este ano e mês passado viram datas fechadas", () => {
    expect(periodoDoBi("ano", hoje)).toEqual({ de: "2026-01-01", ate: "2026-12-31" });
    expect(periodoDoBi("anterior", hoje)).toEqual({ de: "2026-10-01", ate: "2026-10-31" });
  });
  it("tudo vira os últimos 3 anos até o fim do mês, dentro do limite do banco", () => {
    const p = periodoDoBi("tudo", hoje);
    expect(p).toEqual({ de: "2024-01-01", ate: "2026-11-30" });
    expect(periodoLongo(p.de, p.ate)).toBe(false);
  });
  it("datas trocadas são postas em ordem; em branco usam o padrão", () => {
    expect(periodoDoBi("escolher", hoje, "2026-03-31", "2025-01-01")).toEqual({ de: "2025-01-01", ate: "2026-03-31" });
    expect(periodoDoBi("escolher", hoje, "2025-06-01", "")).toEqual({ de: "2025-06-01", ate: "2026-11-30" });
  });
  it("mais de 3 anos é longo demais", () => {
    expect(periodoLongo("2020-01-01", "2026-01-01")).toBe(true);
  });
});

describe("margem", () => {
  it("resultado sobre a receita líquida; sem receita, nada", () => {
    const m = montarMatriz([l("receita_liquida", 40, "2026-01-01", 200), l("resultado_liquido", 160, "2026-01-01", 30, true)]);
    expect(margem(m, "resultado_liquido")).toBeCloseTo(0.15);
    expect(margem(montarMatriz([]), "resultado_liquido")).toBeNull();
  });
});
