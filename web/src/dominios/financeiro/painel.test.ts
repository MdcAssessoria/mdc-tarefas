// Testes das contas do painel inicial do Financeiro.
import { describe, expect, it } from "vitest";
import {
  despesasPorCategoria,
  fluxoPrevisto,
  menorSaldo,
  primeirosPassos,
  realizadoPorMes,
  resumirPrazos,
  rotuloMes,
  saldoComTransferencias,
  saudacao,
  valorCurto,
} from "./painel";
import type { ContaBancaria, Titulo } from "./tipos";

const HOJE = "2026-11-10";
type T = Pick<Titulo, "tipo" | "vencimento" | "valor" | "valor_pago" | "situacao">;
const t = (tipo: Titulo["tipo"], vencimento: string, valor: number, valor_pago = 0, situacao: Titulo["situacao"] = "aberto"): T => ({
  tipo,
  vencimento,
  valor,
  valor_pago,
  situacao,
});

describe("resumirPrazos", () => {
  it("separa vencidos, hoje e próximos 7 dias pelo que falta pagar", () => {
    const r = resumirPrazos(
      [
        t("pagar", "2026-11-01", 1000, 400), // vencido, falta 600
        t("receber", "2026-11-09", 300), // vencido
        t("pagar", HOJE, 150),
        t("receber", HOJE, 80),
        t("receber", HOJE, 20),
        t("pagar", "2026-11-17", 500), // 7 dias: entra
        t("pagar", "2026-11-18", 999), // 8 dias: fora
        t("pagar", "2026-11-05", 50, 0, "quitado"),
        t("pagar", "2026-11-05", 70, 0, "cancelado"),
      ],
      HOJE,
    );
    expect(r.vencidos.pagar).toEqual({ valor: 600, qtd: 1 });
    expect(r.vencidos.receber).toEqual({ valor: 300, qtd: 1 });
    expect(r.hoje.pagar).toEqual({ valor: 150, qtd: 1 });
    expect(r.hoje.receber).toEqual({ valor: 100, qtd: 2 });
    expect(r.semana.pagar).toEqual({ valor: 500, qtd: 1 });
    expect(r.semana.receber).toEqual({ valor: 0, qtd: 0 });
  });
});

describe("fluxoPrevisto", () => {
  it("parte do saldo atual e acumula entradas e saídas dia a dia", () => {
    const f = fluxoPrevisto(1000, [t("receber", "2026-11-11", 500), t("pagar", "2026-11-12", 2000, 500)], HOJE, 5);
    expect(f.map((d) => d.data)).toEqual(["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14"]);
    expect(f.map((d) => d.saldo)).toEqual([1000, 1500, 0, 0, 0]);
    expect(f[2]).toEqual({ data: "2026-11-12", entra: 0, sai: 1500, saldo: 0 });
  });

  it("joga o vencido para hoje e ignora o que vence depois do período, quitado e cancelado", () => {
    const f = fluxoPrevisto(
      0,
      [
        t("pagar", "2026-10-01", 300),
        t("receber", "2026-11-05", 100),
        t("pagar", "2026-12-31", 9999),
        t("pagar", HOJE, 50, 50, "quitado"),
        t("receber", HOJE, 70, 0, "cancelado"),
      ],
      HOJE,
      30,
    );
    expect(f).toHaveLength(30);
    expect(f[0]).toEqual({ data: HOJE, entra: 100, sai: 300, saldo: -200 });
    expect(f.at(-1)?.saldo).toBe(-200);
  });

  it("menorSaldo acha o pior dia", () => {
    const f = fluxoPrevisto(100, [t("pagar", "2026-11-11", 300), t("receber", "2026-11-12", 1000)], HOJE, 4);
    expect(menorSaldo(f)).toEqual({ data: "2026-11-11", entra: 0, sai: 300, saldo: -200 });
    expect(menorSaldo([])).toBeNull();
  });

  it("não acumula erro de centavos", () => {
    const titulos = Array.from({ length: 10 }, () => t("pagar", HOJE, 0.1));
    expect(fluxoPrevisto(0, titulos, HOJE, 1)[0].saldo).toBe(-1);
  });
});

const baixa = (titulo_id: string, data: string, valor: number, extra: { juros?: number; multa?: number; desconto?: number; estornada?: boolean } = {}) => {
  const juros = extra.juros ?? 0;
  const multa = extra.multa ?? 0;
  const desconto = extra.desconto ?? 0;
  return { titulo_id, data, valor, juros, multa, desconto, total: valor + juros + multa - desconto, estornada: !!extra.estornada };
};

