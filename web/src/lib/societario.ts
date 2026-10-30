export type StatusFase =
  | "a_fazer"
  | "em_andamento"
  | "aguardando_cliente"
  | "aguardando_orgao"
  | "concluida"
  | "dispensada";

export interface SocTipo {
  id: string;
  codigo: string;
  nome: string;
  fases: { codigo: string; nome: string; prazo_dias: number }[];
  ativo: boolean;
  ordem: number;
}

export interface SocProcesso {
  id: string;
  org_id: string;
  numero: number;
  tipo_id: string;
  cliente_id: string | null;
  futuro_cliente: string | null;
  cnpj: string | null;
  uf: string | null;
  descricao: string | null;
  responsavel_id: string | null;
  status: "aberto" | "concluido" | "cancelado";
  fase_atual: number;
  exigencias: number;
  visivel_cliente: boolean;
  pedido_em: string;
  previsao_em: string | null;
  concluido_em: string | null;
  atualizado_em: string;
}

export interface SocFase {
  id: string;
  processo_id: string;
  ordem: number;
  codigo: string;
  nome: string;
  status: StatusFase;
  responsavel_id: string | null;
  prazo_dias: number | null;
  inicio_em: string | null;
  prazo_em: string | null;
  fim_em: string | null;
  mudou_em: string;
  tarefa_id: string | null;
}

export const STATUS_FASE: { id: StatusFase; nome: string; cor: string }[] = [
  { id: "a_fazer", nome: "A fazer", cor: "bg-neutral-100 text-neutral-700" },
  { id: "em_andamento", nome: "Em andamento", cor: "bg-sky-50 text-sky-800" },
  { id: "aguardando_cliente", nome: "Aguardando cliente", cor: "bg-violet-50 text-violet-800" },
  { id: "aguardando_orgao", nome: "Aguardando órgão", cor: "bg-amber-50 text-amber-800" },
  { id: "concluida", nome: "Concluída", cor: "bg-emerald-50 text-emerald-800" },
  { id: "dispensada", nome: "Dispensada", cor: "bg-neutral-50 text-neutral-400" },
];

export const nomeStatusFase = (s: StatusFase) => STATUS_FASE.find((x) => x.id === s)?.nome ?? s;
export const corStatusFase = (s: StatusFase) => STATUS_FASE.find((x) => x.id === s)?.cor ?? "";

/** Colunas do quadro: as fases padrão do desenho, na ordem. */
export const COLUNAS = [
  { codigo: "documentos", nome: "Documentos" },
  { codigo: "viabilidade", nome: "Viabilidade" },
  { codigo: "dbe", nome: "DBE / REDESIM" },
  { codigo: "elaboracao", nome: "Elaboração" },
  { codigo: "aprovacao", nome: "Aprovação do cliente" },
  { codigo: "assinaturas", nome: "Assinaturas" },
  { codigo: "protocolo", nome: "Protocolo" },
  { codigo: "exigencias", nome: "Exigências" },
  { codigo: "deferimento", nome: "Deferimento" },
  { codigo: "cnpj", nome: "CNPJ" },
  { codigo: "inscricoes", nome: "Inscrições e licenças" },
  { codigo: "entrega", nome: "Entrega" },
];

export const ORGAOS = ["JUCESP", "JUCEMG", "Receita Federal", "Prefeitura", "SEFAZ", "Bombeiros", "Vigilância Sanitária", "CETESB", "Outro"];

/** Dias desde a última mudança da fase. */
export function diasParado(mudou_em: string): number {
  return Math.floor((Date.now() - Date.parse(mudou_em)) / 864e5);
}
