// PDF de um pedido de venda ou de compra no papel timbrado (mesmo gerador dos relatórios): dados do pedido, itens,
// totais e parcelas. Gerado no navegador a partir do que já está gravado.
import { baixarBytes } from "@/lib/arquivos/baixar";
import { gerarRelatorioPdf } from "@/lib/arquivos/relatorioPdf";
import { carregarLogo } from "@/lib/marca";
import { brl } from "@/lib/formato/moeda";
import { fmtData } from "@/lib/formato/datas";
import { qtdBr } from "./estoqueRegras";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { situacaoPedido } from "./pedidosRegras";
import type { Pedido, PedidoItem, Pessoa } from "./tipos";

export async function baixarPdfPedido(o: {
  pedido: Pedido;
  itens: PedidoItem[];
  empresa: string;
  pessoa: Pessoa | null;
  local: string | null;
  logoUrl?: string | null;
}) {
  const { pedido: p, itens, pessoa } = o;
  const venda = p.tipo === "venda";
  const titulo = `${venda ? "Pedido de venda" : "Pedido de compra"} nº ${p.numero}`;
  const dados: [string, string][] = [
    [venda ? "Cliente" : "Fornecedor", pessoa?.nome ?? "—"],
    ["CPF/CNPJ", pessoa?.documento ?? "—"],
    ["Contato", [pessoa?.telefone, pessoa?.email].filter(Boolean).join(" · ") || "—"],
    ["Cidade", [pessoa?.cidade, pessoa?.uf].filter(Boolean).join("/") || "—"],
    ["Data do pedido", fmtData(p.data)],
    [venda ? "Previsão de entrega" : "Previsão de chegada", p.previsao ? fmtData(p.previsao) : "—"],
    ["Situação", situacaoPedido(p.tipo, p.situacao).nome + (p.cancelado_motivo ? ` (${p.cancelado_motivo})` : "")],
    ["Estoque", o.local ?? "—"],
  ];
  if (p.documento) dados.push([venda ? "Nota fiscal" : "Nota do fornecedor", p.documento]);
  const bytes = await gerarRelatorioPdf({
    titulo,
    subtitulo: `${o.empresa} · emitido em ${new Date().toLocaleDateString("pt-BR")}`,
    paisagem: false,
    logo: await carregarLogo(o.logoUrl),
    secoes: [
      {
        titulo: "Dados do pedido",
        colunas: [
          { titulo: "", peso: 1 },
          { titulo: "", peso: 2.6 },
        ],
        linhas: dados.map(([a, b]) => ({ celulas: [a, b] })),
      },
      {
        titulo: "Itens",
        colunas: [
          { titulo: "Item", peso: 3.4 },
          { titulo: "Qtd.", peso: 0.8, direita: true },
          { titulo: "Un.", peso: 0.5 },
          { titulo: "Preço unit.", peso: 1, direita: true },
          { titulo: "Desconto", peso: 0.9, direita: true },
          { titulo: "Total", peso: 1.1, direita: true },
        ],
        linhas: [
          ...itens.map((l) => ({
            celulas: [
              l.descricao,
              qtdBr(l.quantidade),
              l.unidade,
              brl(Number(l.preco_unitario)),
              Number(l.desconto) ? brl(Number(l.desconto)) : "",
              brl(Number(l.total)),
            ],
          })),
          { celulas: ["Soma dos itens", "", "", "", "", brl(Number(p.total_itens))] },
          ...(Number(p.desconto) ? [{ celulas: ["Desconto do pedido", "", "", "", "", `- ${brl(Number(p.desconto))}`] }] : []),
          ...(Number(p.frete) ? [{ celulas: ["Frete", "", "", "", "", brl(Number(p.frete))] }] : []),
          { celulas: ["Total do pedido", "", "", "", "", brl(Number(p.total))], negrito: true, fundo: true },
        ],
      },
      {
        titulo: "Pagamento",
        texto: [p.condicao, p.forma_pagamento].filter(Boolean).join(" · ") || undefined,
        colunas: [
          { titulo: "Parcela", peso: 1 },
          { titulo: "Vencimento", peso: 1.2 },
          { titulo: "Valor", peso: 1.2, direita: true },
        ],
        linhas: (p.parcelas ?? []).map((x) => ({
          celulas: [`${x.numero}/${p.parcelas.length}`, fmtData(x.vencimento), brl(Number(x.valor))],
        })),
      },
      ...(p.observacao
        ? [
            {
              titulo: "Observações",
              colunas: [{ titulo: "Observação", peso: 1 }],
              linhas: [{ celulas: [p.observacao] }],
            },
          ]
        : []),
    ],
  });
  baixarBytes(bytes, `${nomeArquivo(venda ? "Pedido-venda" : "Pedido-compra", String(p.numero), o.empresa)}.pdf`);
}
