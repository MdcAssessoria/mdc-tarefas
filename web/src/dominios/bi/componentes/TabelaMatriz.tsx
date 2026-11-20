// Tabela da DRE ou do DFC: uma linha por conta, um mês por coluna e o total (no celular só o total). Na DRE pode
// mostrar a análise vertical (% da receita líquida). Cada linha abre nas contas do plano (bi_relatorio_contas) e cada
// valor abre a origem (notas e títulos, JanelaOrigem). Exporta PDF e Excel do que está na tela, contas abertas incluídas.
"use client";

import { useState } from "react";
import { rotuloMes } from "@/dominios/financeiro/painel";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import type { ColunaLista } from "@/lib/arquivos/exportarLista";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { Icone } from "@/components/ui/Icone";
import { QuadroTabela } from "@/components/ui/QuadroTabela";
import { Valor } from "@/components/ui/Valor";
import { analiseVertical, fmtVariacao } from "../comparar";
import { contaDoClique } from "../detalhe";
import type { ContaMatriz } from "../detalhe";
import type { LinhaMatriz, Matriz, TipoRelatorio } from "../relatorio";
import { textoEliminacao } from "./contexto";
import type { ContextoBi } from "./contexto";
import type { PedidoOrigem } from "./JanelaOrigem";

const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : fmtVariacao(v).replace("+", ""));

type Linha = LinhaMatriz & { conta?: ContaMatriz };

/** Valor clicável: abre de onde ele vem. Zero não abre (não há o que mostrar). */
function ValorClicavel({ v, forte, aoClicar, dica }: { v: number; forte?: boolean; aoClicar?: () => void; dica: string }) {
  if (!aoClicar || v === 0) return <Valor v={v} className={forte ? "font-semibold" : ""} />;
  return (
    <button
      type="button"
      onClick={aoClicar}
      title={dica}
      aria-label={dica}
      className="rounded px-1 underline decoration-dotted underline-offset-4 hover:bg-[var(--fundo)] hover:decoration-solid focus-visible:outline-2"
    >
      <Valor v={v} className={forte ? "font-semibold" : ""} />
    </button>
  );
}

export function TabelaMatriz({
  m,
  rel,
  titulo,
  c,
  contas,
  aoAbrir,
}: {
  m: Matriz;
  rel: TipoRelatorio;
  titulo: string;
  c: ContextoBi;
  /** Contas do plano por linha (sem elas, a linha não abre). */
  contas?: Map<string, ContaMatriz[]>;
  /** Clique num valor de linha analítica ou de conta: abre a origem. */
  aoAbrir?: (p: PedidoOrigem) => void;
}) {
  const [vertical, setVertical] = useState(rel === "dre");
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const av = analiseVertical(m);
  const receita = m.linhas.find((l) => l.codigo === "receita_liquida")?.total ?? 0;
  const comVertical = rel === "dre" && vertical;
  const comContas = m.linhas.filter((l) => !l.subtotal && (contas?.get(l.codigo)?.length ?? 0) > 0).map((l) => l.codigo);
  const todasAbertas = comContas.length > 0 && comContas.every((k) => abertas.has(k));

  const alternar = (k: string) =>
    setAbertas((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const visiveis: Linha[] = m.linhas.flatMap((l) => [
    l,
    ...(abertas.has(l.codigo) ? (contas?.get(l.codigo) ?? []).map((x) => ({ ...x, conta: x })) : []),
  ]);
  const verticalDe = (l: Linha) => (l.conta ? (receita ? l.total / receita : null) : av.get(l.codigo));

  const abrir = (l: Linha, mes: string | null, v: number) =>
    aoAbrir && !l.subtotal
      ? () =>
          aoAbrir({
            linha: l.conta ? l.conta.linha : l.codigo,
            conta: contaDoClique(l.conta ?? null),
            mes,
            titulo: l.conta ? `${m.linhas.find((x) => x.codigo === l.conta!.linha)?.nome ?? ""} · ${l.nome}` : l.nome,
            valor: v,
          })
      : undefined;

  const colunas: ColunaLista<Linha>[] = [
    { titulo: "Conta", valor: (l) => (l.conta ? `    ${l.nome}` : l.nome), peso: 3.2, largura: 52 },
    ...m.meses.map((mes, i) => ({
      titulo: rotuloMes(mes),
      valor: (l: Linha) => l.valores[i],
      formato: "moeda" as const,
      alerta: (l: Linha) => l.valores[i] < 0,
    })),
    { titulo: "Total", valor: (l) => l.total, formato: "moeda", peso: 1.2, alerta: (l) => l.total < 0 },
    ...(comVertical ? [{ titulo: "% receita", valor: (l: Linha) => pct(verticalDe(l)), peso: 0.8 }] : []),
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
          {comContas.length > 0 && (
            <button type="button" className="btn" onClick={() => setAbertas(todasAbertas ? new Set() : new Set(comContas))}>
              <Icone nome={todasAbertas ? "seta-cima" : "chevron-baixo"} className="h-4 w-4" />
              {todasAbertas ? "Fechar as contas" : "Abrir todas as contas"}
            </button>
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
              linhas: visiveis,
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
          {visiveis.map((l) => {
            const abre = !l.conta && comContas.includes(l.codigo);
            const aberta = abertas.has(l.codigo);
            const fundo = l.subtotal ? "bg-[var(--fundo)]" : l.conta ? "bg-neutral-50" : "bg-white";
            return (
              <tr key={l.codigo} className={l.subtotal ? "bg-[var(--fundo)]" : l.conta ? "bg-neutral-50 text-[13px]" : ""}>
                <td
                  className={`celula-titulo sticky left-0 z-[1] ${fundo} ${l.subtotal ? "font-semibold text-[var(--marca)]" : "!font-normal"} ${l.conta ? "pl-8 text-[var(--texto-suave)]" : ""}`}
                >
                  {abre ? (
                    <button
                      type="button"
                      onClick={() => alternar(l.codigo)}
                      aria-expanded={aberta}
                      className="text-left hover:text-[var(--marca)]"
                    >
                      <span className="flex items-center gap-1.5">
                        <Icone nome={aberta ? "chevron-baixo" : "chevron-direita"} className="h-4 w-4 shrink-0" />
                        {l.nome}
                      </span>
                    </button>
                  ) : (
                    l.nome
                  )}
                </td>
                {l.valores.map((v, i) => (
                  <td key={m.meses[i]} className="hidden text-right md:table-cell">
                    <ValorClicavel
                      v={v}
                      forte={l.subtotal}
                      aoClicar={abrir(l, m.meses[i], v)}
                      dica={`Ver de onde vem: ${l.nome}, ${rotuloMes(m.meses[i])}`}
                    />
                  </td>
                ))}
                <td className="text-right">
                  <ValorClicavel v={l.total} forte={l.subtotal} aoClicar={abrir(l, null, l.total)} dica={`Ver de onde vem: ${l.nome}`} />
                </td>
                {comVertical && <td className="num text-right text-[var(--texto-suave)]">{pct(verticalDe(l))}</td>}
              </tr>
            );
          })}
        </tbody>
      </QuadroTabela>
      <p className="text-xs text-[var(--texto-suave)]">
        Clique na seta para abrir a linha nas contas do plano e clique num valor sublinhado para ver as notas e os títulos que o formam. No
        celular aparece só o total do período; os meses aparecem na tela maior e nos arquivos PDF e Excel.
      </p>
    </div>
  );
}
