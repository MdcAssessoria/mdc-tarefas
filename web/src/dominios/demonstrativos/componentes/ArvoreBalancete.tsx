// Balancete em árvore (contas sintéticas e analíticas), com busca, recolher/expandir e comparação com o mês
// anterior; a equipe pode ainda editar o grupo gerencial e a linha da DFC de cada conta analítica.
"use client";

import { useState } from "react";
import { nomeGrupo } from "@/dominios/demonstrativos/balancete/classificacao";
import { fmtNumero } from "@/lib/formato/numero";
import type { LinhaReg } from "@/dominios/demonstrativos/tipos";

/** Balancete em árvore, com busca e comparação com o mês anterior. */
export function ArvoreBalancete({
  linhas,
  anteriores,
  editarGrupo,
  editarDfc,
}: {
  linhas: LinhaReg[];
  anteriores?: Map<string, number>;
  editarGrupo?: (l: LinhaReg) => React.ReactNode;
  editarDfc?: (l: LinhaReg) => React.ReactNode;
}) {
  const [busca, setBusca] = useState("");
  const [fechados, setFechados] = useState<Set<string>>(new Set());
  const q = busca.trim().toLowerCase();
  const visiveis = linhas.filter((l) => {
    if (q) return l.descricao.toLowerCase().includes(q) || l.classificacao.startsWith(q);
    return ![...fechados].some((f) => l.classificacao !== f && l.classificacao.startsWith(f + "."));
  });
  const temFilhos = (l: LinhaReg) => !l.analitica;
  const nat = (v: number) => (v === 0 ? "" : v > 0 ? " D" : " C");
  const fmt = (v: number) => (v === 0 ? "—" : fmtNumero(Math.abs(v)));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 print:hidden">
        <input className="entrada w-64" placeholder="Buscar conta…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <button
          className="btn"
          onClick={() => setFechados(new Set(linhas.filter((l) => l.nivel === 2 && !l.analitica).map((l) => l.classificacao)))}
        >
          Recolher
        </button>
        <button className="btn" onClick={() => setFechados(new Set())}>
          Expandir tudo
        </button>
      </div>
      <div className="cartao overflow-x-auto">
        <table className="tabela text-[13px]">
          <thead>
            <tr>
              <th>Classificação</th>
              <th>Conta</th>
              <th className="text-right">Saldo anterior</th>
              <th className="text-right">Débitos</th>
              <th className="text-right">Créditos</th>
              <th className="text-right">Saldo atual</th>
              {anteriores && <th className="text-right">Variação</th>}
              {editarGrupo && <th>Grupo gerencial</th>}
              {editarDfc && <th>Linha na DFC</th>}
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l) => {
              const ant = anteriores?.get(l.classificacao);
              const dv = ant !== undefined ? l.saldo_atual - ant : null;
              const fechado = fechados.has(l.classificacao);
              return (
                <tr key={l.id} className={l.analitica ? "" : "bg-[var(--fundo)] font-medium"}>
                  <td className="whitespace-nowrap text-neutral-500">{l.classificacao}</td>
                  <td style={{ paddingLeft: 10 + (l.nivel - 1) * 14 }}>
                    {temFilhos(l) && !q ? (
                      <button
                        className="mr-1 text-neutral-400"
                        onClick={() =>
                          setFechados((s) => {
                            const n = new Set(s);
                            if (n.has(l.classificacao)) n.delete(l.classificacao);
                            else n.add(l.classificacao);
                            return n;
                          })
                        }
                        aria-label={fechado ? "Abrir" : "Recolher"}
                      >
                        {fechado ? "▸" : "▾"}
                      </button>
                    ) : null}
                    {l.descricao}
                  </td>
                  <td className="whitespace-nowrap text-right tabular-nums">
                    {fmt(l.saldo_anterior)}
                    {nat(l.saldo_anterior)}
                  </td>
                  <td className="whitespace-nowrap text-right tabular-nums">{fmt(l.debitos)}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">{fmt(l.creditos)}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">
                    {fmt(l.saldo_atual)}
                    {nat(l.saldo_atual)}
                  </td>
                  {anteriores && (
                    <td
                      className={`whitespace-nowrap text-right tabular-nums text-xs ${dv && Math.abs(dv) > 0.5 ? "" : "text-neutral-400"}`}
                    >
                      {dv === null
                        ? "novo"
                        : Math.abs(dv) < 0.5
                          ? "—"
                          : `${dv > 0 ? "+" : "−"}${fmt(dv)}${ant ? ` (${((Math.abs(dv) / Math.abs(ant)) * 100).toFixed(0)}%)` : ""}`}
                    </td>
                  )}
                  {editarGrupo && (
                    <td>{l.analitica ? editarGrupo(l) : <span className="text-xs text-neutral-400">{nomeGrupo(l.grupo)}</span>}</td>
                  )}
                  {editarDfc && <td>{l.analitica ? editarDfc(l) : null}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
