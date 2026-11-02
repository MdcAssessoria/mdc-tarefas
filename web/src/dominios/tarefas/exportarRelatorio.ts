// PDF e Excel do relatório de tarefas concluídas. Recebem exatamente o que a tela mostra (resumo por pessoa, totais e a
// lista de concluídas, já com o destaque de pessoa aplicado), para o arquivo bater com a tela.
import { carregarLogo } from "@/lib/marca";
import { baixarBytes } from "@/lib/arquivos/baixar";
import { exportarExcel } from "@/lib/arquivos/excel";
import { gerarRelatorioPdf } from "@/lib/arquivos/relatorioPdf";
import { fmtCompetencia, fmtData } from "@/lib/formato/datas";
import { diaDaConclusao, diasDeAtraso, fracaoNoPrazo, situacaoDaConclusao, textoAtraso, textoPct } from "./relatorio";
import type { Concluida, PorPessoa, Totais } from "./relatorio";

export interface DadosRelatorio {
  titulo: string;
  subtitulo: string;
  /** Nome do arquivo sem extensão. */
  arquivo: string;
  hoje: string;
  fuso: string;
  logoUrl?: string | null;
  /** Analista vendo só o próprio relatório: sem a coluna Responsável. */
  soEu: boolean;
  porPessoa: PorPessoa[];
  totais: Totais;
  /** Título da lista de concluídas (muda quando há uma pessoa em destaque). */
  tituloLista: string;
  lista: Concluida[];
  nomeCliente: (id: string | null) => string;
  nomePessoa: (id: string | null) => string;
  nomeSetor: (id: string | null) => string;
}

export async function exportarRelatorioPdf(d: DadosRelatorio) {
  const bytes = await gerarRelatorioPdf({
    titulo: d.titulo,
    subtitulo: `${d.subtitulo}. No prazo = concluída até o dia do prazo. Abertas e vencidas = situação de hoje (${fmtData(d.hoje)}).`,
    logo: await carregarLogo(d.logoUrl),
    secoes: [
      {
        titulo: "Resumo por pessoa",
        colunas: [
          { titulo: "Pessoa", peso: 2.4 },
          { titulo: "Concluídas", peso: 1.2, direita: true },
          { titulo: "No prazo", peso: 1.1, direita: true },
          { titulo: "Com atraso", peso: 1.15, direita: true },
          { titulo: "Sem prazo", peso: 1.1, direita: true },
          { titulo: "% no prazo", peso: 1, direita: true },
          { titulo: "Atraso méd.", peso: 1.2, direita: true },
          { titulo: "Abertas", peso: 1, direita: true },
          { titulo: "Vencidas", peso: 1.1, direita: true },
        ],
        barras: d.porPessoa
          .filter((p) => p.total)
          .map((p) => ({
            rotulo: p.nome,
            partes: [
              { valor: p.noPrazo + p.semPrazo, cor: "verde" as const },
              { valor: p.atrasadas, cor: "ouro" as const },
            ],
          })),
        linhas: [
          ...d.porPessoa.map((p) => ({
            celulas: [
              p.nome,
              String(p.total),
              String(p.noPrazo),
              String(p.atrasadas),
              String(p.semPrazo),
              textoPct(fracaoNoPrazo(p.noPrazo, p.atrasadas)),
              textoAtraso(p.diasAtrasoMedio),
              String(p.abertas),
              String(p.vencidas),
            ],
            alerta: [false, false, false, p.atrasadas > 0, false, false, false, false, p.vencidas > 0],
          })),
          {
            celulas: [
              "Total",
              String(d.totais.total),
              String(d.totais.noPrazo),
              String(d.totais.atrasadas),
              String(d.totais.semPrazo),
              textoPct(fracaoNoPrazo(d.totais.noPrazo, d.totais.atrasadas)),
              textoAtraso(d.totais.diasAtrasoMedio),
              String(d.totais.abertas),
              String(d.totais.vencidas),
            ],
            negrito: true,
            fundo: true,
          },
        ],
        texto: "Barras: verde = concluídas no prazo (ou sem prazo); dourado = concluídas com atraso.",
      },
      {
        titulo: d.tituloLista,
        colunas: [
          { titulo: "Concluída", peso: 1.25 },
          { titulo: "Tarefa", peso: 3.2 },
          { titulo: "Cliente", peso: 2.1 },
          ...(d.soEu ? [] : [{ titulo: "Responsável", peso: 1.8 }]),
          { titulo: "Prazo", peso: 1.25 },
          { titulo: "Situação", peso: 1.75 },
        ],
        linhas: d.lista.map((t) => {
          const atraso = diasDeAtraso(t, d.fuso);
          const cels = [
            fmtData(diaDaConclusao(t, d.fuso)),
            t.titulo,
            d.nomeCliente(t.cliente_id),
            ...(d.soEu ? [] : [d.nomePessoa(t.responsavel_id)]),
            fmtData(t.prazo),
            situacaoDaConclusao(atraso),
          ];
          return { celulas: cels, alerta: cels.map((_, i) => i === cels.length - 1 && atraso !== null && atraso > 0) };
        }),
      },
    ],
  });
  baixarBytes(bytes, `${d.arquivo}.pdf`);
}

