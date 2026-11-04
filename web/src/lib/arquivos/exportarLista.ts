// Exportação de listas de tela: a mesma definição de colunas gera o PDF (timbrado MDC) e o Excel, com exatamente o
// que está filtrado na tela. Evita repetir em cada tela as duas montagens. Usado pelo BotoesExportar (components/ui).
import { brl } from "@/lib/formato/moeda";
import { baixarBytes } from "@/lib/arquivos/baixar";
import { exportarExcel } from "@/lib/arquivos/excel";
import type { ColunaExcel } from "@/lib/arquivos/excel";
import { gerarRelatorioPdf } from "@/lib/arquivos/relatorioPdf";
import { carregarLogo } from "@/lib/marca";

export interface ColunaLista<L> {
  titulo: string;
  /** Valor da célula (número para moeda/quantidade). */
  valor: (l: L) => string | number | null;
  formato?: "texto" | "moeda" | "numero";
  /** Largura relativa no PDF (padrão 1) e em caracteres no Excel (padrão 16). */
  peso?: number;
  largura?: number;
  /** Célula em vermelho no PDF. */
  alerta?: (l: L) => boolean;
}

export interface ListaExportavel<L> {
  titulo: string;
  subtitulo: string;
  arquivo: string;
  colunas: ColunaLista<L>[];
  linhas: L[];
  /** Linha de total: título da coluna → valor. */
  totais?: Record<string, string | number>;
  paisagem?: boolean;
  logoUrl?: string | null;
}

const texto = (v: string | number | null, formato?: string) =>
  v == null || v === "" ? "" : formato === "moeda" ? brl(Number(v)) : formato === "numero" ? Number(v).toLocaleString("pt-BR") : String(v);

export async function exportarPdf<L>(o: ListaExportavel<L>) {
  const bytes = await gerarRelatorioPdf({
    titulo: o.titulo,
    subtitulo: o.subtitulo,
    paisagem: o.paisagem ?? true,
    logo: await carregarLogo(o.logoUrl),
    secoes: [
      {
        // o título já está no topo do relatório: a tabela não o repete (DES-06)
        titulo: "",
        colunas: o.colunas.map((c) => ({ titulo: c.titulo, peso: c.peso ?? 1, direita: c.formato === "moeda" || c.formato === "numero" })),
        linhas: [
          ...o.linhas.map((l) => ({
            celulas: o.colunas.map((c) => texto(c.valor(l), c.formato)),
            alerta: o.colunas.map((c) => !!c.alerta?.(l)),
          })),
          ...(o.totais
            ? [
                {
                  celulas: o.colunas.map((c, i) =>
                    c.titulo in o.totais! ? texto(o.totais![c.titulo], c.formato) : i === 0 ? "Total" : "",
                  ),
                  negrito: true,
                  fundo: true,
                },
              ]
            : []),
        ],
      },
    ],
  });
  baixarBytes(bytes, `${o.arquivo}.pdf`);
}

/** "31/12/2026" ou "2026-12-31" (só a data) → "2026-12-31"; outro texto → null. */
export function dataDaCelula(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  let m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  return m ? t : null;
}

/**
 * Formato de cada coluna no Excel (D-08): coluna de texto em que todas as células preenchidas são datas vira data de
 * verdade (filtra e ordena como data); número com casas decimais não é arredondado.
 */
export function formatoExcel<L>(c: ColunaLista<L>, linhas: L[]): ColunaExcel["formato"] {
  if (c.formato === "moeda") return "moeda";
  const valores = linhas.map((l) => c.valor(l)).filter((v) => v !== null && v !== "");
  if (c.formato === "numero") return valores.some((v) => Number(v) % 1 !== 0) ? "decimal" : "numero";
  if (valores.length && valores.every((v) => dataDaCelula(v) !== null)) return "data";
  return "texto";
}

export async function exportarXlsx<L>(o: ListaExportavel<L>) {
  const colunas: ColunaExcel[] = o.colunas.map((c, i) => ({
    titulo: c.titulo,
    chave: `c${i}`,
    largura: c.largura ?? 16,
    formato: formatoExcel(c, o.linhas),
  }));
  const linhas = o.linhas.map((l) =>
    Object.fromEntries(
      o.colunas.map((c, i) => {
        const v = c.valor(l);
        return [`c${i}`, colunas[i].formato === "data" ? (dataDaCelula(v) ?? v) : v];
      }),
    ),
  );
  const totais = o.totais
    ? Object.fromEntries(o.colunas.map((c, i) => [`c${i}`, c.titulo in o.totais! ? o.totais![c.titulo] : i === 0 ? "Total" : null]))
    : undefined;
  await exportarExcel(`${o.arquivo}.xlsx`, o.titulo, o.subtitulo, [{ nome: o.titulo, colunas, linhas, totais }]);
}

/** Nome de arquivo seguro: "Contas-a-pagar-Empresa-X-2026-11-01". */
export const nomeArquivo = (...partes: string[]) =>
  partes
    .filter(Boolean)
    .join("-")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w-]+/g, "-")
    .replace(/-+/g, "-");
