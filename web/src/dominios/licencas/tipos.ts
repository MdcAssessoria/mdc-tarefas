// Tipos do módulo Licenças (migração 031): módulos vendáveis, planos, contratos, mensalidades, baixas, reajustes e
// bloqueios. Espelham as tabelas lic_*; datas como texto AAAA-MM-DD e valores como número.

export interface Produto {
  id: string;
  org_id: string;
  slug: string;
  nome: string;
  descricao: string;
  preco: number;
  ativo: boolean;
  ordem: number;
}

export interface Plano {
  id: string;
  org_id: string;
  nome: string;
  descricao: string;
  preco: number;
  ativo: boolean;
  /** Ids dos módulos do plano (de lic_plano_produtos). */
  produtos: string[];
}

export type IndiceReajuste = "IPCA" | "IGP-M" | "INPC" | "fixo" | "nenhum";

export const INDICES: { id: IndiceReajuste; nome: string; dica: string }[] = [
  { id: "IPCA", nome: "IPCA", dica: "Inflação oficial (IBGE). O mais usado." },
  { id: "IGP-M", nome: "IGP-M", dica: "Índice da FGV, comum em aluguéis." },
  { id: "INPC", nome: "INPC", dica: "Inflação das famílias de menor renda (IBGE)." },
  { id: "fixo", nome: "Percentual combinado", dica: "Um percentual acertado com o cliente." },
  { id: "nenhum", nome: "Sem reajuste", dica: "O valor não muda todo ano." },
];

export interface Contrato {
  id: string;
  org_id: string;
  cliente_id: string;
  plano_id: string | null;
  valor_tabela: number;
  valor_mensal: number;
  dia_vencimento: number;
  inicio: string;
  fim: string | null;
  proporcional: boolean;
  reajuste_indice: IndiceReajuste;
  reajuste_mes: number | null;
  ultimo_reajuste: string | null;
  situacao: "ativo" | "encerrado";
  encerrado_em: string | null;
  encerrado_motivo: string | null;
  observacao: string | null;
  criado_em: string;
  /** Ids dos módulos do contrato (de lic_contrato_produtos). */
  produtos: string[];
}

export type SituacaoCobranca = "aberta" | "paga" | "cancelada";

export interface Cobranca {
  id: string;
  org_id: string;
  cliente_id: string;
  contrato_id: string;
  competencia: string;
  vencimento: string;
  descricao: string;
  valor: number;
  situacao: SituacaoCobranca;
  pago_em: string | null;
  valor_pago: number | null;
  cancelada_em: string | null;
  cancelado_motivo: string | null;
  observacao: string | null;
  criado_em: string;
}

export interface BaixaLicenca {
  id: number;
  cobranca_id: string;
  cliente_id: string;
  data: string;
  valor: number;
  juros: number;
  desconto: number;
  total: number;
  forma: string | null;
  observacao: string | null;
  estornada: boolean;
  estorno_motivo: string | null;
  estornada_em: string | null;
  em: string;
}

export interface Reajuste {
  id: number;
  contrato_id: string;
  cliente_id: string;
  data: string;
  indice: string;
  percentual: number;
  valor_antes: number;
  valor_depois: number;
  observacao: string | null;
}

export interface Bloqueio {
  id: number;
  cliente_id: string;
  bloqueado_em: string;
  bloqueado_por: string | null;
  motivo: string;
  desbloqueado_em: string | null;
  desbloqueado_por: string | null;
  motivo_desbloqueio: string | null;
}

export interface Parametros {
  org_id: string;
  dias_sugerir_bloqueio: number;
}

/** Situação do cliente para o Portal (função portal_licenca_situacao). */
export interface SituacaoPortal {
  bloqueado: boolean;
  modulos: { slug: string; nome: string }[];
}
