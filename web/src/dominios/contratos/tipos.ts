// Tipos do módulo Contratos (migração 041). As tabelas mantêm o prefixo fin_ porque cada contrato alimenta as contas
// a pagar/receber do Financeiro (fin_titulos.recorrente_id).
import type { TipoTitulo } from "@/dominios/financeiro/tipos";

export type IndiceRecorrente = "IPCA" | "IGP-M" | "INPC" | "fixo" | "nenhum";
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
  | "anexo";

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
