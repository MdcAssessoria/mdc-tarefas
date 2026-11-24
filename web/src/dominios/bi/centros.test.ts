// Testes do centro de custo do BI (117).
import { describe, expect, it } from "vitest";
import { coberturaCentros, filtrarCentros, matrizDosCentros, resumirCentros, SEM_CENTRO } from "./centros";
import type { LinhaCentroBanco, LinhaEstrutura } from "./centros";

const dados: LinhaCentroBanco[] = [
  { centro: "", centro_nome: "Sem centro de custo", linha: "receita_bruta", competencia: "2026-01-01", valor: "1000" },
  { centro: "U1", centro_nome: "Usinagem", linha: "custos", competencia: "2026-01-01", valor: -300 },
  { centro: "U1", centro_nome: "Usinagem", linha: "custos", competencia: "2026-02-01", valor: -100.1 },
  { centro: "AD", centro_nome: "Administrativo", linha: "despesas_administrativas", competencia: "2026-02-01", valor: -50 },
];
const estrutura: LinhaEstrutura[] = [
  { codigo: "receita_bruta", nome: "Receita bruta", ordem: 10, natureza: "R", soma: null },
  { codigo: "custos", nome: "(−) Custos", ordem: 20, natureza: "P", soma: null },
  { codigo: "lucro_bruto", nome: "Lucro bruto", ordem: 30, natureza: null, soma: ["receita_bruta", "custos"] },
  { codigo: "despesas_administrativas", nome: "(−) Despesas administrativas", ordem: 40, natureza: "P", soma: null },
  { codigo: "resultado", nome: "Resultado", ordem: 50, natureza: null, soma: ["lucro_bruto", "despesas_administrativas"] },
];
const meses = ["2026-01", "2026-02"];

describe("resumirCentros", () => {
  it("soma entradas, saídas e resultado; sem centro por último", () => {
    const r = resumirCentros(dados);
    expect(r.map((c) => c.centro)).toEqual(["U1", "AD", SEM_CENTRO]);
    expect(r[0]).toMatchObject({ nome: "Usinagem", entradas: 0, saidas: -400.1, resultado: -400.1 });
    expect(r[2].resultado).toBe(1000);
  });
  it("busca pelo nome sem acento e pelo código", () => {
    const r = resumirCentros(dados);
    expect(filtrarCentros(r, "usinag").map((c) => c.centro)).toEqual(["U1"]);
    expect(filtrarCentros(r, "ad").map((c) => c.centro)).toEqual(["AD"]);
    expect(filtrarCentros(r, "")).toHaveLength(3);
  });
  it("cobertura pelo volume com centro", () => {
    expect(coberturaCentros(resumirCentros(dados))).toBeCloseTo(450.1 / 1450.1, 6);
    expect(coberturaCentros([])).toBe(0);
  });
});

describe("matrizDosCentros", () => {
  it("todos os centros: subtotais pela árvore e linhas sem valor fora", () => {
    const m = matrizDosCentros(dados, estrutura, meses, null);
    expect(m.find((l) => l.codigo === "lucro_bruto")?.valores).toEqual([700, -100.1]);
    expect(m.find((l) => l.codigo === "resultado")?.total).toBe(549.9);
  });
  it("um centro só", () => {
    const m = matrizDosCentros(dados, estrutura, meses, new Set(["U1"]));
    expect(m.map((l) => l.codigo)).toEqual(["custos", "lucro_bruto", "resultado"]);
    expect(m.find((l) => l.codigo === "resultado")?.total).toBe(-400.1);
  });
  it("busca de conta mostra só as contas com o texto, sem subtotais", () => {
    const m = matrizDosCentros(dados, estrutura, meses, null, "administr");
    expect(m.map((l) => l.codigo)).toEqual(["despesas_administrativas"]);
  });
  it("mês fora do período não entra", () => {
    const m = matrizDosCentros([{ ...dados[1], competencia: "2025-12-01" }], estrutura, meses, null);
    expect(m.find((l) => l.codigo === "custos")).toBeUndefined();
  });
});
