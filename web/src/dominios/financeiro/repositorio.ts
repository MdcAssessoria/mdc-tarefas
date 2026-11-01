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

// ------------------------------------------------------------------ contas a pagar e a receber

export interface Lancamento {
  cliente: string;
  tipo: "pagar" | "receber";
  pessoa?: string | null;
  /** Fornecedor/cliente digitado na hora: o banco acha pelo nome ou cadastra, junto com o lançamento. */
  pessoa_nome?: string | null;
  categoria: string;
  centro?: string | null;
  conta_prevista?: string | null;
  descricao: string;
  documento?: string | null;
  emissao?: string | null;
  vencimento: string;
  valor: number;
  parcelas: number;
  observacao?: string | null;
  /** Já pago/recebido na hora (Entradas e saídas): baixa total em todas as parcelas. */
  pago?: { data: string; conta: string; forma?: string | null } | null;
}

export async function lancar(l: Lancamento) {
  return exigir(await supabase().rpc("fin_lancar", { p: l as unknown as Json })) as { titulos: string[]; grupo: string | null };
}

export async function baixar(b: {
  titulo: string;
  data: string;
  valor: number;
  conta: string;
  juros: number;
  multa: number;
  desconto: number;
  forma: string | null;
  obs: string | null;
}) {
  return exigir(
    await supabase().rpc("fin_baixar", {
      p_titulo: b.titulo,
      p_data: b.data,
      p_valor: b.valor,
      p_conta: b.conta,
      p_juros: b.juros,
      p_multa: b.multa,
      p_desconto: b.desconto,
      p_forma: b.forma ?? undefined,
      p_obs: b.obs ?? undefined,
    }),
  ) as { baixa: number; quitado: boolean; saldo: number };
}

export async function estornarBaixa(baixa: number, motivo: string) {
  exigir(await supabase().rpc("fin_estornar_baixa", { p_baixa: baixa, p_motivo: motivo }));
}

// ------------------------------------------------------------------ transferências entre contas (migração 034)

/** Transferência entre duas contas ativas da mesma empresa (a regra é conferida no banco, em fin_transferir). */
export async function transferir(t: { origem: string; destino: string; data: string; valor: number; obs?: string }) {
  return exigir(
    await supabase().rpc("fin_transferir", { p_origem: t.origem, p_destino: t.destino, p_data: t.data, p_valor: t.valor, p_obs: t.obs }),
  ) as number;
}

export async function estornarTransferencia(id: number, motivo: string) {
  exigir(await supabase().rpc("fin_estornar_transferencia", { p_id: id, p_motivo: motivo }));
}

export async function cancelarTitulo(titulo: string, motivo: string) {
  exigir(await supabase().rpc("fin_cancelar_titulo", { p_titulo: titulo, p_motivo: motivo }));
}

// ------------------------------------------------------------------ estoque

export async function movimentarEstoque(m: {
  item: string;
  local: string;
  data: string;
  tipo: "entrada" | "saida" | "ajuste" | "transferencia";
  quantidade: number;
  custo_unitario?: number | null;
  destino?: string | null;
  observacao?: string | null;
}) {
  return exigir(await supabase().rpc("est_movimentar", { p: m as unknown as Json })) as { movimentos: number[] };
}

export async function estornarMovimento(mov: number, motivo: string) {
  exigir(await supabase().rpc("est_estornar_movimento", { p_mov: mov, p_motivo: motivo }));
}

export async function definirEstoqueNegativo(cliente: string, permite: boolean) {
  exigir(await supabase().rpc("est_definir_negativo", { p_cliente: cliente, p_permite: permite }));
}
