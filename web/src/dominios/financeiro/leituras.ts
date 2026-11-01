// Leituras do Financeiro (sempre paginadas: o Supabase corta em 1000 linhas sem avisar).
import { supabase } from "@/lib/supabase";
import { lerTudo } from "@/lib/lerTudo";
import type { ContaBancaria, ContaContabil, LinhaExtrato, LoteExtrato } from "./tipos";

export const lerPlano = (cliente: string) =>
  lerTudo<ContaContabil>((de, ate) =>
    supabase()
      .from("fin_plano_contas")
      .select("id,cliente_id,codigo,classificacao,descricao,analitica,nivel,ativo")
      .eq("cliente_id", cliente)
      .order("classificacao")
      .order("id")
      .range(de, ate),
  );

export const lerContas = (cliente: string) =>
  lerTudo<ContaBancaria>((de, ate) =>
    supabase().from("fin_contas_bancarias").select("*").eq("cliente_id", cliente).order("nome").order("id").range(de, ate),
  );

/** Lançamentos do cliente; com `conta`, só daquela conta; com período, só entre as datas (inclusive). */
export const lerLinhas = (cliente: string, filtro: { conta?: string; de?: string; ate?: string } = {}) =>
  lerTudo<LinhaExtrato>((de, ate) => {
    let q = supabase()
      .from("fin_extrato_linhas")
      .select("id,conta_id,lote_id,data,valor,descricao,documento,situacao")
      .eq("cliente_id", cliente);
    if (filtro.conta) q = q.eq("conta_id", filtro.conta);
    if (filtro.de) q = q.gte("data", filtro.de);
    if (filtro.ate) q = q.lte("data", filtro.ate);
    return q.order("data").order("id").range(de, ate);
  });

export const lerLotes = (cliente: string) =>
  lerTudo<LoteExtrato>((de, ate) =>
    supabase()
      .from("fin_extrato_lotes")
      .select("id,conta_id,arquivo,formato,inicio,fim,recebidas,novas,repetidas,em")
      .eq("cliente_id", cliente)
      .order("em", { ascending: false })
      .order("id")
      .range(de, ate),
  );

/** Texto de um arquivo de extrato: tenta UTF-8 e, se vierem caracteres quebrados, lê como Windows-1252 (bancos antigos). */
export async function textoDoArquivo(arq: File): Promise<string> {
  const bytes = new Uint8Array(await arq.arrayBuffer());
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(bytes) : utf8;
}

/** "1.1.1.02.001 · Banco Itaú" */
export const rotuloConta = (c: Pick<ContaContabil, "classificacao" | "descricao" | "codigo">) =>
  `${c.classificacao}${c.codigo ? ` (${c.codigo})` : ""} · ${c.descricao}`;
