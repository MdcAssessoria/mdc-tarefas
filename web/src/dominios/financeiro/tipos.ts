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
