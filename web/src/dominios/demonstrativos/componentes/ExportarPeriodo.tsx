// Botões "PDF do período" e "Excel do período": exportam exatamente o período escolhido no topo da análise
// (DRE e DFC somadas, balanço do fim do período, índices e a comparação com o mesmo período do ano anterior),
// no papel timbrado da MDC. Gerado no navegador; o PDF assinado do balancete continua vindo do BotaoPdf.
"use client";

import { useState } from "react";
import { INDICES_INFO } from "@/dominios/demonstrativos/balancete/indices";
import { linhasDre } from "@/dominios/demonstrativos/calculosDemonstracoes";
import type { Dfc, LinhaBp } from "@/dominios/demonstrativos/calculosDemonstracoes";
import type { Selecao } from "@/dominios/demonstrativos/selecaoPeriodo";
import type { BalanceteReg } from "@/dominios/demonstrativos/tipos";
import { baixarBytes } from "@/lib/arquivos/baixar";
import { exportarExcel } from "@/lib/arquivos/excel";
import type { AbaExcel } from "@/lib/arquivos/excel";
import { gerarRelatorioPdf } from "@/lib/arquivos/relatorioPdf";
import type { SecaoPdf } from "@/lib/arquivos/relatorioPdf";
import { traduzirErro } from "@/lib/erros";
import { fmtData } from "@/lib/formato/datas";
import { fmtIndice, fmtNumero } from "@/lib/formato/numero";
import { carregarLogo } from "@/lib/marca";
import { semAcento } from "@/lib/texto";

const fmt = (v: number) => (Math.abs(v) < 0.5 ? "—" : (v < 0 ? "(" : "") + fmtNumero(Math.abs(v)) + (v < 0 ? ")" : ""));
const SECOES_DFC: { titulo: string; chave: "operacional" | "investimento" | "financiamento"; total: "fco" | "fci" | "fcf" }[] = [
  { titulo: "Atividades operacionais", chave: "operacional", total: "fco" },
  { titulo: "Atividades de investimento", chave: "investimento", total: "fci" },
  { titulo: "Atividades de financiamento", chave: "financiamento", total: "fcf" },
];

/** Linhas da DFC (rótulo + valor) na ordem da demonstração. */
function linhasDfc(f: Dfc) {
  const out: { rotulo: string; valor: number; total?: boolean }[] = [];
  for (const s of SECOES_DFC) {
    for (const l of f[s.chave]) out.push({ rotulo: l.rotulo, valor: l.valor });
    out.push({ rotulo: `Caixa líquido das ${s.titulo.toLowerCase()}`, valor: f[s.total], total: true });
  }
  out.push({ rotulo: "Caixa no início", valor: f.caixa_inicial }, { rotulo: "Caixa no fim", valor: f.caixa_final, total: true });
  return out;
}

/** Monta o conteúdo comum ao PDF e ao Excel. */
function conteudo(sel: Selecao<BalanceteReg>, anterior: Selecao<BalanceteReg> | null) {
  const comp = anterior ? anterior.rotulo : null;
  const dreAnt = anterior ? linhasDre(anterior.ag.dre) : null;
  const dre = linhasDre(sel.ag.dre).map((l, k) => ({ ...l, anterior: dreAnt?.[k].valor ?? null }));
  const dfc = sel.ag.dfc ? linhasDfc(sel.ag.dfc) : [];
  const bp = (lado: LinhaBp[]) => lado.map((l) => ({ rotulo: l.rotulo, nivel: l.nivel, atual: l.atual, abertura: l.anterior }));
  const balanco = sel.ag.balanco ? [...bp(sel.ag.balanco.ativo), ...bp(sel.ag.balanco.passivo)] : [];
  const indices = INDICES_INFO.map((x) => ({
    nome: x.nome,
    valor: sel.ag.indices[x.id] as number | null,
    anterior: anterior ? (anterior.ag.indices[x.id] as number | null) : null,
    formato: x.formato,
    alerta: x.alerta && sel.ag.indices[x.id] != null ? x.alerta(sel.ag.indices[x.id] as number) : false,
  }));
  return { comp, dre, dfc, balanco, indices };
}

