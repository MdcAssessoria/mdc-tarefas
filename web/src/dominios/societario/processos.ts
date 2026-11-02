// Tipos e regras puras do Societário (processos de abertura, alteração e baixa): nomes e cores das situações,
// colunas do quadro, destinos possíveis ao avançar e os passos que o avanço grava, e os destaques da lista.
import type { Tom } from "@/components/ui/Tons";

export type StatusFase = "a_fazer" | "em_andamento" | "aguardando_cliente" | "aguardando_orgao" | "concluida" | "dispensada";

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

/** Situações da fase, com o tom do Chip (mesmo significado em todo o HUB: violeta = esperando o cliente). */
export const STATUS_FASE: { id: StatusFase; nome: string; tom: Tom }[] = [
  { id: "a_fazer", nome: "A fazer", tom: "neutro" },
  { id: "em_andamento", nome: "Em andamento", tom: "azul" },
  { id: "aguardando_cliente", nome: "Aguardando cliente", tom: "violeta" },
  { id: "aguardando_orgao", nome: "Aguardando órgão", tom: "ambar" },
  { id: "concluida", nome: "Concluída", tom: "verde" },
  { id: "dispensada", nome: "Dispensada", tom: "neutro" },
];

export const nomeStatusFase = (s: StatusFase) => STATUS_FASE.find((x) => x.id === s)?.nome ?? s;
export const tomStatusFase = (s: StatusFase): Tom => STATUS_FASE.find((x) => x.id === s)?.tom ?? "neutro";

/** Nome e tom da situação do processo inteiro. */
export function situacaoProcesso(p: Pick<SocProcesso, "status">): { nome: string; tom: Tom } {
  if (p.status === "concluido") return { nome: "Concluído", tom: "verde" };
  if (p.status === "cancelado") return { nome: "Cancelado", tom: "neutro" };
  return { nome: "Em andamento", tom: "azul" };
}

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

export const ORGAOS = [
  "JUCESP",
  "JUCEMG",
  "Receita Federal",
  "Prefeitura",
  "SEFAZ",
  "Bombeiros",
  "Vigilância Sanitária",
  "CETESB",
  "Outro",
];

/** Dias desde a última mudança da fase. */
export function diasParado(mudou_em: string, agora = Date.now()): number {
  return Math.floor((agora - Date.parse(mudou_em)) / 864e5);
}

/** A partir de quantos dias sem mudar a fase o processo conta como "parado" (indicador e painel). */
export const DIAS_PARADO = 5;

/** Fase em que o processo está agora (a de ordem = fase_atual). */
export function faseAtualDe(p: Pick<SocProcesso, "id" | "fase_atual">, fases: SocFase[]): SocFase | undefined {
  return fases.find((f) => f.processo_id === p.id && f.ordem === p.fase_atual);
}

/**
 * Fases para onde o processo pode avançar: as que vêm depois da atual e ainda não foram concluídas nem dispensadas.
 * `fasesDoProcesso` são só as fases deste processo.
 */
export function destinosParaAvancar(fasesDoProcesso: SocFase[], atual: SocFase): SocFase[] {
  return fasesDoProcesso
    .filter((f) => f.ordem > atual.ordem && f.status !== "concluida" && f.status !== "dispensada")
    .sort((a, b) => a.ordem - b.ordem);
}

/**
 * Passos gravados (soc_mudar_fase) para levar o processo da fase atual até o destino: as intermediárias pendentes
 * são dispensadas primeiro e a atual é concluída por último, para o processo saltar direto ao destino.
 * Devolve uma mensagem (texto) quando o avanço não é possível.
 */
export function passosParaAvancar(
  fasesDoProcesso: SocFase[],
  atual: SocFase,
  destino: SocFase,
): { fase: string; status: "concluida" | "dispensada" }[] | string {
  if (destino.ordem <= atual.ordem) return "Só é possível avançar para uma fase à frente da atual.";
  if (destino.status === "dispensada") return `A fase "${destino.nome}" está dispensada neste processo.`;
  if (destino.status === "concluida") return `A fase "${destino.nome}" já foi concluída.`;
  const intermediarias = fasesDoProcesso
    .filter((f) => f.ordem > atual.ordem && f.ordem < destino.ordem && f.status !== "concluida" && f.status !== "dispensada")
    .sort((a, b) => a.ordem - b.ordem)
    .map((f) => ({ fase: f.id, status: "dispensada" as const }));
  const daAtual = atual.status === "concluida" || atual.status === "dispensada" ? [] : [{ fase: atual.id, status: "concluida" as const }];
  return [...intermediarias, ...daAtual];
}

/** Destaques da lista (os indicadores clicáveis). */
export type Destaque = "" | "atrasada" | "previsao" | "exigencia";

export const NOMES_DESTAQUE: Record<Exclude<Destaque, "">, string> = {
  atrasada: "Fase atrasada",
  previsao: "Previsão vencida",
  exigencia: "Com exigência",
};

/** Confere se o processo (em andamento) entra no destaque escolhido. `hoje` em AAAA-MM-DD no fuso da organização. */
export function passaDestaque(
  p: Pick<SocProcesso, "status" | "exigencias" | "previsao_em">,
  fase: Pick<SocFase, "prazo_em"> | undefined,
  destaque: Destaque,
  hoje: string,
): boolean {
  if (!destaque) return true;
  if (p.status !== "aberto") return false;
  if (destaque === "atrasada") return !!fase?.prazo_em && fase.prazo_em < hoje;
  if (destaque === "previsao") return !!p.previsao_em && p.previsao_em < hoje;
  return p.exigencias > 0;
}

/** Processo em andamento cuja fase atual está há `dias` ou mais sem mudar (0 = não filtra). */
export function paradoHa(
  p: Pick<SocProcesso, "status">,
  fase: Pick<SocFase, "mudou_em"> | undefined,
  dias: number,
  agora = Date.now(),
): boolean {
  if (!dias) return true;
  return p.status === "aberto" && !!fase && diasParado(fase.mudou_em, agora) >= dias;
}

/** Linha pronta para as telas de lista e quadro: o processo, a fase atual e os textos já resolvidos. */
export interface LinhaProcesso {
  p: SocProcesso;
  /** Fase atual (só faz sentido com o processo em andamento). */
  f: SocFase | undefined;
  cliente: string;
  tipo: string;
  responsavel: string;
  /** Dias desde a última mudança da fase atual (processo em andamento). */
  naFase: number | null;
  /** Dias até o prazo da fase atual (negativo = atrasada). */
  prazo: number | null;
}
