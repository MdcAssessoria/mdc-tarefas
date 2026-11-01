import { describe, expect, it } from "vitest";
import { combinarLinhas } from "./linhasPeriodo";
import type { Linha } from "./balancete/tipos";

const conta = (classificacao: string, sa: number, d: number, c: number, s: number, descricao = "Conta"): Linha => ({
  codigo: null,
  classificacao,
  descricao,
  nivel: 3,
  analitica: true,
  saldo_anterior: sa,
  debitos: d,
  creditos: c,
  saldo_atual: s,
  grupo: null,
});

describe("combinarLinhas", () => {
  it("um mês só volta igual", () => {
    const jan = [conta("1.1.1", 10, 5, 2, 13)];
    expect(combinarLinhas([jan])).toBe(jan);
  });

  it("abertura do primeiro mês, movimento somado e fechamento do último", () => {
    const jan = [conta("1.1.1", 100, 50, 30, 120)];
    const fev = [conta("1.1.1", 120, 40, 10, 150)];
    const mar = [conta("1.1.1", 150, 5, 55, 100, "Caixa geral")];
    const [l] = combinarLinhas([jan, fev, mar]);
    expect(l).toMatchObject({ saldo_anterior: 100, debitos: 95, creditos: 95, saldo_atual: 100, descricao: "Caixa geral" });
  });

  it("conta que surge no meio abre zerada e conta que some fecha zerada", () => {
    const jan = [conta("1.1.1", 0, 10, 0, 10), conta("3.1", 0, 0, 0, 0)];
    const fev = [conta("1.1.1", 10, 0, 10, 0), conta("2.1", 0, 0, 7, -7)];
    const r = combinarLinhas([jan, fev]);
    expect(r.map((x) => x.classificacao)).toEqual(["1.1.1", "2.1", "3.1"]);
    expect(r[1]).toMatchObject({ saldo_anterior: 0, creditos: 7, saldo_atual: -7 });
    expect(r[2]).toMatchObject({ saldo_atual: 0 });
  });

  it("soma sem erro de centavos", () => {
    const meses = [0.1, 0.2, 0.3].map((v) => [conta("4.1", 0, v, 0, v)]);
    expect(combinarLinhas(meses)[0].debitos).toBe(0.6);
  });
});
