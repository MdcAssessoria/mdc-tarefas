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
        titulo: o.titulo,
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

export async function exportarXlsx<L>(o: ListaExportavel<L>) {
  const colunas: ColunaExcel[] = o.colunas.map((c, i) => ({
    titulo: c.titulo,
    chave: `c${i}`,
    largura: c.largura ?? 16,
    formato: c.formato === "moeda" ? "moeda" : c.formato === "numero" ? "numero" : "texto",
  }));
  const linhas = o.linhas.map((l) => Object.fromEntries(o.colunas.map((c, i) => [`c${i}`, c.valor(l)])));
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
