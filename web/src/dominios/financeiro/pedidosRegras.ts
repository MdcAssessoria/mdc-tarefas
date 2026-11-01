// Regras puras dos pedidos de venda e de compra (testadas em pedidosRegras.test.ts): total da linha e do pedido,
// condições de pagamento em parcelas, rateio do custo na compra e nomes das situações. O banco confere de novo
// tudo ao salvar (est_pedido_salvar); aqui é a prévia da tela.
import { somarDias } from "@/lib/datas";
import { arred } from "./estoqueRegras";
import { somarMesesData } from "./regras";

export type TipoPedido = "venda" | "compra";
export type SituacaoPedido = "rascunho" | "confirmado" | "faturado" | "recebido" | "cancelado";

/** Nome e cor de cada situação; "confirmado" muda de nome na compra (ainda não chegou). */
export function situacaoPedido(tipo: TipoPedido, s: SituacaoPedido): { nome: string; tom: string; dica: string } {
  switch (s) {
    case "rascunho":
      return { nome: "Rascunho", tom: "bg-neutral-100 text-neutral-700", dica: "Ainda não mexeu no estoque nem no financeiro" };
    case "confirmado":
      return tipo === "venda"
        ? { nome: "Confirmado", tom: "bg-sky-50 text-sky-900", dica: "Estoque baixado e contas a receber lançadas" }
        : { nome: "Aguardando entrega", tom: "bg-amber-50 text-amber-900", dica: "Pedido feito ao fornecedor; falta receber a mercadoria" };
    case "faturado":
      return { nome: "Faturado", tom: "bg-emerald-50 text-emerald-800", dica: "Nota emitida" };
    case "recebido":
      return { nome: "Recebido", tom: "bg-emerald-50 text-emerald-800", dica: "Mercadoria no estoque e contas a pagar lançadas" };
    default:
      return { nome: "Cancelado", tom: "bg-red-50 text-red-800", dica: "Estoque e contas estornados" };
  }
}

/** Total da linha: quantidade × preço (em centavos) − desconto. */
export function totalLinha(quantidade: number, preco: number, desconto = 0): number {
  return arred(arred(quantidade * preco, 2) - (desconto || 0), 2);
}

/** Soma das linhas, total do pedido (− desconto + frete). */
export function totaisPedido(linhas: { total: number }[], desconto = 0, frete = 0) {
  const itens = arred(
    linhas.reduce((a, l) => a + l.total, 0),
    2,
  );
  return { itens, total: arred(itens - (desconto || 0) + (frete || 0), 2) };
}

export type Condicao = "avista" | "30" | "30_60" | "30_60_90" | "mensal" | "personalizado";
export const CONDICOES: { id: Condicao; nome: string }[] = [
  { id: "avista", nome: "À vista" },
  { id: "30", nome: "30 dias" },
  { id: "30_60", nome: "30 e 60 dias" },
  { id: "30_60_90", nome: "30, 60 e 90 dias" },
  { id: "mensal", nome: "Parcelado por mês" },
  { id: "personalizado", nome: "Personalizado (eu escolho)" },
];
export const nomeCondicao = (c: Condicao, n = 1) =>
  c === "mensal" ? `${n}x mensal` : (CONDICOES.find((x) => x.id === c)?.nome ?? "Personalizado");

export interface ParcelaPrevia {
  numero: number;
  vencimento: string;
  valor: number;
}

/** Divide o total em n partes iguais; os centavos que sobram vão na última (igual ao Financeiro). */
export function dividirValor(total: number, n: number): number[] {
  const centavos = Math.round(total * 100);
  const base = Math.floor(centavos / n);
  return Array.from({ length: n }, (_, k) => (k === n - 1 ? centavos - base * (n - 1) : base) / 100);
}

/**
 * Parcelas da condição escolhida a partir da data do pedido: à vista = na data; 30/60/90 = dias corridos;
 * mensal = n parcelas, a primeira um mês depois. Personalizado começa como à vista (a pessoa edita).
 */
export function gerarParcelas(total: number, condicao: Condicao, dataBase: string, n = 1): ParcelaPrevia[] {
  if (!(total > 0) || !dataBase) return [];
  let vencimentos: string[];
  switch (condicao) {
    case "30":
      vencimentos = [somarDias(dataBase, 30)];
      break;
    case "30_60":
      vencimentos = [somarDias(dataBase, 30), somarDias(dataBase, 60)];
      break;
    case "30_60_90":
      vencimentos = [30, 60, 90].map((d) => somarDias(dataBase, d));
      break;
    case "mensal": {
      const q = Math.max(1, Math.min(120, Math.floor(n) || 1));
      vencimentos = Array.from({ length: q }, (_, k) => somarMesesData(dataBase, k + 1));
      break;
    }
    default:
      vencimentos = [dataBase];
  }
  const valores = dividirValor(total, vencimentos.length);
  return vencimentos.map((vencimento, k) => ({ numero: k + 1, vencimento, valor: valores[k] }));
}

/** Diferença entre o total e a soma das parcelas (0 = bate). */
export const diferencaParcelas = (total: number, parcelas: { valor: number }[]) =>
  arred(total - parcelas.reduce((a, p) => a + (Number(p.valor) || 0), 0), 2);

/**
 * Custo por unidade de estoque de cada linha da compra, rateando frete e desconto do pedido proporcionalmente ao
 * valor das linhas (mesma conta do banco ao receber).
 */
export function ratearCustoCompra(linhas: { total: number; quantidade: number; fator: number }[], desconto = 0, frete = 0): number[] {
  const soma = linhas.reduce((a, l) => a + l.total, 0);
  const ajuste = (frete || 0) - (desconto || 0);
  return linhas.map((l) => {
    const qtd = l.quantidade * (l.fator > 0 ? l.fator : 1);
    if (!(qtd > 0)) return 0;
    const custo = (l.total + (soma > 0 ? (ajuste * l.total) / soma : 0)) / qtd;
    return Math.max(0, arred(custo, 4));
  });
}

/** Margem bruta da venda: (total − custo das mercadorias) / total. */
export function margemVenda(total: number, custoTotal: number): number | null {
  if (!(total > 0)) return null;
  return arred(((total - custoTotal) / total) * 100, 2);
}
