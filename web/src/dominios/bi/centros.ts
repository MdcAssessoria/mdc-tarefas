// Centro de custo no BI (117): resumo por centro (entradas, saídas e resultado), busca por centro ou conta e a matriz
// linha × mês de um ou mais centros, com os subtotais pela árvore das linhas (bi_linhas.soma). Os valores vêm de
// bi_centro_custo já com o sinal do relatório (despesa e pagamento negativos).
import { semAcento } from "@/lib/texto";

export const SEM_CENTRO = "";

export interface LinhaCentroBanco {
  centro: string;
  centro_nome: string;
  linha: string;
  competencia: string;
  valor: number | string;
}

export interface LinhaEstrutura {
  codigo: string;
  nome: string;
  ordem: number;
  natureza: string | null;
  soma: string[] | null;
}

export interface ResumoCentro {
  centro: string;
  nome: string;
  entradas: number;
  saidas: number;
  resultado: number;
}

export interface LinhaCentro {
  codigo: string;
  nome: string;
  subtotal: boolean;
  valores: number[];
  total: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const normal = (t: string) => semAcento(t).toLowerCase().trim();

/** Um item por centro; "Sem centro de custo" sempre por último, os demais pelo volume (entradas + saídas). */
export function resumirCentros(linhas: LinhaCentroBanco[]): ResumoCentro[] {
  const m = new Map<string, ResumoCentro>();
  for (const l of linhas) {
    const v = Number(l.valor) || 0;
    const c = m.get(l.centro) ?? { centro: l.centro, nome: l.centro_nome, entradas: 0, saidas: 0, resultado: 0 };
    if (v > 0) c.entradas = r2(c.entradas + v);
    else c.saidas = r2(c.saidas + v);
    c.resultado = r2(c.resultado + v);
    m.set(l.centro, c);
  }
  return [...m.values()].sort((a, b) => {
    if ((a.centro === SEM_CENTRO) !== (b.centro === SEM_CENTRO)) return a.centro === SEM_CENTRO ? 1 : -1;
    return b.entradas - b.saidas - (a.entradas - a.saidas) || a.nome.localeCompare(b.nome, "pt-BR");
  });
}

/** Busca sem acento e sem maiúsculas pelo nome ou pelo código do centro. */
export function filtrarCentros(centros: ResumoCentro[], busca: string): ResumoCentro[] {
  const t = normal(busca);
  if (!t) return centros;
  return centros.filter((c) => normal(c.nome).includes(t) || normal(c.centro).includes(t));
}

/**
 * Matriz linha × mês dos centros escolhidos (todos quando `centros` é null). Linhas analíticas sem valor ficam de fora;
 * subtotais sempre aparecem. `busca` mostra só as contas cujo nome contém o texto (e os subtotais delas).
 */
export function matrizDosCentros(
  dados: LinhaCentroBanco[],
  estrutura: LinhaEstrutura[],
  meses: string[],
  centros: Set<string> | null,
  busca = "",
): LinhaCentro[] {
  const idx = new Map(meses.map((m, i) => [m, i]));
  const analiticas = new Map<string, number[]>();
  for (const l of dados) {
    if (centros && !centros.has(l.centro)) continue;
    const i = idx.get(String(l.competencia).slice(0, 7));
    if (i === undefined) continue;
    const arr = analiticas.get(l.linha) ?? meses.map(() => 0);
    arr[i] = r2(arr[i] + (Number(l.valor) || 0));
    analiticas.set(l.linha, arr);
  }
  const porCodigo = new Map(estrutura.map((l) => [l.codigo, l]));
  const memo = new Map<string, number[]>();
  const valoresDe = (codigo: string, visitando = new Set<string>()): number[] => {
    if (memo.has(codigo)) return memo.get(codigo)!;
    const l = porCodigo.get(codigo);
    let v: number[];
    if (l?.soma?.length && !visitando.has(codigo)) {
      visitando.add(codigo);
      v = meses.map(() => 0);
      for (const f of l.soma) valoresDe(f, visitando).forEach((x, i) => (v[i] = r2(v[i] + x)));
      visitando.delete(codigo);
    } else v = analiticas.get(codigo) ?? meses.map(() => 0);
    memo.set(codigo, v);
    return v;
  };
  const t = normal(busca);
  return estrutura
    .slice()
    .sort((a, b) => a.ordem - b.ordem)
    .map((l) => {
      const valores = valoresDe(l.codigo);
      return { codigo: l.codigo, nome: l.nome, subtotal: !!l.soma?.length, valores, total: r2(valores.reduce((s, x) => s + x, 0)) };
    })
    .filter((l) => (l.subtotal ? !t : l.valores.some((x) => x !== 0) && (!t || normal(l.nome).includes(t))));
}

/** Quanto do período está com centro de custo informado (0 a 1), pelo volume movimentado. */
export function coberturaCentros(centros: ResumoCentro[]): number {
  const vol = (c: ResumoCentro) => c.entradas - c.saidas;
  const total = centros.reduce((s, c) => s + vol(c), 0);
  if (!total) return 0;
  return centros.filter((c) => c.centro !== SEM_CENTRO).reduce((s, c) => s + vol(c), 0) / total;
}
