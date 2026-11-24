// Tabela da projeção da DRE: linha × (ano-base + anos projetados). Em cada linha analítica escolhe-se o modo
// (crescimento ou % da receita); em cada ano, a taxa (%) e o valor. Valor ou taxa digitados ficam destacados; apagar
// volta ao cálculo. Subtotais calculados (não editam). Valores positivos na digitação, como no orçamento.
"use client";

import { useState } from "react";
import { Icone } from "@/components/ui/Icone";
import { QuadroDemonstrativo } from "@/components/ui/QuadroDemonstrativo";
import { lerValor } from "../lancamentos";
import type { Modo, Projecao } from "../projecao";
import { LINHA_RECEITA } from "../projecao";
import { classeDaLinha, TdValor } from "./Demonstrativo";

const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (v: number | null | undefined) => (v == null ? "" : v.toLocaleString("pt-BR", { maximumFractionDigits: 2 }));

/** Campo numérico que só grava ao sair (ou Enter); em branco = volta ao cálculo. */
function Celula({
  valor,
  texto,
  destaque,
  rotulo,
  pct = false,
  desabilitado,
  aoMudar,
}: {
  valor: number | null;
  texto?: string;
  destaque: boolean;
  rotulo: string;
  pct?: boolean;
  desabilitado: boolean;
  aoMudar: (n: number | null) => void;
}) {
  const inicial = texto ?? (valor == null ? "" : pct ? fmtPct(valor) : fmt(valor));
  const [t, setT] = useState(inicial);
  const [erro, setErro] = useState(false);
  function gravar() {
    if (t === inicial) return;
    const n = lerValor(t);
    if (Number.isNaN(n)) return setErro(true);
    setErro(false);
    aoMudar(n === null ? null : pct ? n : Math.abs(n));
  }
  return (
    <input
      aria-label={rotulo}
      aria-invalid={erro}
      inputMode="decimal"
      disabled={desabilitado}
      value={t}
      onChange={(e) => setT(e.target.value)}
      onBlur={gravar}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className={`num w-full rounded border px-2 py-1 text-right text-sm disabled:border-transparent disabled:bg-transparent ${
        erro ? "border-red-500 bg-red-50" : destaque ? "border-[var(--destaque-escuro)] bg-amber-50" : "border-[var(--borda)] bg-white"
      } ${pct ? "max-w-[5.5rem]" : ""}`}
    />
  );
}

