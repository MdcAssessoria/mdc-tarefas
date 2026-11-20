// BI de Gestão: comparações (período × período, orçado × realizado, empresa × empresa, análise vertical). Regras
// puras sobre a Matriz de relatorio.ts; testadas em comparar.test.ts.
import type { LinhaMatriz, Matriz } from "./relatorio";

export type ModoComparar = "anterior" | "ano_passado" | "orcado";

export const MODOS_COMPARAR: { id: ModoComparar; nome: string; curto: string }[] = [
  { id: "anterior", nome: "Período anterior (mesmo tamanho, logo antes)", curto: "Período anterior" },
  { id: "ano_passado", nome: "Mesmo período do ano passado", curto: "Ano passado" },
  { id: "orcado", nome: "Orçamento (orçado × realizado)", curto: "Orçado" },
];

const dataUTC = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const ultimoDia = (ano: number, mes0: number) => new Date(Date.UTC(ano, mes0 + 1, 0)).getUTCDate();

/** Período fechado em meses inteiros (começa no dia 1 e termina no último dia do mês)? */
export function mesesInteiros(de: string, ate: string): number | null {
  const a = dataUTC(de);
  const b = dataUTC(ate);
  if (a.getUTCDate() !== 1 || b.getUTCDate() !== ultimoDia(b.getUTCFullYear(), b.getUTCMonth())) return null;
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth() + 1;
}

/** Soma meses a uma data, segurando o fim do mês (31/03 − 1 mês = 28 ou 29/02). */
export function somarMeses(dataIso: string, meses: number, fimDoMes = false): string {
  const d = dataUTC(dataIso);
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + meses;
  const ano = Math.floor(total / 12);
  const mes0 = total - ano * 12;
  const dia = fimDoMes ? ultimoDia(ano, mes0) : Math.min(d.getUTCDate(), ultimoDia(ano, mes0));
  return iso(new Date(Date.UTC(ano, mes0, dia)));
}

/**
 * Período de comparação. "Ano passado": as mesmas datas, 12 meses antes. "Anterior": logo antes, com o mesmo tamanho
 * (em meses quando o período é de meses inteiros; em dias quando não). Orçamento usa o próprio período.
 */
export function periodoComparado(de: string, ate: string, modo: ModoComparar): { de: string; ate: string } {
  if (modo === "orcado") return { de, ate };
  const meses = mesesInteiros(de, ate);
  if (modo === "ano_passado") return { de: somarMeses(de, -12), ate: somarMeses(ate, -12, meses !== null) };
  if (meses !== null) return { de: somarMeses(de, -meses), ate: somarMeses(de, -1, true) };
  const dias = Math.round((dataUTC(ate).getTime() - dataUTC(de).getTime()) / 86_400_000) + 1;
  const fim = new Date(dataUTC(de).getTime() - 86_400_000);
  const ini = new Date(fim.getTime() - (dias - 1) * 86_400_000);
  return { de: iso(ini), ate: iso(fim) };
}

export interface LinhaComparada {
  codigo: string;
  nome: string;
  subtotal: boolean;
  atual: number;
  base: number;
  diferenca: number;
  /** Variação sobre o valor-base (em fração: 0,1 = 10%); null quando a base é zero. */
  variacao: number | null;
}

const c2 = (v: number) => Math.round(v * 100) / 100;

/** Linha a linha: total do período atual × total da base (outro período ou orçamento), na ordem do relatório. */
export function compararMatrizes(atual: Matriz, base: Matriz): LinhaComparada[] {
  const porCodigo = new Map(base.linhas.map((l) => [l.codigo, l.total]));
  const codigos = new Set(atual.linhas.map((l) => l.codigo));
  const linhas: LinhaMatriz[] = [...atual.linhas, ...base.linhas.filter((l) => !codigos.has(l.codigo))];
  return linhas.map((l) => {
    const a = atual.linhas.find((x) => x.codigo === l.codigo)?.total ?? 0;
    const b = porCodigo.get(l.codigo) ?? 0;
    return {
      codigo: l.codigo,
      nome: l.nome,
      subtotal: l.subtotal,
      atual: a,
      base: b,
      diferenca: c2(a - b),
      variacao: b === 0 ? null : (a - b) / Math.abs(b),
    };
  });
}

/** Linha favorável? Receita e resultado: subir é bom; despesa (valor negativo): cair em módulo é bom. */
export function favoravel(l: LinhaComparada): boolean | null {
  if (l.diferenca === 0) return null;
  return l.diferenca > 0;
}

/** Cada linha como fração da base (receita líquida na DRE); null sem base. */
export function analiseVertical(m: Matriz, codigoBase = "receita_liquida"): Map<string, number | null> {
  const base = m.linhas.find((l) => l.codigo === codigoBase)?.total ?? 0;
  return new Map(m.linhas.map((l) => [l.codigo, base ? l.total / base : null]));
}

export interface LinhaEmpresas {
  codigo: string;
  nome: string;
  subtotal: boolean;
  /** Total do período em cada empresa, na ordem de `empresas`. */
  valores: number[];
  soma: number;
  /** Consolidado − soma das empresas: o que sai ao tirar as operações entre elas (zero se não tira). */
  eliminacoes: number;
  consolidado: number;
}

/** Empresa × empresa: uma coluna por empresa, a soma, as eliminações entre elas e o consolidado do grupo. */
export function matrizPorEmpresas(empresas: Matriz[], consolidado: Matriz): LinhaEmpresas[] {
  return consolidado.linhas.map((l) => {
    const valores = empresas.map((m) => m.linhas.find((x) => x.codigo === l.codigo)?.total ?? 0);
    const soma = c2(valores.reduce((a, v) => a + v, 0));
    return {
      codigo: l.codigo,
      nome: l.nome,
      subtotal: l.subtotal,
      valores,
      soma,
      eliminacoes: c2(l.total - soma),
      consolidado: l.total,
    };
  });
}

/** Valores mês a mês de uma conta (zero onde não há), alinhados a `meses`. */
export function serie(m: Matriz, codigo: string, meses = m.meses): number[] {
  const l = m.linhas.find((x) => x.codigo === codigo);
  return meses.map((mes) => {
    const i = m.meses.indexOf(mes);
    return l && i >= 0 ? l.valores[i] : 0;
  });
}

/** Formata uma variação (fração) como "+12,5%" / "−3,0%"; vazio sem base. */
export function fmtVariacao(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  const s = Math.abs(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${s}%`;
}
