// Testes das regras puras do módulo Licenças: valor proporcional, vencimento, atraso e faixas, reajuste, receita
// recorrente, gráfico e faturamento do mês; e a mensagem de cobrança do WhatsApp.
import { describe, expect, it } from "vitest";
import {
  aplicarReajuste,
  contratoVigente,
  descontoSobreTabela,
  diasDeAtraso,
  faixaDoAtraso,
  faturadoERecebido,
  faturamentoDoMes,
  inadimplenciaPorFaixa,
  inadimplentes,
  mesesAte,
  receitaRecorrente,
  reajustePendente,
  situacaoDaCobranca,
  valorDoMes,
  vencimentoDaCompetencia,
} from "./regras";
import { mensagemCobranca } from "./mensagem";
import { horaNoFuso, saudacao } from "@/lib/datas";
import type { Cobranca, Contrato } from "./tipos";

const cob = (p: Partial<Cobranca>): Cobranca => ({
  id: Math.random().toString(36).slice(2),
  org_id: "o",
  cliente_id: "c1",
  contrato_id: "k1",
  competencia: "2026-10-01",
  vencimento: "2026-10-10",
  descricao: "Licença HUB 10/2026 · Financeiro",
  valor: 100,
  situacao: "aberta",
  pago_em: null,
  valor_pago: null,
  cancelada_em: null,
  cancelado_motivo: null,
  observacao: null,
  criado_em: "2026-10-01T00:00:00Z",
  ...p,
});

const contrato = (p: Partial<Contrato>): Contrato => ({
  id: "k1",
  org_id: "o",
  cliente_id: "c1",
  plano_id: null,
  modalidade: "pacote",
  valor_tabela: 200,
  valor_mensal: 150,
  dia_vencimento: 10,
  inicio: "2025-03-15",
  fim: null,
  proporcional: false,
  reajuste_indice: "IPCA",
  reajuste_mes: 3,
  ultimo_reajuste: null,
  situacao: "ativo",
  encerrado_em: null,
  encerrado_motivo: null,
  observacao: null,
  criado_em: "2025-03-15T00:00:00Z",
  produtos: ["p1"],
  ...p,
});

describe("valor do mês", () => {
  it("cobra o mês cheio sem proporcional, mesmo começando no meio", () => {
    expect(valorDoMes(300, "2026-10-16", null, false, "2026-10-01")).toBe(300);
  });
  it("proporcional pelos dias cobertos (16 a 31 de outubro = 16 de 31 dias)", () => {
    expect(valorDoMes(300, "2026-10-16", null, true, "2026-10-01")).toBe(154.84);
  });
  it("proporcional no fim do contrato e em fevereiro", () => {
    expect(valorDoMes(280, "2025-01-01", "2026-02-14", true, "2026-02-01")).toBe(140);
  });
  it("fora da vigência é zero", () => {
    expect(valorDoMes(300, "2026-11-01", null, false, "2026-10-01")).toBe(0);
    expect(valorDoMes(300, "2026-01-01", "2026-09-30", true, "2026-10-01")).toBe(0);
  });
});

describe("vencimento", () => {
  it("usa o dia do contrato e o último dia quando o mês é mais curto", () => {
    expect(vencimentoDaCompetencia("2026-10-01", 10)).toBe("2026-10-10");
    expect(vencimentoDaCompetencia("2026-02-01", 31)).toBe("2026-02-28");
    expect(vencimentoDaCompetencia("2028-02", 30)).toBe("2028-02-29");
  });
});

describe("atraso e faixas", () => {
  it("situação exibida", () => {
    expect(situacaoDaCobranca(cob({ vencimento: "2026-10-31" }), "2026-11-01")).toBe("atrasada");
    expect(situacaoDaCobranca(cob({ vencimento: "2026-11-01" }), "2026-11-01")).toBe("vence_hoje");
    expect(situacaoDaCobranca(cob({ vencimento: "2026-11-10" }), "2026-11-01")).toBe("a_vencer");
    expect(situacaoDaCobranca(cob({ situacao: "paga" }), "2026-11-01")).toBe("paga");
  });
  it("dias de atraso só para mensalidade aberta e vencida", () => {
    expect(diasDeAtraso(cob({ vencimento: "2026-10-10" }), "2026-11-01")).toBe(22);
    expect(diasDeAtraso(cob({ vencimento: "2026-10-10", situacao: "paga" }), "2026-11-01")).toBe(0);
    expect(diasDeAtraso(cob({ vencimento: "2026-11-01" }), "2026-11-01")).toBe(0);
  });
  it("limites das faixas", () => {
    expect([0, 1, 15, 16, 30, 31, 60, 61, 90, 91, 400].map(faixaDoAtraso)).toEqual([
      null,
      "1-15",
      "1-15",
      "16-30",
      "16-30",
      "31-60",
      "31-60",
      "61-90",
      "61-90",
      "90+",
      "90+",
    ]);
  });
  it("totais por faixa contam valor, quantidade e clientes", () => {
    const l = [
      cob({ vencimento: "2026-10-25", valor: 100 }),
      cob({ vencimento: "2026-10-20", valor: 50, cliente_id: "c2" }),
      cob({ vencimento: "2026-07-01", valor: 70 }),
      cob({ vencimento: "2026-10-25", valor: 999, situacao: "paga" }),
    ];
    const f = inadimplenciaPorFaixa(l, "2026-11-01");
    expect(f.find((x) => x.faixa === "1-15")).toMatchObject({ quantidade: 2, valor: 150, clientes: 2 });
    expect(f.find((x) => x.faixa === "90+")).toMatchObject({ quantidade: 1, valor: 70, clientes: 1 });
    expect(f.find((x) => x.faixa === "31-60")).toMatchObject({ quantidade: 0, valor: 0 });
  });
  it("inadimplentes ordenados pelo maior atraso", () => {
    const l = inadimplentes(
      [cob({ vencimento: "2026-10-25" }), cob({ cliente_id: "c2", vencimento: "2026-08-10" }), cob({ vencimento: "2026-09-10" })],
      "2026-11-01",
    );
    expect(l.map((x) => x.cliente_id)).toEqual(["c2", "c1"]);
    expect(l[1]).toMatchObject({ total: 200, maiorAtraso: 52, faixa: "31-60" });
  });
});