export function TabelaProjecao({
  proj,
  taxasDigitadas,
  podeEditar,
  aoMudarModo,
  aoMudarTaxa,
  aoMudarValor,
  aoMudarBase,
}: {
  proj: Projecao;
  /** Taxas digitadas por linha (o resto é padrão do modo). */
  taxasDigitadas: Record<string, (number | null)[]>;
  podeEditar: boolean;
  aoMudarModo: (codigo: string, modo: Modo) => void;
  aoMudarTaxa: (codigo: string, ano: number, taxa: number | null) => void;
  aoMudarValor: (codigo: string, ano: number, valor: number | null) => void;
  aoMudarBase: (codigo: string, valor: number | null) => void;
}) {
  const projetados = proj.anos.slice(1);
  return (
    <QuadroDemonstrativo rotulo={`Projeção da DRE ${proj.anos[0]} a ${proj.anos[proj.anos.length - 1]}`}>
      <thead>
        <tr>
          <th rowSpan={2}>Linha</th>
          <th rowSpan={2} className="min-w-[9rem]">
            Como projeta
          </th>
          <th rowSpan={2} className="min-w-[8.5rem]">
            {proj.anos[0]} (base)
          </th>
          {projetados.map((a) => (
            <th key={a} colSpan={2} className="demo-total">
              {a}
            </th>
          ))}
        </tr>
        <tr>
          {projetados.map((a) => [
            <th key={`${a}t`} className="min-w-[5.5rem] !text-xs !font-normal">
              %
            </th>,
            <th key={`${a}v`} className="min-w-[8.5rem] !text-xs !font-normal">
              Valor
            </th>,
          ])}
        </tr>
      </thead>
      <tbody>
        {proj.linhas.map((l) => {
          const chave = `${l.codigo}|${l.valores.join(",")}|${l.taxas.join(",")}|${l.modo}`;
          if (l.subtotal)
            return (
              <tr key={l.codigo} className={classeDaLinha(l.codigo, true)}>
                <td className="demo-conta">{l.nome}</td>
                <td />
                <TdValor v={l.valores[0]} />
                {projetados.map((a, i) => [
                  <td key={`${a}t`} className="num text-right text-xs text-[var(--texto-suave)]">
                    {variacaoTexto(l.valores[i], l.valores[i + 1])}
                  </td>,
                  <TdValor key={`${a}v`} v={l.valores[i + 1]} className="demo-total" />,
                ])}
              </tr>
            );
          const receitaFixa = l.codigo === LINHA_RECEITA;
          return (
            <tr key={l.codigo} className={classeDaLinha(l.codigo, false)}>
              <td className="demo-conta">{l.nome}</td>
              <td className="!p-1">
                <select
                  aria-label={`Como projetar ${l.nome}`}
                  disabled={!podeEditar || receitaFixa}
                  value={l.modo ?? "crescimento"}
                  onChange={(e) => aoMudarModo(l.codigo, e.target.value as Modo)}
                  className="w-full rounded border border-[var(--borda)] bg-white px-1 py-1 text-xs disabled:border-transparent disabled:bg-transparent"
                >
                  <option value="crescimento">{l.natureza === "R" ? "Crescimento %" : "Reajuste %"}</option>
                  {!receitaFixa && <option value="receita">% da receita</option>}
                </select>
              </td>
              <td className="!p-1">
                <Celula
                  key={`b${chave}`}
                  valor={Math.abs(l.valores[0])}
                  destaque={l.manual[0]}
                  rotulo={`${l.nome}, ${proj.anos[0]} (base)`}
                  desabilitado={!podeEditar}
                  aoMudar={(n) => aoMudarBase(l.codigo, n)}
                />
              </td>
              {projetados.map((a, i) => [
                <td key={`${a}t`} className="!p-1">
                  <Celula
                    key={`t${chave}`}
                    pct
                    valor={l.taxas[i]}
                    destaque={taxasDigitadas[l.codigo]?.[i] != null}
                    rotulo={`${l.nome}, ${a}, ${l.modo === "receita" ? "% da receita" : "% de crescimento"}`}
                    desabilitado={!podeEditar || l.manual[i + 1]}
                    aoMudar={(n) => aoMudarTaxa(l.codigo, i, n)}
                  />
                </td>,
                <td key={`${a}v`} className="!p-1">
                  <Celula
                    key={`v${chave}`}
                    valor={Math.abs(l.valores[i + 1])}
                    destaque={l.manual[i + 1]}
                    rotulo={`${l.nome}, ${a}, valor`}
                    desabilitado={!podeEditar}
                    aoMudar={(n) => aoMudarValor(l.codigo, i, n)}
                  />
                </td>,
              ])}
            </tr>
          );
        })}
      </tbody>
    </QuadroDemonstrativo>
  );
}

function variacaoTexto(antes: number, depois: number) {
  if (!antes) return "";
  const v = ((depois - antes) / Math.abs(antes)) * 100;
  return `${v >= 0 ? "+" : ""}${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

/** Legenda curta embaixo da tabela. */
export function LegendaProjecao() {
  return (
    <p className="flex items-start gap-2 text-xs text-[var(--texto-suave)]">
      <Icone nome="info" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      Digite valores positivos (custo e despesa saem negativos nos subtotais). Campo em amarelo foi digitado; apague para
      voltar ao cálculo. Nos subtotais, o % é a variação sobre o ano anterior.
    </p>
  );
}
