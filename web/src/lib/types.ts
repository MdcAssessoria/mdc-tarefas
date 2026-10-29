export type Papel = "admin" | "gestor" | "analista" | "tv";
export type Status = "a_fazer" | "em_andamento" | "aguardando" | "concluida" | "cancelada";
export type Prioridade = "baixa" | "media" | "alta" | "urgente";

export interface Organizacao {
  id: string;
  nome: string;
  slug: string;
  cnpj: string | null;
  logo_url: string | null;
  cor_primaria: string;
  cor_destaque: string;
  fuso: string;
}

export interface Membro {
  org_id: string;
  user_id: string;
  nome: string;
  email: string | null;
  papel: Papel;
  setor_id: string | null;
  ativo: boolean;
}

export interface Setor {
  id: string;
  org_id: string;
  nome: string;
  cor: string;
  ordem: number;
  ativo: boolean;
}

export interface Cliente {
  id: string;
  org_id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string | null;
  regime: string | null;
  ativo: boolean;
  codigo_dominio?: string | null;
  cidade?: string | null;
  uf?: string | null;
  inicio_em?: string | null;
  inativo_em?: string | null;
  motivo_inativacao?: string | null;
  cliente_desde?: string | null;
  situacao_dominio?: string | null;
}

export interface Tarefa {
  id: string;
  org_id: string;
  titulo: string;
  descricao: string | null;
  cliente_id: string | null;
  setor_id: string | null;
  responsavel_id: string | null;
  criado_por: string | null;
  status: Status;
  prioridade: Prioridade;
  prazo: string | null;
  competencia: string | null;
  modelo_id: string | null;
  concluida_em: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface Modelo {
  id: string;
  org_id: string;
  titulo: string;
  descricao: string | null;
  setor_id: string | null;
  prioridade: Prioridade;
  por_cliente: boolean;
  regimes: string[] | null;
  meses: number[] | null;
  dia_vencimento: number;
  meses_apos_competencia: number;
  ajuste: "antecipa" | "posterga" | "nenhum";
  ativo: boolean;
}

export const STATUS: { id: Status; nome: string }[] = [
  { id: "a_fazer", nome: "A fazer" },
  { id: "em_andamento", nome: "Em andamento" },
  { id: "aguardando", nome: "Aguardando" },
  { id: "concluida", nome: "Concluída" },
  { id: "cancelada", nome: "Cancelada" },
];

export const PRIORIDADES: { id: Prioridade; nome: string }[] = [
  { id: "baixa", nome: "Baixa" },
  { id: "media", nome: "Média" },
  { id: "alta", nome: "Alta" },
  { id: "urgente", nome: "Urgente" },
];

export const REGIMES: { id: string; nome: string }[] = [
  { id: "simples", nome: "Simples Nacional" },
  { id: "presumido", nome: "Lucro Presumido" },
  { id: "real", nome: "Lucro Real" },
  { id: "mei", nome: "MEI" },
  { id: "imune_isenta", nome: "Imune/Isenta" },
  { id: "pf", nome: "Pessoa física" },
  { id: "outro", nome: "Outro" },
];

export const PAPEIS: { id: Papel; nome: string }[] = [
  { id: "admin", nome: "Administrador" },
  { id: "gestor", nome: "Gestor" },
  { id: "analista", nome: "Analista" },
  { id: "tv", nome: "Painel TV (somente leitura)" },
];

export const nomeStatus = (s: Status) => STATUS.find((x) => x.id === s)?.nome ?? s;
export const nomePrioridade = (p: Prioridade) => PRIORIDADES.find((x) => x.id === p)?.nome ?? p;
