// PDF do "Ver caminho" no papel timbrado MDC (mesmo gerador dos relatórios, com a identidade de lib/identidade.ts):
// resumo das contas, o que falta e o caminho em linhas recuadas (origem → contas → pagamentos e estoque).
import { baixarBytes } from "@/lib/arquivos/baixar";
import { gerarRelatorioPdf } from "@/lib/arquivos/relatorioPdf";
import type { LinhaPdf } from "@/lib/arquivos/relatorioPdf";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { carregarLogo } from "@/lib/marca";
import { brl } from "@/lib/formato/moeda";
import { fmtData } from "@/lib/formato/datas";
import { linhasDaArvore } from "./arvore";
import type { Arvore } from "./arvore";

/**
 * Linhas da seção "Caminho": recuo de 4 espaços por nível, "> " marca o documento aberto; detalhes, aviso e o que falta
 * vão em linhas próprias logo abaixo (o gerador corta texto longo, não quebra). Exportada para teste.
 */
export function linhasCaminhoPdf(a: Arvore): LinhaPdf[] {
  return linhasDaArvore(a).flatMap(({ nivel, no }) => {
    const recuo = "    ".repeat(nivel);
    const extra = (texto: string, alerta = false): LinhaPdf => ({ celulas: [`${recuo}      ${texto}`, "", "", ""], alerta: [alerta] });
    return [
      {
        celulas: [
          `${recuo}${nivel ? "- " : ""}${no.ponto ? "> " : ""}${no.rotulo}: ${no.titulo}`,
          no.data ? `${no.rotuloData} ${fmtData(no.data)}` : "",
          no.valor == null ? "" : brl(no.valor),
          no.situacao?.nome ?? "",
        ],
        negrito: nivel === 0 || no.ponto,
        fundo: no.ponto,
        alerta: [false, false, false, no.situacao?.tom === "vermelho"],
      },
      ...no.detalhes.map((t) => extra(t)),
      ...(no.aviso ? [extra(no.aviso)] : []),
      ...(no.falta ? [extra(`Falta: ${no.falta}`, true)] : []),
    ];
  });
}

export async function baixarPdfArvore(o: { titulo: string; arvore: Arvore; empresa: string; hoje: string; logoUrl?: string | null }) {
  const { arvore: a } = o;
  const bytes = await gerarRelatorioPdf({
    titulo: `Caminho · ${o.titulo}`,
    subtitulo: `${o.empresa} · emitido em ${fmtData(o.hoje)}`,
    paisagem: true,
    logo: await carregarLogo(o.logoUrl),
    secoes: [
      {
        titulo: "Resumo das contas do caminho",
        colunas: [
          { titulo: "Contas", peso: 1 },
          { titulo: "Total", peso: 1.2, direita: true },
          { titulo: "Pago/recebido", peso: 1.2, direita: true },
          { titulo: "Falta", peso: 1.2, direita: true },
        ],
        linhas: [{ celulas: [String(a.resumo.contas), brl(a.resumo.total), brl(a.resumo.pago), brl(a.resumo.falta)], negrito: true }],
      },
      {
        titulo: "O que falta",
        colunas: [{ titulo: "Pendência", peso: 1 }],
        linhas: a.pendencias.length ? a.pendencias.map((p) => ({ celulas: [p] })) : [{ celulas: ["Nada pendente: tudo concluído."] }],
      },
      {
        titulo: "Caminho",
        texto: 'Da origem até os pagamentos. "> " marca o documento de onde o caminho foi aberto.',
        colunas: [
          { titulo: "Etapa", peso: 5.2 },
          { titulo: "Data", peso: 1.5 },
          { titulo: "Valor", peso: 1.1, direita: true },
          { titulo: "Situação", peso: 1.2 },
        ],
        linhas: linhasCaminhoPdf(a),
      },
    ],
  });
  baixarBytes(bytes, `${nomeArquivo("Caminho", o.titulo, o.hoje)}.pdf`);
}
