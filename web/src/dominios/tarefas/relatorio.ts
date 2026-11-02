// Cálculos do relatório de tarefas concluídas (sem tela): limites do período no fuso da organização, dias de atraso,
// filtro por pessoa e setor, resumo por pessoa e totais. Testado em relatorio.test.ts.
//
// Regras (corrigidas na revisão de 02/11/2026):
// - o período vale pelo dia da organização (inicioDoDiaUtc), não por "T03:00Z" fixo;
// - concluída no dia X conta pelo dia X no fuso da organização (não pelo dia em UTC);
// - "Abertas" e "Vencidas" são a situação de hoje e respeitam os mesmos filtros de pessoa e setor da tela;
// - tarefa cancelada não entra em nada; tarefa sem responsável aparece como "Sem responsável";
// - o atraso médio do total é a média ponderada (soma dos dias / quantidade), não a média das médias.
import { diaNoFuso, inicioDoDiaUtc, somarDias } from "@/lib/datas";
import { diasEntre } from "./regras";

export interface Concluida {
  id: string;
  titulo: string;
  cliente_id: string | null;
  setor_id: string | null;
  responsavel_id: string | null;
  prazo: string | null;
  concluida_em: string;
  competencia: string | null;
}

/** Tarefa aberta (a fazer, em andamento ou aguardando), só o que o resumo precisa. */
export interface Aberta {
  responsavel_id: string | null;
  setor_id: string | null;
  prazo: string | null;
}

export interface PorPessoa {
  /** user_id ou "_sem" (sem responsável). */
  id: string;
  nome: string;
  total: number;
  noPrazo: number;
  atrasadas: number;
  semPrazo: number;
  somaAtraso: number;
  diasAtrasoMedio: number | null;
  abertas: number;
  vencidas: number;
}

export type Totais = Omit<PorPessoa, "id" | "nome">;

export const SEM = "_sem";
const chave = (id: string | null) => id ?? SEM;

/**
 * Limites em UTC para filtrar `concluida_em` pelo dia da organização: `desde` (inclusive) e `antes` (exclusive).
 * Sem data (período "Tudo") o lado fica sem limite.
 */
export function limitesDoPeriodo(intervalo: { de?: string; ate?: string }, fuso: string): { desde?: string; antes?: string } {
  return {
    desde: intervalo.de ? inicioDoDiaUtc(intervalo.de, fuso) : undefined,
    antes: intervalo.ate ? inicioDoDiaUtc(somarDias(intervalo.ate, 1), fuso) : undefined,
  };
}

/** Dia (AAAA-MM-DD) em que a tarefa foi concluída, no fuso da organização. */
export const diaDaConclusao = (t: Pick<Concluida, "concluida_em">, fuso: string) => diaNoFuso(t.concluida_em, fuso);

/** Dias de atraso na conclusão (0 ou negativo = no prazo); null quando a tarefa não tinha prazo. */
export function diasDeAtraso(t: Pick<Concluida, "prazo" | "concluida_em">, fuso: string): number | null {
  if (!t.prazo) return null;
  return diasEntre(t.prazo, diaDaConclusao(t, fuso));
}

export function situacaoDaConclusao(d: number | null): string {
  if (d === null) return "Sem prazo";
  if (d <= 0) return "No prazo";
  return d === 1 ? "1 dia de atraso" : `${d} dias de atraso`;
}

/** Aplica os filtros de pessoa e setor (lista vazia = todos; "_sem" = sem responsável / sem setor). */
export function filtrarPessoaSetor<T extends { responsavel_id: string | null; setor_id: string | null }>(
  lista: T[],
  pessoas: string[],
  setores: string[],
): T[] {
  return lista.filter(
    (t) => (!pessoas.length || pessoas.includes(chave(t.responsavel_id))) && (!setores.length || setores.includes(chave(t.setor_id))),
  );
}

/**
 * Resumo por pessoa. Recebe as listas já filtradas (filtrarPessoaSetor). Toda pessoa com concluída no período ou com
 * tarefa aberta aparece (inclusive quem saiu da equipe e ainda tem tarefa aberta, para nada ficar escondido).
 */
export function resumirPorPessoa(
  concluidas: Pick<Concluida, "responsavel_id" | "prazo" | "concluida_em">[],
  abertas: Aberta[],
  hoje: string,
  fuso: string,
  nomePessoa: (id: string | null) => string,
): PorPessoa[] {
  const m = new Map<string, PorPessoa>();
  const linha = (id: string) => {
    let p = m.get(id);
    if (!p) {
      p = {
        id,
        nome: nomePessoa(id === SEM ? null : id),
        total: 0,
        noPrazo: 0,
        atrasadas: 0,
        semPrazo: 0,
        somaAtraso: 0,
        diasAtrasoMedio: null,
        abertas: 0,
        vencidas: 0,
      };
      m.set(id, p);
    }
    return p;
  };
  for (const t of concluidas) {
    const p = linha(chave(t.responsavel_id));
    p.total++;
    const d = diasDeAtraso(t, fuso);
    if (d === null) p.semPrazo++;
    else if (d <= 0) p.noPrazo++;
    else {
      p.atrasadas++;
      p.somaAtraso += d;
    }
  }
  for (const a of abertas) {
    const p = linha(chave(a.responsavel_id));
    p.abertas++;
    if (a.prazo && a.prazo < hoje) p.vencidas++;
  }
  return [...m.values()]
    .map((p) => ({ ...p, diasAtrasoMedio: p.atrasadas ? p.somaAtraso / p.atrasadas : null }))
    .sort((a, b) => b.total - a.total || b.abertas - a.abertas || a.nome.localeCompare(b.nome, "pt-BR"));
}

export function totalizar(linhas: PorPessoa[]): Totais {
  const t = linhas.reduce(
    (a, p) => ({
      total: a.total + p.total,
      noPrazo: a.noPrazo + p.noPrazo,
      atrasadas: a.atrasadas + p.atrasadas,
      semPrazo: a.semPrazo + p.semPrazo,
      somaAtraso: a.somaAtraso + p.somaAtraso,
      diasAtrasoMedio: null as number | null,
      abertas: a.abertas + p.abertas,
      vencidas: a.vencidas + p.vencidas,
    }),
    { total: 0, noPrazo: 0, atrasadas: 0, semPrazo: 0, somaAtraso: 0, diasAtrasoMedio: null as number | null, abertas: 0, vencidas: 0 },
  );
  return { ...t, diasAtrasoMedio: t.atrasadas ? t.somaAtraso / t.atrasadas : null };
}

/** Fração (0 a 1) das concluídas com prazo que saíram no prazo; null quando nenhuma tinha prazo. */
export const fracaoNoPrazo = (noPrazo: number, atrasadas: number) => (noPrazo + atrasadas ? noPrazo / (noPrazo + atrasadas) : null);

/** "83%" ou "—". */
export const textoPct = (f: number | null) => (f === null ? "—" : `${Math.round(f * 100)}%`);

/** "2,5 d" ou "—". */
export const textoAtraso = (d: number | null) => (d === null ? "—" : `${d.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} d`);
