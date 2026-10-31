// Núcleo do balancete usado pela Edge Function (gerado de web/src/dominios/demonstrativos/balancete/ e
// web/src/lib/{texto,formato} por scripts/sync-funcoes.sh). Não edite aqui: mude a origem e rode o script.

export type Grupo =
  | "ac_disponivel"
  | "ac_clientes"
  | "ac_estoques"
  | "ac_outros"
  | "anc_rlp"
  | "anc_permanente"
  | "pc_fornecedores"
  | "pc_emprestimos"
  | "pc_obrigacoes"
  | "pc_outros"
  | "pnc_emprestimos"
  | "pnc_outros"
  | "pl"
  | "receita_bruta"
  | "deducoes"
  | "custos"
  | "despesas_operacionais"
  | "receitas_financeiras"
  | "despesas_financeiras"
  | "outras_receitas"
  | "outras_despesas"
  | "ir_csll"
  | "ignorar";

export interface Linha {
  codigo: string | null;
  classificacao: string;
  descricao: string;
  nivel: number;
  analitica: boolean;
  saldo_anterior: number;
  debitos: number;
  creditos: number;
  saldo_atual: number;
  grupo: Grupo | null;
}

export function semAcento(t: unknown): string {
  return String(t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export const sem = (s: unknown) =>
  semAcento(s)
    .toUpperCase()
    .replace(/\(\s*-\s*\)/g, "(MENOS)")
    .replace(/[-–]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** "1.234,56D", "(1.234,56)", "-1234.56", "1.234,56 C" → número com sinal (D positivo, C negativo). */

type Bloco = "ativo" | "passivo" | "resultado";

// Regras por bloco (ativo, passivo/PL, resultado), testadas da própria conta para as contas-mãe.

export function blocoDe(topo: string, classificacao: string): Bloco {
  if (/^ATIVO/.test(topo)) return "ativo";
  if (/PASSIVO|PATRIMONIO/.test(topo)) return "passivo";
  if (/RESULTADO|RECEITA|CUSTO|DESPESA/.test(topo)) return "resultado";
  return classificacao.startsWith("1") ? "ativo" : classificacao.startsWith("2") ? "passivo" : "resultado";
}

/** Atribui grupo a cada conta: mapa salvo (prefixo mais longo) → regras do bloco pelas descrições, da conta para cima. */

export interface Resumo {
  // balanço (saldos atuais, valores positivos na natureza da conta)
  disponivel: number;
  clientes: number;
  estoques: number;
  ac_outros: number;
  ac: number;
  rlp: number;
  permanente: number;
  anc: number;
  ativo_total: number;
  fornecedores: number;
  pc_emprestimos: number;
  pc_obrigacoes: number;
  pc_outros: number;
  pc: number;
  pnc_emprestimos: number;
  pnc: number;
  pl: number;
  resultado_exercicio: number;
  // DRE do mês (movimento) e do ano (saldo acumulado)
  mes: Dre;
  ano: Dre;
  debitos: number;
  creditos: number;
}

export interface Dre {
  receita_bruta: number;
  deducoes: number;
  receita_liquida: number;
  custos: number;
  lucro_bruto: number;
  despesas_operacionais: number;
  resultado_operacional: number;
  receitas_financeiras: number;
  despesas_financeiras: number;
  outras: number;
  resultado_antes_ir: number;
  ir_csll: number;
  lucro_liquido: number;
  despesas_por_conta: { conta: string; valor: number }[];
}

/** Arredonda para centavos. */

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

export function fmtNumero(v: number, casas = 2): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/** Fração como percentual: fmtPercentual(0.1234) → "12,3%" (até `casas` decimais); vazio ou infinito → "—". */

export function fmtPercentual(v: number | null | undefined, casas = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return (v * 100).toLocaleString("pt-BR", { maximumFractionDigits: casas }) + "%";
}

/** Como cada índice é mostrado: "x" (vezes, 2 casas), "%" (percentual), "R$" (reais inteiros) ou "dias". */

export type FormatoIndice = "x" | "%" | "R$" | "dias";

/** Valor de um índice no formato dele; vazio ou infinito → "—". */

export function fmtIndice(v: number | null | undefined, f: FormatoIndice): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  if (f === "x") return fmtNumero(v, 2);
  if (f === "%") return fmtPercentual(v);
  if (f === "dias") return `${Math.round(v)} dias`;
  return brlFormato(v, { centavos: false });
}

export interface OpcoesMoeda {
  /** false arredonda para reais inteiros ("R$ 1.235"), como nos painéis e textos dos demonstrativos. Padrão: true. */
  centavos?: boolean;
}

/** Valor em reais: brl(1234.5) → "R$ 1.234,50"; brl(1234.5, { centavos: false }) → "R$ 1.235"; vazio → "—". */

export function brlFormato(v: number | null | undefined, { centavos = true }: OpcoesMoeda = {}): string {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString(
    "pt-BR",
    centavos ? { style: "currency", currency: "BRL" } : { style: "currency", currency: "BRL", maximumFractionDigits: 0 },
  );
}

/** Na função do PDF, brl() mostra sempre reais inteiros (o mesmo que brl(v, { centavos: false }) no site). */
export const brl = (v: number | null | undefined) => brlFormato(v, { centavos: false });

export interface Alerta {
  area: string;
  nivel: "alto" | "medio";
  texto: string;
  evidencia: string;
  recomendacao: string;
}
