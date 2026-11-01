// Botão "Excel do período": exporta exatamente o período escolhido no topo da análise (DRE e DFC somadas,
// balanço do fim do período, índices e a comparação com o mesmo período do ano anterior), com os valores como número.
// O PDF do período é o completo e assinado, gerado no servidor pelo BotaoPdf.
"use client";

import { useState } from "react";
import { INDICES_INFO } from "@/dominios/demonstrativos/balancete/indices";
import { linhasDre } from "@/dominios/demonstrativos/calculosDemonstracoes";
import type { Dfc, LinhaBp } from "@/dominios/demonstrativos/calculosDemonstracoes";
import type { Selecao } from "@/dominios/demonstrativos/selecaoPeriodo";
import type { BalanceteReg } from "@/dominios/demonstrativos/tipos";
import { exportarExcel } from "@/lib/arquivos/excel";
import type { AbaExcel } from "@/lib/arquivos/excel";
import { traduzirErro } from "@/lib/erros";
import { fmtData } from "@/lib/formato/datas";
import { fmtIndice } from "@/lib/formato/numero";
import { semAcento } from "@/lib/texto";

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
}: {
  sel: Selecao<BalanceteReg>;
  anterior: Selecao<BalanceteReg> | null;
  empresa: string;
}) {
  const [gerando, setGerando] = useState<"excel" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const titulo = `Demonstrativos · ${empresa}`;
  const subtitulo = `${sel.rotulo} · ${sel.completude}${anterior ? ` · comparado com ${anterior.rotulo}` : ""}`;
  const arquivo = `Demonstrativos-${semAcento(empresa)
    .replace(/[^\w]+/g, "-")
    .slice(0, 40)}-${semAcento(sel.rotulo).replace(/[^\w]+/g, "-")}`;

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
        <button className="btn" onClick={excel} disabled={!!gerando} title="Planilha do período escolhido, com os valores como número">
          {gerando === "excel" ? "Gerando…" : "Excel do período"}
        </button>
      </span>
      {erro && <span className="text-[11px] text-red-700">{erro}</span>}
    </span>
  );
}
