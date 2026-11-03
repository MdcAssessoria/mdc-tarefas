// Gravações do módulo Contratos: tudo pelas funções do banco (permissão do módulo Contratos conferida lá).
import { supabase } from "@/lib/supabase";
import { exigir } from "@/lib/exigir";
import { enviarArquivo } from "@/lib/arquivos/armazenamento";
import type { Json } from "@/lib/database.types";
import type { CanalEnvio, DocumentoFatura, EnvioFatura, IndiceRecorrente, PropostaReajuste } from "./tipos";

export interface DadosContrato {
  id?: string;
  cliente: string;
  tipo: "pagar" | "receber";
  pessoa?: string | null;
  /** Fornecedor/cliente digitado na hora: o banco acha pelo nome ou cadastra, junto com o contrato. */
  pessoa_nome?: string | null;
  descricao: string;
  numero?: string | null;
  objeto?: string | null;
  valor: number;
  dia: number;
  categoria: string;
  centro?: string | null;
  conta_prevista?: string | null;
  vigencia_inicio: string;
  vigencia_fim?: string | null;
  renovacao_automatica: boolean;
  aviso_dias: number;
  gera_contas: boolean;
  gerar_desde?: string | null;
  indice: IndiceRecorrente;
  percentual_fixo?: number | null;
  mes_reajuste?: number | null;
  observacao?: string | null;
  // faturamento (043; só contrato a receber — no a pagar o banco ignora)
  documento?: DocumentoFatura;
  envio?: EnvioFatura;
  dia_geracao?: number;
  canais?: CanalEnvio[];
  email_envio?: string | null;
  whatsapp_envio?: string | null;
  cliente_carteira?: string | null;
  servico_descricao?: string | null;
  servico_codigo?: string | null;
  iss_aliquota?: number | null;
}

/** Cria ou edita; ao criar, o banco já lança a conta do mês atual (devolve quantas lançou). */
export async function salvarContrato(c: DadosContrato) {
  return exigir(await supabase().rpc("fin_recorrente_salvar", { p: c as unknown as Json })) as { id: string; geradas: number };
}

export async function suspenderContrato(id: string, motivo: string) {
  exigir(await supabase().rpc("fin_recorrente_suspender", { p_contrato: id, p_motivo: motivo }));
}

export async function reativarContrato(id: string, motivo: string) {
  return exigir(await supabase().rpc("fin_recorrente_reativar", { p_contrato: id, p_motivo: motivo })) as { geradas: number };
}

export async function encerrarContrato(id: string, motivo: string) {
  exigir(await supabase().rpc("fin_recorrente_encerrar", { p_contrato: id, p_motivo: motivo }));
}

export async function propostaReajuste(id: string) {
  return exigir(await supabase().rpc("fin_recorrente_proposta", { p_contrato: id })) as unknown as PropostaReajuste;
}

export async function reajustarContrato(id: string, percentual: number, obs: string | null, atualizarAbertas: boolean) {
  return exigir(
    await supabase().rpc("fin_recorrente_reajustar", {
      p_contrato: id,
      p_percentual: percentual,
      p_obs: obs ?? undefined,
      p_atualizar_abertas: atualizarAbertas,
    }),
  ) as unknown as { valor: number; referencia: string; contas_atualizadas: number };
}

/** "Buscar índices agora": pede ao Banco Central (a resposta chega em segundos e é lida na próxima proposta). */
export async function atualizarIndices(cliente: string) {
  return exigir(await supabase().rpc("fin_indices_atualizar", { p_cliente: cliente })) as unknown as {
    pedidos: number;
    ultimos: Record<string, string> | null;
  };
}

/** Anexa um arquivo (contrato assinado, aditivo) e anota no histórico do contrato. */
export async function anexarArquivo(arquivo: File, contrato: { id: string; org_id: string; cliente_id: string }) {
  const a = await enviarArquivo(arquivo, { org: contrato.org_id, app: "contratos", ref: contrato.id, cliente: contrato.cliente_id });
  exigir(await supabase().rpc("fin_recorrente_anexo", { p_contrato: contrato.id, p_arquivo: a.id }));
  return a;
}

/** Cancela a fatura com motivo; a conta do mês em aberto e sem recebimento é cancelada junto. */
export async function cancelarFatura(id: string, motivo: string) {
  return exigir(await supabase().rpc("fin_fatura_cancelar", { p_fatura: id, p_motivo: motivo })) as unknown as {
    fatura: string;
    conta_cancelada: boolean;
  };
}

/** Gera à mão a conta/fatura de um mês (mês que a rotina não gerou, antes do dia de gerar ou depois de cancelar). */
export async function gerarFaturaAgora(contrato: string, competencia: string, motivo: string, vencimento?: string | null) {
  return exigir(
    await supabase().rpc("fin_fatura_gerar_agora", {
      p_contrato: contrato,
      p_competencia: competencia,
      p_motivo: motivo,
      p_vencimento: vencimento ?? undefined,
    }),
  ) as unknown as { titulo: string; fatura: string | null; numero: string | null; vencimento: string };
}