describe("realizadoPorMes", () => {
  it("monta os últimos 6 meses (o atual incluído) pelo total que passou no banco", () => {
    const tipos = new Map<string, Titulo["tipo"]>([
      ["p", "pagar"],
      ["r", "receber"],
    ]);
    const m = realizadoPorMes(
      [
        baixa("r", "2026-11-02", 1000),
        baixa("p", "2026-11-03", 400, { juros: 10, multa: 5, desconto: 15 }),
        baixa("p", "2026-06-30", 70),
        baixa("p", "2026-05-31", 999), // fora da janela
        baixa("r", "2026-11-04", 500, { estornada: true }),
        baixa("x", "2026-11-04", 500), // título desconhecido
      ],
      tipos,
      HOJE,
    );
    expect(m.map((x) => x.mes)).toEqual(["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
    expect(m[0]).toEqual({ mes: "2026-06", entrou: 0, saiu: 70 });
    expect(m[5]).toEqual({ mes: "2026-11", entrou: 1000, saiu: 400 });
  });

  it("vira o ano", () => {
    expect(realizadoPorMes([], new Map(), "2027-02-01", 4).map((x) => x.mes)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
  });
});

describe("despesasPorCategoria", () => {
  const titulos = new Map([
    ["a", { tipo: "pagar" as const, categoria_id: "aluguel" }],
    ["b", { tipo: "pagar" as const, categoria_id: "luz" }],
    ["c", { tipo: "receber" as const, categoria_id: "vendas" }],
    ["d", { tipo: "pagar" as const, categoria_id: "sumiu" }],
  ]);
  const categorias = new Map([
    ["aluguel", { nome: "Aluguel" }],
    ["luz", { nome: "Energia" }],
  ]);

  it("soma o valor por categoria, separa juros e multa, ignora recebimentos, outros meses e estornos", () => {
    const r = despesasPorCategoria(
      [
        baixa("a", "2026-11-05", 2500, { juros: 20, multa: 30 }),
        baixa("b", "2026-11-06", 300),
        baixa("b", "2026-11-07", 200),
        baixa("c", "2026-11-07", 9000),
        baixa("a", "2026-10-05", 2500),
        baixa("b", "2026-11-08", 100, { estornada: true }),
        baixa("d", "2026-11-09", 10),
      ],
      titulos,
      categorias,
      "2026-11",
    );
    expect(r).toEqual([
      { id: "aluguel", nome: "Aluguel", valor: 2500 },
      { id: "luz", nome: "Energia", valor: 500 },
      { id: "_juros_pagos", nome: "Juros e multas pagos", valor: 50 },
      { id: "sumiu", nome: "Sem categoria", valor: 10 },
    ]);
  });

  it("junta o que passa do limite em Outras", () => {
    const r = despesasPorCategoria(
      [baixa("a", "2026-11-05", 300), baixa("b", "2026-11-05", 200), baixa("d", "2026-11-05", 100)],
      titulos,
      categorias,
      "2026-11",
      1,
    );
    expect(r).toEqual([
      { id: "aluguel", nome: "Aluguel", valor: 300 },
      { id: "_outras", nome: "Outras", valor: 300 },
    ]);
  });
});

describe("primeiros passos e textos", () => {
  it("marca o que já foi feito, na ordem plano → banco → categorias → lançar", () => {
    expect(primeirosPassos({ plano: 10, bancos: 0, categorias: 2, titulos: 0 })).toEqual([
      { id: "plano", feito: true },
      { id: "banco", feito: false },
      { id: "categorias", feito: true },
      { id: "lancar", feito: false },
    ]);
  });

  it("saudação pela hora", () => {
    expect(saudacao(8)).toBe("Bom dia");
    expect(saudacao(12)).toBe("Boa tarde");
    expect(saudacao(18)).toBe("Boa noite");
  });

  it("valor curto e rótulo do mês", () => {
    expect(valorCurto(850)).toBe("850");
    expect(valorCurto(1500)).toBe("1,5 mil");
    expect(valorCurto(12000)).toBe("12 mil");
    expect(valorCurto(-2_300_000)).toBe("-2,3 mi");
    expect(rotuloMes("2026-11")).toBe("nov/26");
  });
});

describe("saldoComTransferencias", () => {
  const conta = (id: string, saldo_inicial_em: string | null): ContaBancaria => ({
    id,
    org_id: "o",
    cliente_id: "c",
    nome: id,
    banco: null,
    agencia: null,
    numero: null,
    conta_contabil_id: null,
    saldo_inicial: 1000,
    saldo_inicial_em,
    ativo: true,
  });
  const tr = (origem_id: string, destino_id: string, data: string, valor: number, estornada = false) => ({
    origem_id,
    destino_id,
    data,
    valor,
    estornada,
  });

  it("conta só as transferências depois do último dia importado do extrato", () => {
    const linhas = [
      { conta_id: "a", data: "2026-11-05", valor: 200 },
      { conta_id: "b", data: "2026-11-09", valor: 50 },
    ];
    const ts = [
      tr("a", "b", "2026-11-05", 300), // já no extrato de A (mesmo dia do último lançamento)
      tr("a", "b", "2026-11-06", 100), // depois do extrato de A, antes do de B
      tr("b", "a", "2026-11-10", 40),
      tr("a", "b", "2026-11-11", 999, true), // estornada
    ];
    expect(saldoComTransferencias(conta("a", "2026-11-01"), linhas, ts)).toBe(1000 + 200 - 100 + 40);
    expect(saldoComTransferencias(conta("b", "2026-11-01"), linhas, ts)).toBe(1000 + 50 - 40);
  });

  it("sem extrato usa a data do saldo inicial; sem ela, conta todas", () => {
    const ts = [tr("a", "b", "2026-10-01", 10), tr("a", "b", "2026-11-02", 20)];
    expect(saldoComTransferencias(conta("a", "2026-11-01"), [], ts)).toBe(980);
    expect(saldoComTransferencias(conta("a", null), [], ts)).toBe(970);
  });
});
