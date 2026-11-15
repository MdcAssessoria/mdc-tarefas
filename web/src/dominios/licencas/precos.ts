// Regras puras das tabelas de preço de Licenças › Produtos e planos: o que mudou na digitação, soma de tabela de um
// pacote e o preço do pacote a partir de um desconto. Sem tela e sem banco (com teste).
import { numeroBr } from "@/dominios/financeiro/regras";
import type { Plano, Produto } from "./tipos";

/** Preço digitado → número; vazio = 0; texto inválido ou negativo = null. */
export function lerPreco(texto: string): number | null {
  const n = numeroBr(texto);
  if (Number.isNaN(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/** Produtos cujo preço digitado é diferente do gravado (só os válidos). */
export function precosAlterados(produtos: Produto[], digitado: Record<string, string>): { produto: Produto; preco: number }[] {
  return produtos.flatMap((p) => {
    const t = digitado[p.id];
    if (t === undefined) return [];
    const preco = lerPreco(t);
    return preco === null || preco === p.preco ? [] : [{ produto: p, preco }];
  });
}

/** Soma dos preços de tabela dos produtos do pacote (preços já digitados valem antes do gravado). */
export function somaDoPacote(ids: string[], produtos: Map<string, Produto>, digitado: Record<string, string> = {}): number {
  return (
    Math.round(
      ids.reduce((s, id) => {
        const p = produtos.get(id);
        if (!p) return s;
        const t = digitado[id];
        const v = t === undefined ? p.preco : (lerPreco(t) ?? p.preco);
        return s + v;
      }, 0) * 100,
    ) / 100
  );
}

/** Preço do pacote com X% de desconto sobre a soma, arredondado para baixo nos centavos. */
export function precoComDesconto(soma: number, percentual: number): number {
  if (!(percentual >= 0 && percentual < 100)) return soma;
  return Math.floor(soma * (100 - percentual)) / 100;
}

export interface PacoteEditado {
  produtos: string[];
  preco: string;
}

/** Pacotes cuja composição ou preço digitado mudou (o preço precisa ser válido). */
export function pacotesAlterados(
  planos: Plano[],
  editado: Record<string, PacoteEditado>,
): { plano: Plano; produtos: string[]; preco: number }[] {
  return planos.flatMap((pl) => {
    const e = editado[pl.id];
    if (!e) return [];
    const preco = lerPreco(e.preco);
    if (preco === null) return [];
    const mesmos = e.produtos.length === pl.produtos.length && e.produtos.every((id) => pl.produtos.includes(id));
    return mesmos && preco === pl.preco ? [] : [{ plano: pl, produtos: e.produtos, preco }];
  });
}
