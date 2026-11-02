// Regras da lista de tarefas (sem tela): situação de cada tarefa, filtros por situação, contagens dos indicadores,
// tom das etiquetas e ordem da lista. "hoje" é sempre o dia AAAA-MM-DD no fuso da organização (hojeISO(org.fuso)).
// Testado em regras.test.ts.
import { rotuloPrazo } from "@/lib/datas";
import type { Tom } from "@/components/ui/Tons";
import type { Prioridade, Status, Tarefa } from "./tipos";

/** Situações que ainda pedem trabalho (cancelada e concluída não contam como pendentes nem atrasadas). */
export const ABERTAS: Status[] = ["a_fazer", "em_andamento", "aguardando"];
export const estaAberta = (s: Status) => ABERTAS.includes(s);

/** Dias corridos de `hoje` até `data` (negativo = já passou). null quando não há data. */
export function diasEntre(hoje: string, data: string | null): number | null {
  if (!data) return null;
  return Math.round((Date.parse(data.slice(0, 10) + "T00:00:00Z") - Date.parse(hoje.slice(0, 10) + "T00:00:00Z")) / 86_400_000);
}

export type FiltroSituacao = "abertas" | "atrasadas" | "hoje" | "semana" | "concluidas" | "canceladas" | "todas";
export const FILTROS_SITUACAO: { id: FiltroSituacao; nome: string }[] = [
  { id: "abertas", nome: "Em aberto" },
  { id: "atrasadas", nome: "Atrasadas" },
  { id: "hoje", nome: "Vencem hoje" },
  { id: "semana", nome: "Próximos 7 dias" },
  { id: "concluidas", nome: "Concluídas" },
  { id: "canceladas", nome: "Canceladas" },
  { id: "todas", nome: "Todas" },
];

/**
 * A tarefa entra no filtro de situação? `comConcluidas` (visão em quadro) faz "Em aberto" mostrar também a coluna
 * das concluídas. Atrasada = aberta com prazo antes de hoje; próximos 7 dias = aberta com prazo de hoje até hoje + 7.
 */
export function passaSituacao(t: Pick<Tarefa, "status" | "prazo">, f: FiltroSituacao, hoje: string, comConcluidas = false): boolean {
  const aberta = estaAberta(t.status);
  const d = diasEntre(hoje, t.prazo);
  switch (f) {
    case "abertas":
      return aberta || (comConcluidas && t.status === "concluida");
    case "atrasadas":
      return aberta && d !== null && d < 0;
    case "hoje":
      return aberta && d === 0;
    case "semana":
      return aberta && d !== null && d >= 0 && d <= 7;
    case "concluidas":
      return t.status === "concluida";
    case "canceladas":
      return t.status === "cancelada";
    default:
      return true;
  }
}

export interface Contagem {
  abertas: number;
  atrasadas: number;
  hoje: number;
  semana: number;
  concluidas: number;
}

/** Números dos indicadores. Só tarefas abertas entram em atrasadas/hoje/7 dias; canceladas não entram em nada. */
export function contarTarefas(tarefas: Pick<Tarefa, "status" | "prazo">[], hoje: string): Contagem {
  const c: Contagem = { abertas: 0, atrasadas: 0, hoje: 0, semana: 0, concluidas: 0 };
  for (const t of tarefas) {
    if (t.status === "concluida") c.concluidas++;
    if (!estaAberta(t.status)) continue;
    c.abertas++;
    const d = diasEntre(hoje, t.prazo);
    if (d === null) continue;
    if (d < 0) c.atrasadas++;
    else if (d === 0) c.hoje++;
    if (d >= 0 && d <= 7) c.semana++;
  }
  return c;
}

/** Tom da etiqueta de prazo: vermelho = atrasada, âmbar = vence hoje, azul = a vencer, verde = feita, cinza = resto. */
export function tomDoPrazo(prazo: string | null, status: Status, hoje: string): Tom {
  if (status === "concluida") return "verde";
  if (status === "cancelada") return "neutro";
  const d = diasEntre(hoje, prazo);
  if (d === null) return "neutro";
  if (d < 0) return "vermelho";
  if (d === 0) return "ambar";
  return "azul";
}

/** Texto da etiqueta de prazo de uma tarefa aberta ("Atrasada 2 dias", "Vence hoje", "Em 5 dias"). */
export const textoDoPrazo = (prazo: string | null, hoje: string) => rotuloPrazo(diasEntre(hoje, prazo));

export const TOM_STATUS: Record<Status, Tom> = {
  a_fazer: "neutro",
  em_andamento: "azul",
  aguardando: "violeta",
  concluida: "verde",
  cancelada: "neutro",
};

const PESO_PRIORIDADE: Record<Prioridade, number> = { urgente: 0, alta: 1, media: 2, baixa: 3 };

/** Ordem da lista: prazo mais próximo primeiro (sem prazo no fim) e, no mesmo prazo, a mais urgente primeiro. */
export function ordenarTarefas<T extends Pick<Tarefa, "prazo" | "prioridade">>(lista: T[]): T[] {
  return [...lista].sort((a, b) => {
    const pa = a.prazo ?? "9999";
    const pb = b.prazo ?? "9999";
    if (pa !== pb) return pa < pb ? -1 : 1;
    return PESO_PRIORIDADE[a.prioridade] - PESO_PRIORIDADE[b.prioridade];
  });
}
