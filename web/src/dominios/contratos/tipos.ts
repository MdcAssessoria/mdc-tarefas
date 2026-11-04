// Tipos do módulo Contratos (migração 041). As tabelas mantêm o prefixo fin_ porque cada contrato alimenta as contas
// a pagar/receber do Financeiro (fin_titulos.recorrente_id).
import type { TipoTitulo } from "@/dominios/financeiro/tipos";

export type IndiceRecorrente = "IPCA" | "IGP-M" | "INPC" | "fixo" | "nenhum";
/** Documento do mês de um contrato a receber (043): nota fiscal de serviço ou só a nota fatura. */
export type DocumentoFatura = "nfse" | "fatura";
/** O que vai ao cliente (043). "nf_fatura" = nota + fatura agora, boleto depois. */
export type EnvioFatura = "nf_fatura_boleto" | "nf_fatura" | "fatura_boleto" | "fatura";
export type CanalEnvio = "email" | "whatsapp" | "portal";
/** Banco do boleto pelo Ledgra Link (048/049). */
export type BancoBoleto = "itau" | "santander";
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
  /** Dia (1–28) em que a conta e a fatura nascem; vence no mesmo mês (048), então não passa do dia de vencer. */
  dia_geracao: number;
  canais: CanalEnvio[];
  email_envio: string | null;
  whatsapp_envio: string | null;
  /** Cadastro do cliente na carteira (para o Portal). */
  cliente_carteira_id: string | null;
  servico_descricao: string | null;
  servico_codigo: string | null;
  iss_aliquota: number | null;
  /** Banco do boleto (048), quando o envio tem boleto. */
  boleto_banco: BancoBoleto | null;
  /** Renovação automática: meses por renovação (048, padrão 12). */
  renovacao_meses: number;
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
  /** % proposto: o índice acumulado, mas nunca negativo (048: reajuste negativo mantém o valor). */
  percentual: number | null;
  /** O acumulado como veio do índice (pode ser negativo). */
  percentual_indice?: number | null;
  negativo_vira_zero?: boolean;
  valor_atual: number;
  valor_novo: number | null;
  contas_em_aberto: { id: string; competencia: string; valor: number }[];
  /** Contas do ciclo separadas (048, B-09). */
  contas?: {
    atualizaveis: { id: string; competencia: string; valor: number; fatura: string | null }[];
    ajuste_manual: { id: string; competencia: string; valor: number }[];
    documento_emitido: { id: string; competencia: string; valor: number; fatura: string | null }[];
    pagas: { id: string; competencia: string; valor: number; pago: number }[];
    diferenca_pagas: number;
  };
  indices_atualizados_em: string | null;
}

// ------------------------------------------------------------------------------------------------ NFS-e (046)

export type AmbienteNfse = "producao_restrita" | "producao";
export type ModoNfse = "conferir" | "automatico";
export type SituacaoEmissaoNfse = "enviando" | "emitida" | "rejeitada" | "erro";

/** Mensagem do Emissor Nacional: código e descrição oficiais e o texto em português simples. */
export interface MensagemNfse {
  codigo: string;
  descricao: string;
  complemento: string | null;
  texto: string;
}

/** Parâmetros da emissão (nfse_parametros). */
export interface ParametrosNfse {
  cliente_id: string;
  ambiente: AmbienteNfse;
  modo: ModoNfse;
  serie: string;
  op_simples: "1" | "2" | "3";
  reg_ap_trib_sn: "1" | "2" | "3" | null;
  reg_esp_trib: string;
  inscricao_municipal: string | null;
  codigo_municipio: string;
  nbs_padrao: string | null;
  p_tot_trib_sn: number | null;
  atualizado_em: string;
}

/** Próximo número da DPS por ambiente e série (nfse_numeracao). */
export interface NumeracaoNfse {
  cliente_id: string;
  ambiente: AmbienteNfse;
  serie: string;
  proximo: number;
}

/** Cada DPS enviada ao Emissor Nacional (nfse_emissoes). */
export interface EmissaoNfse {
  id: string;
  fatura_id: string;
  ambiente: AmbienteNfse;
  serie: string;
  ndps: number;
  id_dps: string;
  situacao: SituacaoEmissaoNfse;
  chave_acesso: string | null;
  numero_nfse: string | null;
  xml_caminho: string | null;
  mensagem: string | null;
  mensagens: MensagemNfse[];
  tentativas: number;
  enviado_em: string;
  respondido_em: string | null;
  criado_em: string;
}

/** Resposta de nfse_preparar: o que vai na DPS, o que falta e as tentativas anteriores. */
export interface PreparoNfse {
  pronto: boolean;
  pendencias: string[];
  pode_emitir: boolean;
  ambiente: AmbienteNfse | null;
  modo: ModoNfse | null;
  fatura: { id: string; numero: string; competencia: string; valor: number; vencimento: string; nfse_situacao: SituacaoNfse; nfse_numero: string | null };
  dps: {
    serie: string | null;
    proximo_ndps: number;
    dCompet: string;
    cLocEmi: string | null;
    prestador: { cnpj: string | null; nome: string | null; im: string | null; opSimpNac: string | null; regApTribSN: string | null; regEspTrib: string | null };
    tomador: { documento: string | null; nome: string | null; email: string | null };
    servico: { cLocPrestacao: string | null; cTribNac: string | null; descricao: string; cNBS: string | null };
    valores: { vServ: number; pTotTribSN: number | null };
  };
  iss: { aliquota_referencia: number | null; valor_estimado: number | null; retido: boolean };
  emissoes: Pick<EmissaoNfse, "id" | "ambiente" | "situacao" | "ndps" | "numero_nfse" | "chave_acesso" | "mensagem" | "mensagens" | "tentativas" | "enviado_em" | "respondido_em" | "xml_caminho">[];
}

/** Resposta da Função Edge nfse-emitir. */
export interface ResultadoEmissaoNfse {
  situacao: "emitida" | "rejeitada" | "erro";
  ambiente: AmbienteNfse;
  ambiente_nome: string;
  teste: boolean;
  ndps: number;
  numero?: string | null;
  chave?: string;
  xml_caminho?: string;
  recuperada?: boolean;
  mensagem: string | null;
  mensagens: MensagemNfse[];
}

// ------------------------------------------------------------------------------------------------ boleto (049)

export type SituacaoBoletoEmitido = "registrada" | "paga" | "paga_parcial" | "baixada" | "cancelada" | "vencida" | "rejeitada";

/** Boleto de uma fatura emitido pelo Ledgra Link (fin_fatura_boletos). */
export interface BoletoFatura {
  id: string;
  fatura_id: string;
  banco: BancoBoleto;
  tipo: "boleto" | "boleto_hibrido";
  situacao: SituacaoBoletoEmitido;
  valor: number;
  vencimento: string;
  linha_digitavel: string | null;
  pix_copia_cola: string | null;
  nosso_numero: string | null;
  tentativa: number;
  emitido_em: string;
}

/** Conta da MDC no Ledgra Link por banco (link_contas_banco). */
export interface ContaBancoLink {
  org_id: string;
  banco: BancoBoleto;
  codigo_compe: string;
  cliente_id: string;
  conta_link_id: string;
  fin_conta_id: string;
  tipo: "boleto" | "boleto_hibrido";
  ativo: boolean;
  atualizado_em: string;
}