export function ExportarPeriodo({
  sel,
  anterior,
  empresa,
  logoUrl,
}: {
  sel: Selecao<BalanceteReg>;
  anterior: Selecao<BalanceteReg> | null;
  empresa: string;
  logoUrl?: string | null;
}) {
  const [gerando, setGerando] = useState<"pdf" | "excel" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const titulo = `Demonstrativos · ${empresa}`;
  const subtitulo = `${sel.rotulo} · ${sel.completude}${anterior ? ` · comparado com ${anterior.rotulo}` : ""}`;
  const arquivo = `Demonstrativos-${semAcento(empresa)
    .replace(/[^\w]+/g, "-")
    .slice(0, 40)}-${semAcento(sel.rotulo).replace(/[^\w]+/g, "-")}`;

  async function pdf() {
    setGerando("pdf");
    setErro(null);
    try {
      const c = conteudo(sel, anterior);
      const colsComp = (t: string) => [
        { titulo: t, peso: 5 },
        { titulo: sel.rotulo, peso: 2, direita: true },
        ...(c.comp ? [{ titulo: c.comp, peso: 2, direita: true }] : []),
      ];
      const secoes: SecaoPdf[] = [
        {
          titulo: "Demonstração do resultado (DRE)",
          texto: "Valores em R$; entre parênteses, negativos.",
          colunas: colsComp("Linha"),
          linhas: c.dre.map((l) => ({
            celulas: [l.rotulo, fmt(l.valor), ...(c.comp ? [l.anterior == null ? "—" : fmt(l.anterior)] : [])],
            negrito: l.total,
            fundo: l.total,
          })),
        },
        {
          titulo: "Fluxo de caixa (DFC, método indireto)",
          texto: sel.ag.dfc ? undefined : "Algum mês do período está sem fluxo de caixa gerado: reprocesse os balancetes do período.",
          colunas: [
            { titulo: "Linha", peso: 6 },
            { titulo: sel.rotulo, peso: 2, direita: true },
          ],
          linhas: c.dfc.map((l) => ({ celulas: [l.rotulo, fmt(l.valor)], negrito: l.total, fundo: l.total })),
        },
        {
          titulo: "Balanço patrimonial",
          texto: `Fechamento em ${fmtData(sel.fim)} contra a abertura em ${fmtData(sel.inicio)}.`,
          colunas: [
            { titulo: "Conta", peso: 5 },
            { titulo: fmtData(sel.fim), peso: 2, direita: true },
            { titulo: `${fmtData(sel.inicio)} (abertura)`, peso: 2, direita: true },
          ],
          linhas: c.balanco.map((l) => ({
            celulas: [`${"  ".repeat(Math.max(0, l.nivel - 1))}${l.rotulo}`, fmt(l.atual), fmt(l.abertura)],
            negrito: l.nivel <= 2,
            fundo: l.nivel <= 1,
          })),
        },
        {
          titulo: "Índices",
          colunas: colsComp("Índice"),
          linhas: c.indices.map((x) => ({
            celulas: [x.nome, fmtIndice(x.valor, x.formato), ...(c.comp ? [fmtIndice(x.anterior, x.formato)] : [])],
            alerta: [false, x.alerta, false],
          })),
        },
      ];
      const bytes = await gerarRelatorioPdf({ titulo, subtitulo, secoes, logo: await carregarLogo(logoUrl) });
      baixarBytes(bytes, `${arquivo}.pdf`);
    } catch (e) {
      setErro(traduzirErro(e));
    }
    setGerando(null);
  }

  async function excel() {
    setGerando("excel");
    setErro(null);
    try {
      const c = conteudo(sel, anterior);
      const colComp = c.comp ? [{ titulo: c.comp, chave: "anterior", largura: 22, formato: "moeda" as const }] : [];
      const abas: AbaExcel[] = [
        {
          nome: "DRE",
          colunas: [
            { titulo: "Linha", chave: "rotulo", largura: 52 },
            { titulo: sel.rotulo, chave: "valor", largura: 22, formato: "moeda" },
            ...colComp,
          ],
          linhas: c.dre,
        },
        {
          nome: "Fluxo de caixa",
          colunas: [
            { titulo: "Linha", chave: "rotulo", largura: 52 },
            { titulo: sel.rotulo, chave: "valor", largura: 22, formato: "moeda" },
          ],
          linhas: c.dfc,
        },
        {
          nome: "Balanço",
          colunas: [
            { titulo: "Conta", chave: "rotulo", largura: 52 },
            { titulo: fmtData(sel.fim), chave: "atual", largura: 20, formato: "moeda" },
            { titulo: `${fmtData(sel.inicio)} (abertura)`, chave: "abertura", largura: 20, formato: "moeda" },
          ],
          linhas: c.balanco.map((l) => ({ ...l, rotulo: `${"   ".repeat(Math.max(0, l.nivel - 1))}${l.rotulo}` })),
        },
        {
          nome: "Índices",
          colunas: [
            { titulo: "Índice", chave: "nome", largura: 40 },
            { titulo: sel.rotulo, chave: "texto", largura: 20 },
            ...(c.comp ? [{ titulo: c.comp, chave: "textoAnterior", largura: 20 }] : []),
          ],
          linhas: c.indices.map((x) => ({
            nome: x.nome,
            texto: fmtIndice(x.valor, x.formato),
            textoAnterior: fmtIndice(x.anterior, x.formato),
          })),
        },
      ];
      await exportarExcel(`${arquivo}.xlsx`, titulo, subtitulo, abas);
    } catch (e) {
      setErro(traduzirErro(e));
    }
    setGerando(null);
  }

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <span className="flex gap-2">
        <button className="btn" onClick={pdf} disabled={!!gerando} title="Relatório do período escolhido, no papel timbrado da MDC">
          {gerando === "pdf" ? "Gerando…" : "PDF do período"}
        </button>
        <button className="btn" onClick={excel} disabled={!!gerando} title="Planilha do período escolhido, com os valores como número">
          {gerando === "excel" ? "Gerando…" : "Excel do período"}
        </button>
      </span>
      {erro && <span className="text-[11px] text-red-700">{erro}</span>}
    </span>
  );
}
