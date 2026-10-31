// Índices financeiros (liquidez, endividamento, margens, prazos médios e ciclos) e a descrição de cada um
// para leigos, com a faixa de alerta da MDC.
import type { FormatoIndice } from "@/lib/formato/numero";
import { r2 } from "./resumo";
import type { Resumo } from "./resumo";

export interface Indices {
  liquidez_corrente: number | null;
  liquidez_seca: number | null;
  liquidez_imediata: number | null;
  liquidez_geral: number | null;
  capital_giro: number;
  endividamento_geral: number | null;
  composicao_endividamento: number | null;
  margem_bruta: number | null;
  margem_operacional: number | null;
  margem_liquida: number | null;
  roe: number | null;
  pmr: number | null; // dias — prazo médio de recebimento
  pmp?: number | null; // prazo médio de pagamento
  pme?: number | null; // prazo médio de estocagem (estoque total)
  pmv?: number | null; // prazo médio de venda (produto pronto/mercadoria até a venda)
  ciclo_operacional?: number | null;
  ciclo_financeiro?: number | null;
  carga_tributaria: number | null;
}

/** Saldos médios e bases para os prazos médios (calculados com o saldo anterior e o atual do balancete). */
export interface BasePrazos {
  dias: number;
  clientes_medio: number;
  estoques_medio: number;
  acabados_medio: number | null; // produtos acabados/mercadorias; null = sem separação no plano de contas
  fornecedores_medio: number;
  compras_fornecedores?: number; // créditos lançados em fornecedores no período = compras a prazo
  estoque_inicial: number;
  estoque_final: number;
}

const div = (a: number, b: number) => (b ? a / b : null);

export function calcularIndices(r: Resumo, diasPeriodo = 30, b?: BasePrazos): Indices {
  const dias = b?.dias ?? diasPeriodo;
  const d = r.mes;
  const cmv = d.custos;
  const temEstoque = !!b && b.estoques_medio > 1 && cmv > 0;
  // compras = CMV + estoque final − estoque inicial; sem estoque (serviços), a base de pagamento são custos + despesas operacionais
  const compras = !b
    ? 0
    : (b.compras_fornecedores ?? 0) > 0
      ? b.compras_fornecedores!
      : temEstoque
        ? cmv + b.estoque_final - b.estoque_inicial
        : cmv + d.despesas_operacionais;
  const dd = (v: number | null) => (v === null || !Number.isFinite(v) ? null : Math.round(v));
  const pmr = b
    ? d.receita_bruta > 0
      ? dd((b.clientes_medio / d.receita_bruta) * dias)
      : null
    : r.mes.receita_bruta > 0
      ? Math.round((r.clientes / r.mes.receita_bruta) * diasPeriodo)
      : null;
  const pme = temEstoque ? dd((b!.estoques_medio / cmv) * dias) : null;
  const pmv = temEstoque ? dd(((b!.acabados_medio ?? b!.estoques_medio) / cmv) * dias) : null;
  const pmp = b && compras > 0 && b.fornecedores_medio > 0 ? dd((b.fornecedores_medio / compras) * dias) : null;
  const ciclo_operacional = pmr === null ? null : (pme ?? 0) + pmr;
  const ciclo_financeiro = ciclo_operacional === null ? null : ciclo_operacional - (pmp ?? 0);
  const plAjustado = r.pl + r.resultado_exercicio; // PL antes do encerramento + resultado do ano
  return {
    liquidez_corrente: div(r.ac, r.pc),
    liquidez_seca: div(r.ac - r.estoques, r.pc),
    liquidez_imediata: div(r.disponivel, r.pc),
    liquidez_geral: div(r.ac + r.rlp, r.pc + r.pnc),
    capital_giro: r2(r.ac - r.pc),
    endividamento_geral: div(r.pc + r.pnc, r.ativo_total),
    composicao_endividamento: div(r.pc, r.pc + r.pnc),
    margem_bruta: div(r.ano.lucro_bruto, r.ano.receita_liquida),
    margem_operacional: div(r.ano.resultado_operacional, r.ano.receita_liquida),
    margem_liquida: div(r.ano.lucro_liquido, r.ano.receita_liquida),
    roe: plAjustado > 0 ? div(r.ano.lucro_liquido, plAjustado) : null,
    pmr,
    pmp,
    pme,
    pmv,
    ciclo_operacional,
    ciclo_financeiro,
    carga_tributaria: div(r.ano.deducoes + r.ano.ir_csll, r.ano.receita_bruta),
  };
}

