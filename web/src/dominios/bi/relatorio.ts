// BI de Gestão (Omie): regras puras da tela /bi-gestao. O banco (bi_relatorio) devolve uma linha por conta do relatório e
// por mês; aqui viram a matriz da tela (linha × mês + total), os destaques e o período pedido. Testado em
// relatorio.test.ts. A origem dos números (notas, títulos do Omie e lançamentos complementares) está no banco.
import { fimDoMes, intervaloDoPeriodo } from "@/lib/periodo";
import type { Periodo } from "@/lib/periodo";

export type TipoRelatorio = "dre" | "dfc";

/** Uma linha devolvida por bi_relatorio (conta × mês). */
export interface LinhaBanco {
  codigo: string;
  nome: string;
  ordem: number;
  subtotal: boolean;
  natureza: string | null;
  competencia: string;
  valor: number;
}

/** Linha da matriz da tela: valores por mês (mesma ordem de `meses`) e o total do período. */
export interface LinhaMatriz {
  codigo: string;
  nome: string;
  subtotal: boolean;
  valores: number[];
  total: number;
}

export interface Matriz {
  /** Meses "AAAA-MM" em ordem. */
  meses: string[];
  linhas: LinhaMatriz[];
}

const centavos = (v: number) => Math.round(v * 100) / 100;

/** Monta a matriz linha × mês, na ordem do relatório. Mês sem valor conta zero. */
export function montarMatriz(linhas: LinhaBanco[]): Matriz {
  const meses = [...new Set(linhas.map((l) => l.competencia.slice(0, 7)))].sort();
  const pos = new Map(meses.map((m, i) => [m, i]));
  const porCodigo = new Map<string, LinhaMatriz & { ordem: number }>();
  for (const l of linhas) {
    let m = porCodigo.get(l.codigo);
    if (!m) {
      m = { codigo: l.codigo, nome: l.nome, subtotal: l.subtotal, ordem: l.ordem, valores: meses.map(() => 0), total: 0 };
      porCodigo.set(l.codigo, m);
    }
    const i = pos.get(l.competencia.slice(0, 7));
    if (i !== undefined) m.valores[i] = centavos(m.valores[i] + Number(l.valor));
  }
  const saida = [...porCodigo.values()].sort((a, b) => a.ordem - b.ordem || a.codigo.localeCompare(b.codigo));
  return {
    meses,
    linhas: saida.map(({ ordem: _ordem, ...l }) => ({ ...l, total: centavos(l.valores.reduce((a, v) => a + v, 0)) })),
  };
}

/** Total do período de uma conta (0 quando a conta não veio). */
export const totalDe = (m: Matriz, codigo: string) => m.linhas.find((l) => l.codigo === codigo)?.total ?? 0;

/** Há algum valor no período? Sem nada, a tela mostra o estado vazio. */
export const temMovimento = (m: Matriz) => m.linhas.some((l) => l.valores.some((v) => v !== 0));

/**
 * Período pedido ao banco (que aceita no máximo 3 anos). "Tudo" e datas em branco viram os últimos 3 anos até o fim
 * do mês atual; datas trocadas são postas em ordem.
 */
export function periodoDoBi(p: Periodo, hoje: string, de = "", ate = ""): { de: string; ate: string } {
  const i = intervaloDoPeriodo(p, hoje, de, ate);
  const fim = i.ate ?? fimDoMes(hoje);
  const inicio = i.de ?? `${Number(fim.slice(0, 4)) - 2}-01-01`;
  return inicio <= fim ? { de: inicio, ate: fim } : { de: fim, ate: inicio };
}

/** Período tem mais de 3 anos? O banco recusa; a tela avisa antes de pedir. */
export function periodoLongo(de: string, ate: string): boolean {
  const dias = (Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000;
  return dias > 1100;
}

/** Destaques do topo da tela, por relatório: [código, título]. */
export const DESTAQUES: Record<TipoRelatorio, { codigo: string; titulo: string; icone: "seta-entrada" | "grafico" | "tendencia" }[]> = {
  dre: [
    { codigo: "receita_liquida", titulo: "Receita líquida", icone: "seta-entrada" },
    { codigo: "lucro_bruto", titulo: "Lucro bruto", icone: "grafico" },
    { codigo: "resultado_liquido", titulo: "Resultado líquido", icone: "tendencia" },
  ],
  dfc: [
    { codigo: "rec_clientes", titulo: "Recebido de clientes", icone: "seta-entrada" },
    { codigo: "fluxo_operacional", titulo: "Caixa das operações", icone: "grafico" },
    { codigo: "variacao_caixa", titulo: "Variação do caixa", icone: "tendencia" },
  ],
};

/** Margem (resultado ÷ receita líquida), ou null sem receita. */
export function margem(m: Matriz, codigo: string): number | null {
  const receita = totalDe(m, "receita_liquida");
  return receita ? totalDe(m, codigo) / receita : null;
}
