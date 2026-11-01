// Gravações do Financeiro. Plano e extrato vão por funções do banco (tudo ou nada, com permissão conferida lá).
import { supabase } from "@/lib/supabase";
import { exigir } from "@/lib/exigir";
import type { Json } from "@/lib/database.types";
import type { ContaPlano } from "./planoDominio";
import { chavesDoArquivo } from "./ofx";
import type { ExtratoLido } from "./ofx";

export async function importarPlano(cliente: string, arquivo: string, contas: ContaPlano[]) {
  return exigir(
    await supabase().rpc("fin_importar_plano", { p_cliente: cliente, p_arquivo: arquivo, p_contas: contas as unknown as Json }),
  ) as { total: number; novas: number; inativadas: number };
}

/** Desfaz um extrato importado por engano (só se nenhum lançamento dele foi conciliado). */
export async function desfazerLote(lote: string) {
  return exigir(await supabase().rpc("fin_desfazer_lote", { p_lote: lote })) as { apagadas: number };
}

export async function importarExtrato(conta: string, arquivo: string, formato: "ofx" | "planilha", e: ExtratoLido) {
  const chaves = chavesDoArquivo(e.lancamentos);
  const linhas = e.lancamentos.map((l, k) => ({ ...l, chave: chaves[k] }));
  return exigir(
    await supabase().rpc("fin_importar_extrato", {
      p_conta: conta,
      p_arquivo: arquivo,
      p_formato: formato,
      p_inicio: e.inicio,
      p_fim: e.fim,
      p_saldo_final: e.saldoFinal,
      p_linhas: linhas as unknown as Json,
    }),
  ) as { lote_id: string; recebidas: number; novas: number; repetidas: number };
}
