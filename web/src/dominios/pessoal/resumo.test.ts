// Testa o resumo do dia do MDC · Pessoal: atrasadas, hoje, próximos 7 dias e a receber, contando só o que falta.
import { describe, expect, it } from "vitest";
import { resumoDoDia } from "./resumo";
import type { TituloResumo } from "./resumo";

const t = (id: string, tipo: "pagar" | "receber", vencimento: string, valor: number, valor_pago = 0): TituloResumo => ({
  id,
  tipo,
  descricao: id,
  vencimento,
  valor,
  valor_pago,
});

const HOJE = "2026-11-14";
const LISTA = [
  t("luz", "pagar", "2026-11-10", 180.5),
  t("escola", "pagar", "2026-11-14", 1200),
  t("cartao", "pagar", "2026-11-14", 900, 400),
  t("agua", "pagar", "2026-11-21", 90),
  t("condominio", "pagar", "2026-11-22", 700),
  t("pago", "pagar", "2026-11-15", 50, 50),
  t("salario", "receber", "2026-11-20", 8000),
  t("aluguel", "receber", "2026-12-05", 2500),
];

describe("resumo do dia", () => {
  const r = resumoDoDia(LISTA, HOJE);
  it("separa atrasadas, hoje e próximos 7 dias (até 21/11)", () => {
    expect(r.atrasadas.itens.map((x) => x.id)).toEqual(["luz"]);
    expect(r.hoje.itens.map((x) => x.id)).toEqual(["escola", "cartao"]);
    expect(r.proximos7.itens.map((x) => x.id)).toEqual(["agua"]);
  });
  it("soma só o que falta pagar (parcial conta a diferença; quitado some)", () => {
    expect(r.hoje.total).toBe(1700);
    expect(r.atrasadas.total).toBe(180.5);
  });
  it("a receber nos próximos 7 dias", () => {
    expect(r.receber7.itens.map((x) => x.id)).toEqual(["salario"]);
    expect(r.receber7.total).toBe(8000);
  });
});
