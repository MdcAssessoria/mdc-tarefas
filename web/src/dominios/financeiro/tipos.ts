// Tipos do módulo Financeiro (etapa 1: plano de contas do Domínio, contas bancárias e extratos).

export interface ContaContabil {
  id: string;
  cliente_id: string;
  codigo: string | null;
  classificacao: string;
  descricao: string;
  analitica: boolean;
  nivel: number;
  ativo: boolean;
}

export interface ContaBancaria {
  id: string;
  org_id: string;
  cliente_id: string;
  nome: string;
  banco: string | null;
  agencia: string | null;
  numero: string | null;
  conta_contabil_id: string | null;
  saldo_inicial: number;
  saldo_inicial_em: string | null;
  ativo: boolean;
}

export interface LinhaExtrato {
  id: number;
  conta_id: string;
  lote_id: string;
  data: string;
  valor: number;
  descricao: string;
  documento: string | null;
  situacao: "pendente" | "conciliado" | "ignorado";
}

export interface LoteExtrato {
  id: string;
  conta_id: string;
  arquivo: string;
  formato: "ofx" | "planilha";
  inicio: string | null;
  fim: string | null;
  recebidas: number;
  novas: number;
  repetidas: number;
  em: string;
}

/** Bancos mais usados pela carteira (código Febraban e nome); a pessoa pode digitar outro. */
export const BANCOS = [
  "001 · Banco do Brasil",
  "104 · Caixa Econômica Federal",
  "237 · Bradesco",
  "341 · Itaú",
  "033 · Santander",
  "756 · Sicoob",
  "748 · Sicredi",
  "136 · Unicred",
  "077 · Inter",
  "260 · Nubank",
  "336 · C6 Bank",
  "208 · BTG Pactual",
  "422 · Safra",
  "041 · Banrisul",
  "004 · Banco do Nordeste",
  "403 · Cora",
  "290 · PagBank",
  "323 · Mercado Pago",
];

/** Saldo atual da conta: saldo inicial (saldo do banco no FIM do dia informado) + o que entrou e saiu DEPOIS desse dia. */
export function saldoDaConta(c: ContaBancaria, linhas: Pick<LinhaExtrato, "conta_id" | "data" | "valor">[]): number {
  const soma = linhas
    .filter((l) => l.conta_id === c.id && (!c.saldo_inicial_em || l.data > c.saldo_inicial_em))
    .reduce((a, l) => a + Number(l.valor), 0);
  return Math.round((Number(c.saldo_inicial) + soma) * 100) / 100;
}

// ------------------------------------------------------------------ cadastros (migração 028)

export type TipoPessoa = "fornecedor" | "cliente" | "ambos";
export interface Pessoa {
  id: string;
  cliente_id: string;
  tipo: TipoPessoa;
  nome: string;
  documento: string | null;
  email: string | null;
  telefone: string | null;
  cidade: string | null;
  uf: string | null;
  observacao: string | null;
  ativo: boolean;
}

export interface Categoria {
  id: string;
  cliente_id: string;
  tipo: "despesa" | "receita";
  nome: string;
  grupo: string | null;
  conta_contabil_id: string;
  ativo: boolean;
}

export interface CentroCusto {
  id: string;
  cliente_id: string;
  codigo: string | null;
  nome: string;
  ativo: boolean;
}

// ------------------------------------------------------------------ contas a pagar e a receber

export type TipoTitulo = "pagar" | "receber";
export interface Titulo {
  id: string;
  cliente_id: string;
  tipo: TipoTitulo;
  pessoa_id: string | null;
  categoria_id: string;
  centro_id: string | null;
  conta_prevista_id: string | null;
  descricao: string;
  documento: string | null;
  emissao: string | null;
  vencimento: string;
  valor: number;
  valor_pago: number;
  parcela: number;
  parcelas: number;
  grupo: string | null;
  situacao: "aberto" | "quitado" | "cancelado";
  quitado_em: string | null;
  cancelado_motivo: string | null;
  observacao: string | null;
  /** Contrato fixo que lançou esta conta (041) e o mês dele. */
  recorrente_id?: string | null;
  competencia?: string | null;
  /** Nota fiscal de entrada que lançou esta conta (032). */
  nota_id?: string | null;
}