export const INDICES_INFO: {
  id: keyof Indices;
  nome: string;
  formato: FormatoIndice;
  leitura: string;
  alerta?: (v: number) => boolean;
}[] = [
  {
    id: "liquidez_corrente",
    nome: "Liquidez corrente",
    formato: "x",
    leitura: "quanto há em caixa e a receber para cada R$ 1 de dívida de curto prazo",
    alerta: (v) => v < 1,
  },
  {
    id: "liquidez_seca",
    nome: "Liquidez seca",
    formato: "x",
    leitura: "a mesma conta sem depender de vender o estoque",
    alerta: (v) => v < 0.8,
  },
  {
    id: "liquidez_imediata",
    nome: "Liquidez imediata",
    formato: "x",
    leitura: "quanto das dívidas de curto prazo o caixa paga hoje",
    alerta: (v) => v < 0.2,
  },
  { id: "liquidez_geral", nome: "Liquidez geral", formato: "x", leitura: "capacidade de pagar todas as dívidas", alerta: (v) => v < 1 },
  { id: "capital_giro", nome: "Capital de giro", formato: "R$", leitura: "folga (ou falta) de dinheiro para operar", alerta: (v) => v < 0 },
  {
    id: "endividamento_geral",
    nome: "Endividamento geral",
    formato: "%",
    leitura: "quanto do que a empresa tem é financiado por terceiros",
    alerta: (v) => v > 0.7,
  },
  {
    id: "composicao_endividamento",
    nome: "Dívida de curto prazo",
    formato: "%",
    leitura: "quanto da dívida vence em até 12 meses",
    alerta: (v) => v > 0.8,
  },
  { id: "margem_bruta", nome: "Margem bruta", formato: "%", leitura: "quanto sobra de cada R$ 100 vendidos depois dos custos" },
  {
    id: "margem_operacional",
    nome: "Margem operacional",
    formato: "%",
    leitura: "quanto sobra depois das despesas da operação",
    alerta: (v) => v < 0,
  },
  { id: "margem_liquida", nome: "Margem líquida", formato: "%", leitura: "lucro final de cada R$ 100 vendidos", alerta: (v) => v < 0 },
  { id: "roe", nome: "Retorno sobre o patrimônio", formato: "%", leitura: "quanto o capital dos sócios rendeu no ano" },
  {
    id: "pmr",
    nome: "PMR · Prazo médio de recebimento",
    formato: "dias",
    leitura: "em quantos dias, em média, a empresa recebe dos clientes depois de vender",
    alerta: (v) => v > 60,
  },
  {
    id: "pmp",
    nome: "PMP · Prazo médio de pagamento",
    formato: "dias",
    leitura: "em quantos dias, em média, a empresa paga fornecedores (base: compras lançadas em fornecedores no período)",
  },
  {
    id: "pme",
    nome: "PME · Prazo médio de estocagem",
    formato: "dias",
    leitura: "quantos dias o estoque (matéria-prima a produto) fica parado até sair; vazio quando não há estoque",
    alerta: (v) => v > 120,
  },
  {
    id: "pmv",
    nome: "PMV · Prazo médio de venda",
    formato: "dias",
    leitura: "quantos dias o produto pronto ou a mercadoria espera até ser vendido; vazio quando não há estoque",
    alerta: (v) => v > 90,
  },
  { id: "ciclo_operacional", nome: "Ciclo operacional", formato: "dias", leitura: "do estoque ao dinheiro na conta: PME + PMR" },
  {
    id: "ciclo_financeiro",
    nome: "Ciclo financeiro (de caixa)",
    formato: "dias",
    leitura: "quantos dias a empresa banca a operação com dinheiro próprio ou de banco: ciclo operacional − PMP",
    alerta: (v) => v > 60,
  },
  {
    id: "carga_tributaria",
    nome: "Carga tributária efetiva",
    formato: "%",
    leitura: "quanto da receita bruta vai para impostos (vendas + IRPJ/CSLL)",
  },
];
