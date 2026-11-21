// Testes dos saldos dos bancos (saldos.ts).
import { describe, expect, it } from "vitest";
import { mesesDoPeriodo, mesesIncompletos, resumirSaldos } from "./saldos";
import type { SaldoBanco } from "./saldos";

const s = (conta: string, mes: string, ant: number, fim: number, empresa = "A"): SaldoBanco => ({
  empresa,
  conta_corrente: conta,
  descricao: `Banco ${conta}`,
  mes: `${mes}-01`,
  saldo_anterior: ant,
  saldo_final: fim,
  atualizado_em: "2026-11-20T00:00:00Z",
});

describe("resumirSaldos", () => {
  it("saldo inicial do primeiro mês, final do último e diferença para o DFC", () => {
    const r = resumirSaldos(
      [s("1", "2026-01", 100, 150), s("1", "2026-02", 150, 120), s("2", "2026-01", 50, 60), s("2", "2026-02", 60, 80)],
      ["2026-01", "2026-02"],
      45,
    )!;
    expect(r).toMatchObject({ inicial: 150, final: 200, variacaoBanco: 50, diferenca: 5, incompleto: false, finalUltimoMes: 200 });
  });
  it("conta sem todos os meses fica marcada como incompleta", () => {
    const r = resumirSaldos([s("1", "2026-02", 10, 20)], ["2026-01", "2026-02"], null)!;
    expect(r.incompleto).toBe(true);
    expect(r.diferenca).toBeNull();
    expect(r.inicial).toBe(10);
  });
  it("sem o último mês de alguma conta, não há saldo final confiável", () => {
    const r = resumirSaldos([s("1", "2026-01", 10, 20), s("2", "2026-01", 5, 5), s("2", "2026-02", 5, 9)], ["2026-01", "2026-02"], null)!;
    expect(r.finalUltimoMes).toBeNull();
  });
  it("sem saldos não há resumo", () => expect(resumirSaldos([], ["2026-01"], 0)).toBeNull());
});

describe("mesesDoPeriodo", () => {
  it("atravessa a virada do ano", () =>
    expect(mesesDoPeriodo("2025-11-15", "2026-02-28")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]));
});

describe("mesesIncompletos", () => {
  const s = (conta: string, mes: string) => ({
    empresa: "A",
    conta_corrente: conta,
    descricao: null,
    mes,
    saldo_anterior: 0,
    saldo_final: 0,
    atualizado_em: "",
  });
  it("conta o mês em que falta alguma conta", () => {
    expect(mesesIncompletos([s("1", "2026-01-01"), s("2", "2026-01-01"), s("1", "2026-02-01")], ["2026-01", "2026-02", "2026-03"])).toBe(2);
  });
  it("sem saldo nenhum, todos os meses", () => {
    expect(mesesIncompletos([], ["2026-01", "2026-02"])).toBe(2);
  });
});
