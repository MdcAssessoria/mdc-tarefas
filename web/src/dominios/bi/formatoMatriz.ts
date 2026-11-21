// BI de Gestão: formato dos números na tabela da DRE e do fluxo (compacto, sem "R$" em cada célula) e os documentos de
// uma conta espalhados pelos meses da tabela. Testado em formatoMatriz.test.ts.
import type { OrigemBanco } from "./detalhe";

/** "468.666" (sem centavos) ou "468.666,25" (com centavos); zero vira "–". O sinal de menos é o tipográfico. */
export function fmtCelula(v: number, centavos = false): string {
  if (!v || Math.abs(v) < (centavos ? 0.005 : 0.5)) return "–";
  const s = Math.abs(v).toLocaleString("pt-BR", {
    minimumFractionDigits: centavos ? 2 : 0,
    maximumFractionDigits: centavos ? 2 : 0,
  });
  return v < 0 ? `−${s}` : s;
}

/** Linhas que fecham um bloco da DRE/DFC: destaque mais forte que os outros subtotais. */
export const RESULTADOS = new Set([
  "receita_liquida",
  "lucro_bruto",
  "resultado_operacional",
  "resultado_liquido",
  "fluxo_operacional",
  "variacao_caixa",
]);

export interface DocumentoMatriz {
  chave: string;
  /** "05/01 · NF 4471 · Metalúrgica Bragança" */
  rotulo: string;
  titulo: string;
  valores: number[];
  total: number;
}

const ddmm = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "");

/** Documentos de uma conta, cada um no mês da sua data (meses "AAAA-MM"), do maior para o menor. */
export function documentosNosMeses(linhas: OrigemBanco[], meses: string[], varias: boolean): DocumentoMatriz[] {
  const pos = new Map(meses.map((m, i) => [m, i]));
  return linhas
    .map((o, i) => {
      const valores = meses.map(() => 0);
      const p = o.data ? pos.get(o.data.slice(0, 7)) : undefined;
      if (p !== undefined) valores[p] = Number(o.valor);
      const partes = [ddmm(o.data), o.documento ? `Doc. ${o.documento}` : "", o.pessoa ?? o.categoria ?? ""].filter(Boolean);
      const rotulo = partes.join(" · ");
      return {
        chave: `${o.origem}-${o.documento ?? ""}-${o.data ?? ""}-${i}`,
        rotulo,
        titulo: [varias ? o.empresa : "", rotulo, o.categoria ?? ""].filter(Boolean).join(" · "),
        valores,
        total: Number(o.valor),
      };
    })
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}
