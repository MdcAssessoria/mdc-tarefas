// Tipos de tarefas: situação, prioridade, tarefa e modelo de obrigação recorrente, com os nomes para a tela.

export type Status = "a_fazer" | "em_andamento" | "aguardando" | "concluida" | "cancelada";
export type Prioridade = "baixa" | "media" | "alta" | "urgente";

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
  visivel_cliente?: boolean | null;
  pendencia_cliente?: string | null;
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
  visivel_cliente?: boolean;
  segmentos?: string[] | null;
  grupos?: string[] | null;
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

export const nomeStatus = (s: Status) => STATUS.find((x) => x.id === s)?.nome ?? s;
export const nomePrioridade = (p: Prioridade) => PRIORIDADES.find((x) => x.id === p)?.nome ?? p;
