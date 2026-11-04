// Gravações do módulo Contratos: tudo pelas funções do banco (permissão do módulo Contratos conferida lá).
import { supabase } from "@/lib/supabase";
import { exigir } from "@/lib/exigir";
import { enviarArquivo } from "@/lib/arquivos/armazenamento";
import type { Json } from "@/lib/database.types";
import { chamarFuncao } from "@/lib/funcoesEdge";
import type { CanalAutomatico, SituacaoEnvio } from "./envio";
import type {
  AmbienteNfse,
  BancoBoleto,
  CanalEnvio,
  DocumentoFatura,
  EnvioDaFatura,
  EnvioFatura,
  IndiceRecorrente,
  ModoNfse,
  ParametrosNfse,
  PreparoNfse,
  PropostaReajuste,
  ResultadoEmissaoNfse,
} from "./tipos";

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
  /** Meses de cada renovação automática (048; 1 a 60, padrão 12). */
  renovacao_meses?: number;
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
  /** Banco do boleto (048): itau ou santander, quando o envio tem boleto. */
  boleto_banco?: BancoBoleto | null;
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
  ) as unknown as {
    valor: number;
    referencia: string;
    contas_atualizadas: number;
    ajuste_manual?: number;
    documento_emitido?: number;
    diferenca_pagas?: number;
    /** Outro ciclo antigo já pendente (048, B-05). */
    proximo?: string | null;
  };
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

// ------------------------------------------------------------------------------------------------ NFS-e (046)

/** O que vai na nota da fatura, o que falta e as tentativas anteriores (Contratos: ver). */
export async function prepararNfse(fatura: string) {
  return exigir(await supabase().rpc("nfse_preparar", { p_fatura: fatura })) as unknown as PreparoNfse;
}

/**
 * Emite a NFS-e da fatura pela Função Edge nfse-emitir (que confere a permissão no banco, reserva o número da DPS,
 * assina com o certificado A1 da MDC e envia ao Emissor Nacional). Recusa e falta de resposta voltam como resultado
 * (situacao), não como erro; erro é só o que impediu de tentar (permissão, pendência, envio em andamento).
 */
export async function emitirNfse(fatura: string) {
  return chamarFuncao<ResultadoEmissaoNfse>("nfse-emitir", { corpo: { fatura } });
}

export interface DadosParametrosNfse {
  cliente: string;
  ambiente: AmbienteNfse;
  modo: ModoNfse;
  serie: string;
  reg_ap_trib_sn: string;
  reg_esp_trib: string;
  inscricao_municipal: string | null;
  codigo_municipio: string;
  nbs_padrao: string | null;
  p_tot_trib_sn: number | null;
  proximo_ndps?: number | null;
  confirmo_producao?: boolean;
  /** Ligar o modo automático pede a confirmação de que a nota pode sair sem ninguém conferir (052). */
  confirmo_automatico?: boolean;
}

/** Salva os parâmetros da emissão (Contratos: gerir). Ir para produção pede confirmo_producao; ligar o automático, confirmo_automatico. */
export async function salvarParametrosNfse(p: DadosParametrosNfse) {
  return exigir(await supabase().rpc("nfse_parametros_salvar", { p: { ...p, op_simples: "3" } as unknown as Json })) as unknown as ParametrosNfse & {
    proximo_ndps: number | null;
  };
}

// ------------------------------------------------------------------------------------------------ boleto (049)

/**
 * Gera o boleto da fatura pelo Ledgra Link (Função Edge ledgra-link, com o login de quem pede: Contratos operar).
 * O banco é o do contrato (Itaú ou Santander); a recusa vem em português.
 */
export async function gerarBoletoFatura(fatura: string) {
  return chamarFuncao<{ linha_digitavel: string | null; pix_copia_cola: string | null; vencimento: string; aviso: string | null }>(
    "ledgra-link",
    { corpo: { acao: "emitir_fatura", fatura } },
  );
}

/** Liga a conta de um banco no Ledgra Link para o boleto das faturas (Contratos: gerir). */
export async function salvarContaBanco(c: {
  banco: BancoBoleto;
  conta_link_id: string;
  fin_conta: string;
  tipo: "boleto" | "boleto_hibrido";
  ativo: boolean;
}) {
  return exigir(await supabase().rpc("link_salvar_banco", { p: c as unknown as Json }));
}

// ------------------------------------------------------------------------------------------------ envio (053)

/** Estado dos canais, contagem da fila e os últimos problemas (Contratos: ver). */
export async function lerSituacaoEnvio(org: string) {
  return exigir(await supabase().rpc("fin_envio_situacao", { p_org: org })) as unknown as SituacaoEnvio;
}

/** Volta o envio para a fila agora (Contratos: operar; motivo com 5 letras; fica no histórico do contrato). */
export async function reenviarEnvio(envio: number, motivo: string) {
  return exigir(await supabase().rpc("fin_envio_reenviar", { p_envio: envio, p_motivo: motivo })) as unknown as { situacao: EnvioDaFatura["situacao"] };
}

/** Pede para a fatura-enviar conferir os segredos e a conexão de cada canal agora. */
export async function conferirEnvio(org: string) {
  return chamarFuncao<{ canais: Record<CanalAutomatico, { configurado: boolean; detalhe: string; faltam: string[] }> }>("fatura-enviar", {
    corpo: { acao: "situacao", org },
  });
}

/** Manda uma mensagem de teste (Contratos: gerir; até 5 por hora). */
export async function testarEnvio(org: string, canal: CanalAutomatico, destino: string) {
  return chamarFuncao<{ ok: boolean; mensagem?: string; erro?: string }>("fatura-enviar", { corpo: { acao: "teste", org, canal, destino } });
}