describe("contratos e reajuste", () => {
  it("reajuste arredonda centavos", () => {
    expect(aplicarReajuste(300, 4.5)).toBe(313.5);
    expect(aplicarReajuste(149.9, 4.62)).toBe(156.83);
  });
  it("reajuste pendente só depois de 12 meses e uma vez por ano", () => {
    expect(reajustePendente(contrato({}), "2026-03-02")).toBe("2026-03-01");
    expect(reajustePendente(contrato({}), "2026-02-28")).toBeNull();
    expect(reajustePendente(contrato({ inicio: "2025-10-01" }), "2026-03-02")).toBeNull();
    expect(reajustePendente(contrato({ ultimo_reajuste: "2026-03-05" }), "2026-06-01")).toBeNull();
    expect(reajustePendente(contrato({ reajuste_indice: "nenhum" }), "2026-03-02")).toBeNull();
    expect(reajustePendente(contrato({ inicio: "2026-03-20" }), "2027-03-01")).toBe("2027-03-01");
  });
  it("receita recorrente soma só os contratos que valem hoje", () => {
    const l = [
      contrato({ valor_mensal: 150 }),
      contrato({ valor_mensal: 80, inicio: "2026-12-01" }),
      contrato({ valor_mensal: 60, situacao: "encerrado" }),
      contrato({ valor_mensal: 40, fim: "2026-10-31" }),
    ];
    expect(receitaRecorrente(l, "2026-11-01")).toBe(150);
    expect(contratoVigente(l[3], "2026-10-31")).toBe(true);
  });
  it("desconto sobre a tabela", () => {
    expect(descontoSobreTabela(200, 150)).toBe(25);
    expect(descontoSobreTabela(0, 150)).toBe(0);
    expect(descontoSobreTabela(100, 120)).toBe(0);
  });
});

describe("gráfico e faturamento", () => {
  it("meses do gráfico", () => {
    expect(mesesAte("2026-02-10", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
    expect(mesesAte("2026-12-10", 1, 1)).toEqual(["2026-12", "2027-01"]);
  });
  it("faturado e recebido por mês", () => {
    const p = faturadoERecebido(
      [cob({ competencia: "2026-10-01" }), cob({ competencia: "2026-10-01", situacao: "cancelada" })],
      [
        { data: "2026-10-12", total: 104, estornada: false },
        { data: "2026-10-13", total: 100, estornada: true },
      ],
      ["2026-10"],
    );
    expect(p).toEqual([{ mes: "2026-10", faturado: 100, recebido: 104 }]);
  });
  it("faturamento do mês: em aberto do mês + atrasados; pago só informa", () => {
    const l = faturamentoDoMes(
      [
        cob({ competencia: "2026-11-01", valor: 150 }),
        cob({ competencia: "2026-10-01", valor: 150 }),
        cob({ competencia: "2026-09-01", valor: 150, situacao: "paga" }),
        cob({ cliente_id: "c2", competencia: "2026-11-01", valor: 90, situacao: "paga" }),
        cob({ cliente_id: "c3", competencia: "2026-11-01", valor: 90, situacao: "cancelada" }),
      ],
      "2026-11",
      true,
    );
    expect(l.find((x) => x.cliente_id === "c1")).toMatchObject({ doMes: 150, atrasado: 150, total: 300 });
    expect(l.find((x) => x.cliente_id === "c2")).toMatchObject({ jaPago: 90, total: 0 });
    expect(l.some((x) => x.cliente_id === "c3")).toBe(false);
    expect(faturamentoDoMes([cob({ competencia: "2026-10-01" })], "2026-11", false)).toEqual([]);
  });
});

describe("mensagem de cobrança", () => {
  it("saudação conforme a hora", () => {
    expect([4, 5, 11, 12, 17, 18, 23].map(saudacao)).toEqual([
      "Boa noite",
      "Bom dia",
      "Bom dia",
      "Boa tarde",
      "Boa tarde",
      "Boa noite",
      "Boa noite",
    ]);
  });
  it("hora no fuso de São Paulo", () => {
    expect(horaNoFuso("America/Sao_Paulo", new Date("2026-11-01T12:30:00Z"))).toBe(9);
  });
  it("texto com as mensalidades e o total", () => {
    const t = mensagemCobranca({
      hora: 15,
      cliente: "Greencore",
      escritorio: "MDC Assessoria Contábil",
      cobrancas: [
        { competencia: "2026-10-01", vencimento: "2026-10-10", valor: 150 },
        { competencia: "2026-09-01", vencimento: "2026-09-10", valor: 150 },
      ],
    });
    expect(t.startsWith("Boa tarde!")).toBe(true);
    expect(t).toContain("• 09/2026: R$");
    expect(t.indexOf("09/2026")).toBeLessThan(t.indexOf("10/2026"));
    expect(t).toContain("Total: R$");
  });
});