export interface Baixa {
  id: number;
  titulo_id: string;
  conta_id: string;
  data: string;
  valor: number;
  juros: number;
  multa: number;
  desconto: number;
  total: number;
  forma: string | null;
  observacao: string | null;
  estornada: boolean;
  estorno_motivo: string | null;
  extrato_linha_id: number | null;
}

/** Transferência entre duas contas bancárias da mesma empresa (migração 034). */
export interface Transferencia {
  id: number;
  cliente_id: string;
  origem_id: string;
  destino_id: string;
  data: string;
  valor: number;
  observacao: string | null;
  estornada: boolean;
  estorno_motivo: string | null;
}

// ------------------------------------------------------------------ itens e estoque (migração 029)

export interface Item {
  id: string;
  cliente_id: string;
  codigo: string | null;
  nome: string;
  tipo: "produto" | "servico";
  unidade: string;
  controla_estoque: boolean;
  estoque_minimo: number;
  preco_venda: number | null;
  custo: number | null;
  ncm: string | null;
  codigo_barras: string | null;
  categoria_receita_id: string | null;
  categoria_despesa_id: string | null;
  observacao: string | null;
  ativo: boolean;
  // migração 033
  grupo_id: string | null;
  marca: string | null;
  unidade_compra: string | null;
  fator_compra: number;
  custo_medio: number | null;
  markup: number | null;
  foto_caminho: string | null;
}

export interface GrupoItem {
  id: string;
  cliente_id: string;
  nome: string;
  ativo: boolean;
}

export interface LocalEstoque {
  id: string;
  cliente_id: string;
  nome: string;
  padrao: boolean;
  ativo: boolean;
}

export type TipoMovimento = "entrada" | "saida" | "ajuste" | "transferencia";
export interface MovimentoEstoque {
  id: number;
  item_id: string;
  local_id: string;
  data: string;
  tipo: TipoMovimento;
  quantidade: number;
  custo_unitario: number | null;
  origem: string;
  grupo: string | null;
  observacao: string | null;
  estornado: boolean;
  estorno_motivo: string | null;
  // migração 033 (ficha de estoque)
  origem_id: string | null;
  saldo_apos: number | null;
  custo_medio_apos: number | null;
}

// ------------------------------------------------------------------ pedidos (migração 033)

export interface ParcelaPedido {
  numero: number;
  vencimento: string;
  valor: number;
}

export interface Pedido {
  id: string;
  cliente_id: string;
  tipo: "venda" | "compra";
  numero: number;
  pessoa_id: string | null;
  data: string;
  previsao: string | null;
  local_id: string | null;
  categoria_id: string | null;
  centro_id: string | null;
  total_itens: number;
  desconto: number;
  frete: number;
  total: number;
  condicao: string | null;
  forma_pagamento: string | null;
  parcelas: ParcelaPedido[];
  documento: string | null;
  observacao: string | null;
  situacao: "rascunho" | "confirmado" | "faturado" | "recebido" | "cancelado";
  lancado_em: string | null;
  cancelado_em: string | null;
  cancelado_motivo: string | null;
  criado_em: string;
}

export interface PedidoItem {
  id: number;
  pedido_id: string;
  ordem: number;
  item_id: string;
  descricao: string;
  unidade: string;
  fator: number;
  quantidade: number;
  preco_unitario: number;
  desconto: number;
  total: number;
  custo_unitario: number | null;
  movimento_id: number | null;
}

export interface SaldoEstoque {
  item_id: string;
  local_id: string;
  saldo: number;
  ultimo_movimento: string | null;
}

export const FORMAS_PAGAMENTO = [
  "Pix",
  "Boleto",
  "Transferência",
  "Cartão de crédito",
  "Cartão de débito",
  "Dinheiro",
  "Débito automático",
  "Cheque",
];
