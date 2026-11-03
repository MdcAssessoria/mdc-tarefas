// Tipos do módulo Contratos (migração 041). As tabelas mantêm o prefixo fin_ porque cada contrato alimenta as contas
// a pagar/receber do Financeiro (fin_titulos.recorrente_id).
import type { TipoTitulo } from "@/dominios/financeiro/tipos";

export type IndiceRecorrente = "IPCA" | "IGP-M" | "INPC" | "fixo" | "nenhum";
/** Documento do mês de um contrato a receber (043): nota fiscal de serviço ou só a nota fatura. */
export type DocumentoFatura = "nfse" | "fatura";
/** O que vai ao cliente (043). "nf_fatura" = nota + fatura agora, boleto depois. */
export type EnvioFatura = "nf_fatura_boleto" | "nf_fatura" | "fatura_boleto" | "fatura";
export type CanalEnvio = "email" | "whatsapp" | "portal";
export type SituacaoRecorrente = "ativo" | "suspenso" | "encerrado";

export interface Recorrente {
  id: string;
  org_id: string;
  cliente_id: string;
  tipo: TipoTitulo;
  pessoa_id: string;
  descricao: string;
  numero: string | null;
  objeto: string | null;
  valor: number;
  dia_vencimento: number;
  categoria_id: string;
  centro_id: string | null;
  conta_prevista_id: string | null;
  /** Início da vigência (data) e fim (vazio = prazo indeterminado). */
  vigencia_inicio: string;
  vigencia_fim: string | null;
  renovacao_automatica: boolean;
  aviso_dias: number;
  /** false = só guarda o documento e a vigência (não lança contas). */
  gera_contas: boolean;
  /** Mês (dia 1) do início: aniversário do reajuste. */
  inicio: string;
  /** Primeiro mês que o HUB lança. */
  gerar_desde: string;
  /** Último mês com conta (vazio = sem prazo). */
  fim: string | null;
  indice: IndiceRecorrente;
  percentual_fixo: number | null;
  mes_reajuste: number | null;
  situacao: SituacaoRecorrente;
  situacao_motivo: string | null;
  situacao_em: string | null;
  encerrado_em: string | null;
  ultima_competencia: string | null;
  mes_cadastro: string;
  observacao: string | null;
  criado_em: string;
  // faturamento (043; só contrato a receber usa)
  documento: DocumentoFatura;
  envio: EnvioFatura;
  /** Dia (1–28) em que a conta e a fatura nascem. Vencimento <= dia de gerar → vence no mês seguinte. */
  dia_geracao: number;
  canais: CanalEnvio[];
  email_envio: string | null;
  whatsapp_envio: string | null;
  /** Cadastro do cliente na carteira (para o Portal). */
  cliente_carteira_id: string | null;
  servico_descricao: string | null;
  servico_codigo: string | null;
  iss_aliquota: number | null;
}

export type SituacaoFatura = "gerada" | "aguardando_nf" | "pronta" | "enviada" | "cancelada";
export type SituacaoNfse = "nao_se_aplica" | "a_emitir" | "emitida" | "erro";
export type SituacaoBoleto = "nao_se_aplica" | "a_definir" | "gerado";

/** Fatura de um contrato a receber (fin_faturas, 043). */
export interface Fatura {
  id: string;
  org_id: string;
  cliente_id: string;
  recorrente_id: string;
  titulo_id: string;
  pessoa_id: string;
  cliente_carteira_id: string | null;
  ano: number;
  sequencia: number;
  /** "AAAA/NNNNN" */
  numero: string;
  competencia: string;
  emissao: string;
  vencimento: string;
  valor: number;
  descricao: string;
  servico_codigo: string | null;
  iss_aliquota: number | null;
  documento: DocumentoFatura;
  envio: EnvioFatura;
  situacao: SituacaoFatura;
  nfse_situacao: SituacaoNfse;
  nfse_numero: string | null;
  boleto_situacao: SituacaoBoleto;
  origem: "rotina" | "manual";
  motivo_manual: string | null;
  cancelada_em: string | null;
  cancelamento_motivo: string | null;
  criado_em: string;
}

/** Item da fila de envio (fin_envios, 043). */
export interface EnvioDaFatura {
  id: number;
  fatura_id: string;
  canal: CanalEnvio;
  destino: string;
  conteudo: ("nfse" | "fatura" | "boleto")[];
  situacao: "pendente" | "enviado" | "erro" | "aguardando_configuracao" | "cancelado";
  tentativas: number;
  ultimo_erro: string | null;
  enviado_em: string | null;
}

export interface ReajusteRecorrente {
  id: number;
  recorrente_id: string;
  origem: "reajuste" | "edicao";
  referencia: string | null;
  indice: string | null;
  percentual: number | null;
  percentual_proposto: number | null;
  valor_antes: number;
  valor_depois: number;
  titulos_atualizados: number;
  observacao: string | null;
  em: string;
}

export type TipoEvento =
  | "criado"
  | "editado"
  | "valor"
  | "conta"
  | "reajuste"
  | "suspenso"
  | "reativado"
  | "encerrado"
  | "renovado"
  | "aviso"
  | "anexo"
  | "fatura";

export interface EventoContrato {
  id: number;
  recorrente_id: string;
  tipo: TipoEvento;
  texto: string;
  por: string | null;
  em: string;
}

/** Resposta de fin_recorrente_proposta. */
export interface PropostaReajuste {
  contrato: string;
  referencia: string;
  pendente: boolean;
  tipo: IndiceRecorrente;
  indice: string;
  de?: string;
  ate?: string;
  meses: number;
  faltam: string[];
  percentual: number | null;
  valor_atual: number;
  valor_novo: number | null;
  contas_em_aberto: { id: string; competencia: string; valor: number }[];
  indices_atualizados_em: string | null;
}