export async function exportarRelatorioXlsx(d: DadosRelatorio) {
  const atrasoNum = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);
  await exportarExcel(`${d.arquivo}.xlsx`, d.titulo, d.subtitulo, [
    {
      nome: "Resumo por pessoa",
      colunas: [
        { titulo: "Pessoa", chave: "nome", largura: 32 },
        { titulo: "Concluídas", chave: "total", formato: "numero", largura: 12 },
        { titulo: "No prazo", chave: "noPrazo", formato: "numero", largura: 11 },
        { titulo: "Com atraso", chave: "atrasadas", formato: "numero", largura: 12 },
        { titulo: "Sem prazo", chave: "semPrazo", formato: "numero", largura: 11 },
        { titulo: "% no prazo", chave: "pct", formato: "percentual", largura: 11 },
        { titulo: "Atraso médio (dias)", chave: "atraso", formato: "numero", largura: 17 },
        { titulo: "Abertas hoje", chave: "abertas", formato: "numero", largura: 13 },
        { titulo: "Vencidas hoje", chave: "vencidas", formato: "numero", largura: 13 },
      ],
      linhas: d.porPessoa.map((p) => ({
        nome: p.nome,
        total: p.total,
        noPrazo: p.noPrazo,
        atrasadas: p.atrasadas,
        semPrazo: p.semPrazo,
        pct: fracaoNoPrazo(p.noPrazo, p.atrasadas),
        atraso: atrasoNum(p.diasAtrasoMedio),
        abertas: p.abertas,
        vencidas: p.vencidas,
      })),
      totais: {
        nome: "Total",
        total: d.totais.total,
        noPrazo: d.totais.noPrazo,
        atrasadas: d.totais.atrasadas,
        semPrazo: d.totais.semPrazo,
        pct: fracaoNoPrazo(d.totais.noPrazo, d.totais.atrasadas),
        atraso: atrasoNum(d.totais.diasAtrasoMedio),
        abertas: d.totais.abertas,
        vencidas: d.totais.vencidas,
      },
    },
    {
      nome: "Tarefas concluídas",
      colunas: [
        { titulo: "Concluída em", chave: "em", formato: "data", largura: 13 },
        { titulo: "Tarefa", chave: "titulo", largura: 48 },
        { titulo: "Cliente", chave: "cliente", largura: 34 },
        { titulo: "Responsável", chave: "resp", largura: 26 },
        { titulo: "Setor", chave: "setor", largura: 16 },
        { titulo: "Competência", chave: "comp", largura: 12 },
        { titulo: "Prazo", chave: "prazo", formato: "data", largura: 12 },
        { titulo: "Dias de atraso", chave: "atraso", formato: "numero", largura: 13 },
        { titulo: "Situação", chave: "sit", largura: 18 },
      ],
      linhas: d.lista.map((t) => {
        const atraso = diasDeAtraso(t, d.fuso);
        return {
          em: diaDaConclusao(t, d.fuso),
          titulo: t.titulo,
          cliente: d.nomeCliente(t.cliente_id),
          resp: d.nomePessoa(t.responsavel_id),
          setor: d.nomeSetor(t.setor_id),
          comp: t.competencia ? fmtCompetencia(t.competencia) : "",
          prazo: t.prazo,
          atraso: atraso === null ? null : Math.max(0, atraso),
          sit: situacaoDaConclusao(atraso),
        };
      }),
    },
  ]);
}
