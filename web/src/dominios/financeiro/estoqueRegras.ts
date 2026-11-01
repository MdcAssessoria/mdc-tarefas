// Regras puras de itens e estoque (sem banco, testadas em estoqueRegras.test.ts): margem, markup, preço sugerido,
// custo médio ponderado, conversão de unidade de compra, situação do saldo, busca de itens e código sugerido.
// O custo médio de verdade é calculado no banco (app.est_recalcular); a conta aqui serve à prévia na tela.
import { semAcento } from "@/lib/texto";

/** Arredonda sem o erro de vírgula flutuante (1.005 → 1.01). */
export const arred = (n: number, casas = 2) => {
  const f = 10 ** casas;
  return Math.round((n + Number.EPSILON) * f) / f;
};

/** Margem sobre o preço de venda, em %: (preço − custo) / preço. Sem preço, null. */
export function margem(preco: number | null | undefined, custo: number | null | undefined): number | null {
  if (!preco || preco <= 0 || custo == null) return null;
  return arred(((preco - custo) / preco) * 100, 2);
}

/** Markup sobre o custo, em %: (preço − custo) / custo. Sem custo, null. */
export function markupDe(preco: number | null | undefined, custo: number | null | undefined): number | null {
  if (preco == null || !custo || custo <= 0) return null;
  return arred(((preco - custo) / custo) * 100, 2);
}

/** Preço sugerido pelo markup: custo × (1 + markup/100), em centavos. */
export function precoPorMarkup(custo: number, markup: number): number {
  return arred(custo * (1 + markup / 100), 2);
}

/** Preço para ter a margem desejada sobre o preço: custo / (1 − margem/100). Margem de 100% ou mais não existe. */
export function precoPorMargem(custo: number, margemDesejada: number): number | null {
  if (margemDesejada >= 100) return null;
  return arred(custo / (1 - margemDesejada / 100), 2);
}

/**
 * Custo médio ponderado depois de uma entrada: (saldo × custo médio + qtd × custo) / (saldo + qtd). Com saldo zero ou
 * negativo, vale o custo da entrada (mesma regra do banco).
 */
export function custoMedio(saldo: number, custoMedioAtual: number | null, qtd: number, custo: number): number {
  if (saldo <= 0 || custoMedioAtual == null) return arred(custo, 4);
  return arred((saldo * custoMedioAtual + qtd * custo) / (saldo + qtd), 4);
}

/** Quantidade na unidade de estoque: 2 CX com fator 12 → 24 UN. */
export const paraUnidadeEstoque = (qtd: number, fator: number) => arred(qtd * (fator > 0 ? fator : 1), 4);

/** Custo por unidade de estoque a partir do preço da unidade de compra: R$ 48 a CX com 12 → R$ 4,00. */
export const custoPorUnidadeEstoque = (precoCompra: number, fator: number) => arred(precoCompra / (fator > 0 ? fator : 1), 4);

/** Custo usado para margem e valor do estoque: o custo médio, se já houver; senão o preço de custo do cadastro. */
export function custoBase(i: { custo_medio?: number | null; custo?: number | null }): number | null {
  const cm = i.custo_medio == null ? null : Number(i.custo_medio);
  if (cm != null && cm > 0) return cm;
  return i.custo == null ? null : Number(i.custo);
}

export type SituacaoSaldo = "sem_controle" | "negativo" | "zerado" | "baixo" | "ok";
export const SITUACOES_SALDO: Record<SituacaoSaldo, { nome: string; tom: string }> = {
  sem_controle: { nome: "Não controla", tom: "bg-neutral-100 text-neutral-600" },
  negativo: { nome: "Negativo", tom: "bg-red-100 text-red-900" },
  zerado: { nome: "Sem estoque", tom: "bg-red-50 text-red-800" },
  baixo: { nome: "Abaixo do mínimo", tom: "bg-amber-50 text-amber-900" },
  ok: { nome: "Em estoque", tom: "bg-emerald-50 text-emerald-800" },
};

export function situacaoSaldo(saldo: number, minimo: number, controla: boolean): SituacaoSaldo {
  if (!controla) return "sem_controle";
  if (saldo < 0) return "negativo";
  if (saldo === 0) return "zerado";
  if (minimo > 0 && saldo <= minimo) return "baixo";
  return "ok";
}

/** Texto normalizado para comparar em buscas: sem acento, minúsculo, espaços simples. */
export const normalizar = (t: unknown) => semAcento(t).toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Busca "forte": cada palavra digitada precisa aparecer em algum dos campos (nome, código, código de barras, marca,
 * grupo, NCM), em qualquer ordem, sem acento e sem diferença de maiúsculas. "parafuso 10" acha "Parafuso sextavado 10mm".
 */
export function combinaBusca(campos: (string | null | undefined)[], consulta: string): boolean {
  const q = normalizar(consulta);
  if (!q) return true;
  const alvo = normalizar(campos.filter(Boolean).join(" "));
  return q.split(" ").every((p) => alvo.includes(p));
}

/**
 * Próximo código livre no padrão da empresa: pega o maior código com o prefixo (ex.: P0012) e soma 1, mantendo o
 * número de dígitos. Sem códigos, devolve prefixo + "0001".
 */
export function sugerirCodigo(codigos: (string | null | undefined)[], prefixo = "P"): string {
  const re = new RegExp(`^${prefixo.replace(/[^\w]/g, "")}(\\d+)$`, "i");
  let maior = 0;
  let digitos = 4;
  for (const c of codigos) {
    const m = (c ?? "").trim().match(re);
    if (m) {
      maior = Math.max(maior, Number(m[1]));
      digitos = Math.max(digitos, m[1].length);
    }
  }
  return `${prefixo}${String(maior + 1).padStart(digitos, "0")}`;
}

/** Unidades mais comuns (a pessoa pode digitar outra de até 6 letras). */
export const UNIDADES: { id: string; nome: string }[] = [
  { id: "UN", nome: "Unidade" },
  { id: "PC", nome: "Peça" },
  { id: "CX", nome: "Caixa" },
  { id: "PCT", nome: "Pacote" },
  { id: "KG", nome: "Quilo" },
  { id: "G", nome: "Grama" },
  { id: "L", nome: "Litro" },
  { id: "ML", nome: "Mililitro" },
  { id: "M", nome: "Metro" },
  { id: "M2", nome: "Metro quadrado" },
  { id: "M3", nome: "Metro cúbico" },
  { id: "PAR", nome: "Par" },
  { id: "DZ", nome: "Dúzia" },
  { id: "FD", nome: "Fardo" },
  { id: "SC", nome: "Saco" },
  { id: "RL", nome: "Rolo" },
  { id: "H", nome: "Hora" },
  { id: "SV", nome: "Serviço" },
];
export const nomeUnidade = (u: string) => UNIDADES.find((x) => x.id === u.toUpperCase())?.nome ?? u;

/** Quantidade em pt-BR com até 4 casas: 1234.5 → "1.234,5". */
export const qtdBr = (n: number | null | undefined) => Number(n ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 });

/** Percentual em pt-BR: 33.333 → "33,33%". */
export const pct = (n: number | null | undefined) =>
  n == null ? "—" : `${Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
