// Testes do rascunho do parecer gerencial do BI (parecer.ts).
import { describe, expect, it } from "vitest";
import { conciliar } from "./conciliacao";
import type { ContaBanco } from "./detalhe";
import type { Indicadores } from "./indicadores";
import { indicadoresGestao } from "./indicadoresGestao";
import { maioresGastos, rascunhoParecerBi } from "./parecer";
import { montarMatriz } from "./relatorio";
import type { LinhaBanco } from "./relatorio";

const l = (codigo: string, valor: number): LinhaBanco => ({
  codigo,
  nome: codigo,
  ordem: 1,
  subtotal: false,
  natureza: null,
  competencia: "2026-01-01",
  valor,
});
const c = (linha: string, conta: string | null, nome: string, valor: number): ContaBanco => ({
  linha,
  conta,
  nome,
  ordem: 1,
  competencia: "2026-01-01",
  valor,
});

const dre = montarMatriz([
  l("receita_bruta", 1300),
  l("deducoes", -100),
  l("receita_liquida", 1200),
  l("custos", -480),
  l("despesas_pessoal", -300),
  l("despesas_administrativas", -120),
  l("despesas_comerciais", -60),
  l("resultado_operacional", 240),
  l("despesas_financeiras", -200),
  l("resultado_liquido", 40),
  l("nao_classificado", -15),
]);
const dfc = montarMatriz([l("fluxo_operacional", 100), l("pag_fornecedores", -400), l("variacao_caixa", -50)]);
const ind: Indicadores = {
  corte: "2026-01-31",
  pmr: 40,
  pmp: 25,
  receber: { aberto: 1000, vencido: 200 },
  pagar: { aberto: 500, vencido: 0 },
  clientes_total: 0,
  clientes: [],
  fornecedores_total: 0,
  fornecedores: [],
  liquidez: [],
};

describe("maioresGastos", () => {
  it("soma por conta, só custos e despesas, do maior para o menor", () => {
    const r = maioresGastos([
      c("custos", "5.1.01", "MP", -400),
      c("custos", "5.1.01", "MP", -80),
      c("despesas_pessoal", "6.1.01", "Salários", -300),
      c("receita_bruta", "3.1.01", "Venda", 1300),
    ]);
    expect(r).toEqual([
      { nome: "5.1.01 MP", valor: 480 },
      { nome: "6.1.01 Salários", valor: 300 },
    ]);
  });
});

describe("rascunhoParecerBi", () => {
  const texto = rascunhoParecerBi({
    quem: "Grupo Teste",
    periodo: "01/01/2026 a 31/01/2026",
    elimina: true,
    dre,
    dfc,
    dreAnterior: null,
    contasDre: [c("custos", "5.1.01", "MP", -480)],
    conc: conciliar([c("x", "3.1.01", "", 100000)], [c("x", "3.1.01", "", 60000)]),
    saldos: null,
    ind,
    gestao: indicadoresGestao(dre, dfc, -10, 1),
    mesesSemExtrato: 2,
    contador: "",
    crc: "",
  });
  it("traz as seções, a base normativa e o quadro em linguagem simples", () => {
    expect(texto).toContain("# Parecer gerencial — 01/01/2026 a 31/01/2026");
    expect(texto).toContain("NBC TG 03");
    expect(texto).toContain("Resolução CVM nº 156/2022");
    expect(texto).toContain("> **Em linguagem simples:**");
  });
  it("aponta juros, fôlego, inadimplência, não classificado e a variação do resultado × caixa", () => {
    expect(texto).toContain("Cobertura de juros de 1,2×");
    expect(texto).toContain("Fôlego de caixa de");
    expect(texto).toContain("Inadimplência de 20%");
    expect(texto).toContain('estão em "Não classificado"');
    expect(texto).toContain("Vendas e serviços: entrou menos");
  });
  it("pede revisão do que falta: extrato e assinatura", () => {
    expect(texto).toContain("[Revisar: 2 mês(es) do período ainda sem o extrato");
    expect(texto).toContain("[Revisar: nome do contador]");
  });
});

describe("formato", () => {
  it("não escreve R$ 0 negativo nem dias com ponto", () => {
    const t = rascunhoParecerBi({
      quem: "X",
      periodo: "jan",
      elimina: false,
      dre,
      dfc,
      dreAnterior: null,
      contasDre: [],
      conc: conciliar([], []),
      saldos: null,
      ind: { ...ind, pmr: 27.5 },
      gestao: indicadoresGestao(dre, dfc, null, 1),
      mesesSemExtrato: 0,
      contador: "Fulano",
      crc: "1SP000000/O-0",
    });
    expect(t).not.toMatch(/-R\$\s?0\b/);
    expect(t).toContain("recebimento de 27,5 dias");
    expect(t).not.toContain("[Revisar: nome do contador]");
  });
});
