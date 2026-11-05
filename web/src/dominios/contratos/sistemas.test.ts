import { describe, expect, it } from "vitest";
import { mesCurto, participacao, totaisSistemas } from "./sistemas";
import type { LinhaReceitaSistema } from "./tipos";

const linha = (p: Partial<LinhaReceitaSistema>): LinhaReceitaSistema => ({
  sistema: "s",
  nome: "EXato",
  descricao: null,
  ativo: true,
  contratos: 0,
  suspensos: 0,
  clientes: 0,
  mensal: 0,
  faturado: 0,
  recebido: 0,
  atraso: 0,
  novos: 0,
  encerrados: 0,
  previsto: 0,
  por_mes: [],
  ...p,
});

describe("totaisSistemas", () => {
  it("soma os sistemas, mês a mês, sem erro de centavos", () => {
    const t = totaisSistemas([
      linha({ contratos: 2, clientes: 2, mensal: 0.1, faturado: 100, recebido: 50, atraso: 10, previsto: 1200, novos: 1, por_mes: [1, 2] }),
      linha({ contratos: 1, clientes: 1, mensal: 0.2, faturado: 30, recebido: 30, encerrados: 1, previsto: 360, por_mes: [3, 4] }),
    ]);
    expect(t).toMatchObject({ contratos: 3, clientes: 3, mensal: 0.3, faturado: 130, recebido: 80, atraso: 10, previsto: 1560, novos: 1, encerrados: 1 });
    expect(t.porMes).toEqual([4, 6]);
  });
  it("sem linhas, tudo zero", () => {
    expect(totaisSistemas([])).toMatchObject({ mensal: 0, porMes: [] });
  });
});

describe("participacao", () => {
  it("percentual com uma casa", () => expect(participacao(1, 3)).toBe(33.3));
  it("sem receita total, zero", () => expect(participacao(10, 0)).toBe(0));
});

describe("mesCurto", () => {
  it("mês e ano curtos", () => expect(mesCurto("2029-06-01")).toBe("jun/29"));
});
