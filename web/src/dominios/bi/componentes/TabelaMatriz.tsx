// Tabela da DRE ou do DFC: uma linha por conta, um mês por coluna e o total (no celular só o total). Na DRE pode
// mostrar a análise vertical (% da receita líquida). Exporta PDF e Excel do que está na tela.
"use client";

import { useState } from "react";
import { rotuloMes } from "@/dominios/financeiro/painel";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import type { ColunaLista } from "@/lib/arquivos/exportarLista";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { QuadroTabela } from "@/components/ui/QuadroTabela";
import { Valor } from "@/components/ui/Valor";
import { analiseVertical, fmtVariacao } from "../comparar";
import type { LinhaMatriz, Matriz, TipoRelatorio } from "../relatorio";
import { textoEliminacao } from "./contexto";
import type { ContextoBi } from "./contexto";

const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : fmtVariacao(v).replace("+", ""));

export function TabelaMatriz({ m, rel, titulo, c }: { m: Matriz; rel: TipoRelatorio; titulo: string; c: ContextoBi }) {
  const [vertical, setVertical] = useState(rel === "dre");
  const av = analiseVertical(m);
  const comVertical = rel === "dre" && vertical;

  const colunas: ColunaLista<LinhaMatriz>[] = [
    { titulo: "Conta", valor: (l) => l.nome, peso: 3.2, largura: 44 },
    ...m.meses.map((mes, i) => ({
      titulo: rotuloMes(mes),
      valor: (l: LinhaMatriz) => l.valores[i],
      formato: "moeda" as const,
      alerta: (l: LinhaMatriz) => l.valores[i] < 0,
    })),
    { titulo: "Total", valor: (l) => l.total, formato: "moeda", peso: 1.2, alerta: (l) => l.total < 0 },
    ...(comVertical ? [{ titulo: "% receita", valor: (l: LinhaMatriz) => pct(av.get(l.codigo)), peso: 0.8 }] : []),
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold text-[var(--marca)]">{titulo}</h2>
          <p className="text-sm text-[var(--texto-suave)]">
            {c.quem} · {c.rotuloPeriodo}
            {textoEliminacao(c)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {rel === "dre" && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={vertical} onChange={(e) => setVertical(e.target.checked)} />% da receita líquida
            </label>
          )}
          <BotoesExportar
            vazio={!m.linhas.length}
            avisar={c.avisar}
            montar={() => ({
              titulo: `${titulo} · ${c.quem}`,
              subtitulo: `${c.rotuloPeriodo}${textoEliminacao(c)}`,
              arquivo: nomeArquivo(rel === "dre" ? "DRE-gerencial" : "Fluxo-de-caixa", c.quem, c.hoje),
              logoUrl: c.logoUrl,
              paisagem: true,
              linhas: m.linhas,
              colunas,
            })}
          />
        </div>
      </div>
      <QuadroTabela rotulo={titulo} cartoes={false}>
        <thead>
          <tr>
            <th className="sticky left-0 z-[1] min-w-[14rem] bg-[var(--fundo)]">Conta</th>
            {m.meses.map((mes) => (
              <th key={mes} className="hidden text-right md:table-cell">
                {rotuloMes(mes)}
              </th>
            ))}
            <th className="text-right">Total</th>
            {comVertical && <th className="text-right">% receita</th>}
          </tr>
        </thead>
        <tbody>
          {m.linhas.map((l) => (
            <tr key={l.codigo} className={l.subtotal ? "bg-[var(--fundo)]" : ""}>
              <td
                className={`celula-titulo sticky left-0 z-[1] ${l.subtotal ? "bg-[var(--fundo)] font-semibold text-[var(--marca)]" : "bg-white !font-normal"}`}
              >
                {l.nome}
              </td>
              {l.valores.map((v, i) => (
                <td key={m.meses[i]} className={`hidden text-right md:table-cell ${l.subtotal ? "font-semibold" : ""}`}>
                  <Valor v={v} />
                </td>
              ))}
              <td className={`text-right ${l.subtotal ? "font-semibold" : ""}`}>
                <Valor v={l.total} />
              </td>
              {comVertical && <td className="num text-right text-[var(--texto-suave)]">{pct(av.get(l.codigo))}</td>}
            </tr>
          ))}
        </tbody>
      </QuadroTabela>
      <p className="text-xs text-[var(--texto-suave)]">
        No celular aparece só o total do período; os meses aparecem na tela maior e nos arquivos PDF e Excel.
      </p>
    </div>
  );
}
