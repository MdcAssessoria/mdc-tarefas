import { describe, expect, it } from "vitest";
import {
  acumulado,
  proximoReajuste,
  reajustePendente,
  terminaEm,
  textoReajuste,
  textoVigencia,
  valeNoMes,
  valorReajustado,
  vencimentoNoMes,
} from "./regras";
import type { Recorrente } from "./tipos";

const base: Recorrente = {
  id: "k1",
  org_id: "o",
  cliente_id: "c",
  tipo: "pagar",
  pessoa_id: "p",
  descricao: "Aluguel",
  numero: null,
  objeto: null,
  vigencia_inicio: "2025-03-01",
  vigencia_fim: null,
  renovacao_automatica: false,
  aviso_dias: 30,
  gera_contas: true,
  valor: 2500,
  dia_vencimento: 10,
  categoria_id: "cat",
  centro_id: null,
  conta_prevista_id: null,
  inicio: "2025-03-01",
  gerar_desde: "2026-11-01",
  fim: null,
  indice: "IPCA",
  percentual_fixo: null,
  mes_reajuste: 3,
  situacao: "ativo",
  situacao_motivo: null,
  situacao_em: null,
  encerrado_em: null,
  ultima_competencia: "2026-11-01",
  mes_cadastro: "2026-11-01",
  observacao: null,
  criado_em: "2026-11-02T10:00:00Z",
  documento: "fatura",
  envio: "fatura",
  dia_geracao: 1,
  canais: [],
  email_envio: null,
  whatsapp_envio: null,
  cliente_carteira_id: null,
  servico_descricao: null,
  servico_codigo: null,
  iss_aliquota: null,
  boleto_banco: null,
  renovacao_meses: 12,
  sistema_id: null,
};

describe("vencimento no mês", () => {
  it("usa o dia do contrato e o último dia quando o mês é curto", () => {
    expect(vencimentoNoMes("2026-11", 10)).toBe("2026-11-10");
    expect(vencimentoNoMes("2027-02-01", 31)).toBe("2027-02-28");
    expect(vencimentoNoMes("2028-02", 31)).toBe("2028-02-29");
    expect(vencimentoNoMes("2027-04", 31)).toBe("2027-04-30");
    expect(vencimentoNoMes("2027-02", 30)).toBe("2027-02-28");
  });
});

describe("contrato vale no mês", () => {
  it("só ativo, depois da primeira conta e até o fim", () => {
    expect(valeNoMes(base, "2026-10")).toBe(false);
    expect(valeNoMes(base, "2026-11")).toBe(true);
    expect(valeNoMes({ ...base, fim: "2026-12-01" }, "2027-01")).toBe(false);
    expect(valeNoMes({ ...base, situacao: "suspenso" }, "2026-12")).toBe(false);
  });
});

describe("reajuste pendente", () => {
  it("o ciclo em que o contrato entrou no HUB não fica pendente (o valor informado já é o atual)", () => {
    expect(reajustePendente(base, [], "2026-11-02")).toBeNull();
  });
  it("chega no mês do reajuste e continua até ser confirmado", () => {
    expect(reajustePendente(base, [], "2027-03-01")).toBe("2027-03-01");
    expect(reajustePendente(base, [], "2027-08-15")).toBe("2027-03-01");
    const feito = [{ recorrente_id: "k1", origem: "reajuste" as const, referencia: "2027-03-01" }];
    expect(reajustePendente(base, feito, "2027-04-01")).toBeNull();
    // edição de valor não conta como reajuste do ciclo
    expect(reajustePendente(base, [{ recorrente_id: "k1", origem: "edicao", referencia: null }], "2027-04-01")).toBe("2027-03-01");
  });
  it("precisa de 12 meses de contrato", () => {
    const novo = { ...base, inicio: "2026-11-01", mes_reajuste: 11, mes_cadastro: "2026-10-01" };
    expect(reajustePendente(novo, [], "2027-03-01")).toBeNull();
    expect(reajustePendente(novo, [], "2027-11-03")).toBe("2027-11-01");
  });
  it("sem reajuste, suspenso ou encerrado nunca fica pendente", () => {
    expect(reajustePendente({ ...base, indice: "nenhum", mes_reajuste: null }, [], "2027-03-01")).toBeNull();
    expect(reajustePendente({ ...base, situacao: "suspenso" }, [], "2027-03-01")).toBeNull();
  });
  it("próximo reajuste: o pendente ou o próximo aniversário", () => {
    expect(proximoReajuste(base, [], "2026-11-02")).toBe("2027-03-01");
    expect(proximoReajuste(base, [], "2027-03-10")).toBe("2027-03-01");
    expect(proximoReajuste(base, [{ recorrente_id: "k1", origem: "reajuste", referencia: "2027-03-01" }], "2027-03-10")).toBe("2028-03-01");
    expect(proximoReajuste({ ...base, indice: "nenhum" }, [], "2026-11-02")).toBeNull();
  });
});

describe("acumulado e valor reajustado", () => {
  it("multiplica (1 + %/100) e devolve em % com 4 casas", () => {
    expect(acumulado([0.5, 0.5])).toBe(1.0025);
    expect(acumulado(Array(12).fill(0.5))).toBe(6.1678);
    // mesmo exemplo do teste SQL (IPCA 03/2026–02/2027 com fevereiro revisado)
    expect(acumulado([0.56, 0.43, 0.26, 0.24, 0.38, -0.02, 0.44, 0.56, 0.39, 0.52, 0.16, 1.31])).toBe(5.3512);
  });
  it("arredonda o valor novo em centavos", () => {
    expect(valorReajustado(2500, 5.3512)).toBe(2633.78);
    expect(valorReajustado(1200, 5)).toBe(1260);
  });
});

describe("textos e prazos", () => {
  it("descreve o reajuste para a lista", () => {
    expect(textoReajuste(base)).toBe("IPCA em março");
    expect(textoReajuste({ indice: "fixo", percentual_fixo: 5.5, mes_reajuste: 11 })).toBe("5,5% fixo em novembro");
    expect(textoReajuste({ indice: "nenhum", percentual_fixo: null, mes_reajuste: null })).toBe("Sem reajuste");
  });
  it("termina nos próximos 30 dias", () => {
    expect(terminaEm({ situacao: "ativo", vigencia_fim: "2026-11-30" }, "2026-11-02")).toBe(true);
    expect(terminaEm({ situacao: "ativo", vigencia_fim: "2026-12-02" }, "2026-11-02")).toBe(true);
    expect(terminaEm({ situacao: "ativo", vigencia_fim: "2027-01-01" }, "2026-11-02")).toBe(false);
    expect(terminaEm({ situacao: "ativo", vigencia_fim: "2026-10-31" }, "2026-11-02")).toBe(false);
    expect(terminaEm({ situacao: "encerrado", vigencia_fim: "2026-11-30" }, "2026-11-02")).toBe(false);
    expect(terminaEm({ situacao: "ativo", vigencia_fim: null }, "2026-11-02")).toBe(false);
  });
  it("descreve a vigência", () => {
    expect(textoVigencia({ vigencia_inicio: "2025-03-01", vigencia_fim: null, renovacao_automatica: false })).toBe(
      "desde 01/03/2025 · prazo indeterminado",
    );
    expect(textoVigencia({ vigencia_inicio: "2025-03-01", vigencia_fim: "2027-02-28", renovacao_automatica: true })).toBe(
      "01/03/2025 a 28/02/2027 (renova sozinho)",
    );
  });
});
