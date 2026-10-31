// Testes das regras da importação em lote (importacaoLote.ts): empresa pelo CNPJ ou código, competência e período
// do cabeçalho, situação de cada arquivo e resumo por empresa.
import { describe, expect, it } from "vitest";
import { MATRIZ_BALANCETE } from "@/dominios/demonstrativos/__testes__/balanceteExemplo";
import { lerBalancete } from "@/dominios/demonstrativos/balancete/leitura";
import { avaliarLote, competenciaDoArquivo, descreverPeriodo, identificarEmpresa, resumoPorEmpresa, vaiGravar } from "./importacaoLote";
import type { ItemLote } from "./importacaoLote";

const cab = (o: Partial<{ cnpj: string; codigoEmpresa: string; inicio: string; fim: string }>) => ({
  empresa: "X",
  cnpj: o.cnpj ?? null,
  codigoEmpresa: o.codigoEmpresa ?? null,
  inicio: o.inicio ?? null,
  fim: o.fim ?? null,
});
const CLIENTES = [
  { id: "a", cnpj: "12.345.678/0001-95", codigo_dominio: "101" },
  { id: "b", cnpj: null, codigo_dominio: "202" },
];

describe("identificar empresa, competência e período", () => {
  it("pelo CNPJ (com ou sem pontuação) e, sem CNPJ, pelo código do Domínio", () => {
    expect(identificarEmpresa(cab({ cnpj: "12345678000195" }), CLIENTES)?.id).toBe("a");
    expect(identificarEmpresa(cab({ codigoEmpresa: "202" }), CLIENTES)?.id).toBe("b");
    expect(identificarEmpresa(cab({ cnpj: "99.999.999/0001-99" }), CLIENTES)).toBeUndefined();
  });
  it("lê o cabeçalho do balancete de exemplo", () => {
    const l = lerBalancete(MATRIZ_BALANCETE);
    expect(competenciaDoArquivo(l.cabecalho)).toMatch(/^\d{4}-\d{2}$/);
  });
  it("mês ou acumulado", () => {
    expect(descreverPeriodo(cab({ inicio: "2025-03-01", fim: "2025-03-31" }))).toBe("mês");
    expect(descreverPeriodo(cab({ inicio: "2025-01-01", fim: "2025-12-31" }))).toBe("acumulado jan a dez/2025");
    expect(competenciaDoArquivo(cab({ inicio: "2025-01-01", fim: "2025-12-31" }))).toBe("2025-12");
    expect(competenciaDoArquivo(cab({}))).toBe("");
  });
});

describe("avaliarLote", () => {
  const leitura = lerBalancete(MATRIZ_BALANCETE);
  const item = (o: Partial<ItemLote>): ItemLote => ({
    chave: "k",
    arquivo: "a.xlsx",
    leitura,
    erroLeitura: null,
    clienteId: "a",
    reconhecida: true,
    competencia: "2025-03",
    substituir: false,
    ...o,
  });
  it("classifica cada arquivo e só grava os prontos", () => {
    const av = avaliarLote(
      [
        item({}),
        item({ leitura: null, erroLeitura: "Nenhuma conta encontrada no arquivo." }),
        item({ clienteId: "" }),
        item({ competencia: "" }),
        item({}), // repetido
        item({ competencia: "2025-04" }), // rascunho existente sem substituir
        item({ competencia: "2025-05", substituir: true }), // rascunho existente, substituir
        item({ competencia: "2025-06", substituir: true }), // publicado: nunca substitui
      ],
      [
        { cliente_id: "a", competencia: "2025-04-01", status: "rascunho" },
        { cliente_id: "a", competencia: "2025-05-01", status: "rascunho" },
        { cliente_id: "a", competencia: "2025-06-01", status: "publicado" },
      ],
    );
    expect(av.map((a) => a.situacao)).toEqual([
      "pronto",
      "ilegivel",
      "sem_empresa",
      "sem_competencia",
      "repetido",
      "ja_existe",
      "substitui",
      "publicado",
    ]);
    expect(av[1].motivo).toBe("Nenhuma conta encontrada no arquivo.");
    expect(av[7].motivo).toMatch(/despublique/);
    expect(av.filter(vaiGravar)).toHaveLength(2);
  });
});

describe("resumoPorEmpresa", () => {
  it("conta o que entrou e o que ficou de fora, por empresa", () => {
    const r = resumoPorEmpresa([
      { empresa: "Greencore", arquivo: "b.xlsx", competencia: "2025-02", entrou: true, motivo: "" },
      { empresa: "Greencore", arquivo: "a.xlsx", competencia: "2025-01", entrou: false, motivo: "Já publicado" },
      { empresa: "Alfa", arquivo: "c.xlsx", competencia: "2025-01", entrou: true, motivo: "" },
    ]);
    expect(r.map((x) => [x.empresa, x.entraram, x.ficaramFora])).toEqual([
      ["Alfa", 1, 0],
      ["Greencore", 1, 1],
    ]);
    expect(r[1].itens.map((i) => i.competencia)).toEqual(["2025-01", "2025-02"]);
  });
});
