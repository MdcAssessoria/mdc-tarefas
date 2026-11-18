"use client";
// Escolha de vários clientes para a mesma tarefa (Nova tarefa › "Vários clientes"): busca por nome, CNPJ ou código do
// Domínio, filtros por regime e grupo, "Marcar os N mostrados" / "Desmarcar todos" e a lista com caixas de marcar.
// Os clientes que já têm a tarefa aparecem marcados com "já tem" e ficam de fora na gravação. Regras em ../lote.ts.
import { useMemo, useState } from "react";
import type { Cliente } from "@/dominios/clientes/tipos";
import { REGIMES } from "@/dominios/clientes/tipos";
import { gruposDosClientes } from "@/dominios/clientes/grupos";
import { nomeCliente } from "@/dominios/clientes/nome";
import { Icone } from "@/components/ui/Icone";
import { Chip } from "@/components/ui/Chip";
import { LIMITE_LOTE, filtrarClientes } from "@/dominios/tarefas/lote";

export function SeletorClientes({
  clientes,
  marcados,
  aoMudar,
  jaTem,
}: {
  clientes: Cliente[];
  marcados: Set<string>;
  aoMudar: (s: Set<string>) => void;
  jaTem: Set<string>;
}) {
  const [busca, setBusca] = useState("");
  const [regime, setRegime] = useState("");
  const [grupo, setGrupo] = useState("");
  const grupos = useMemo(() => gruposDosClientes(clientes.filter((c) => c.ativo)), [clientes]);
  const mostrados = useMemo(() => filtrarClientes(clientes, { busca, regime, grupo }), [clientes, busca, regime, grupo]);
  const naoMarcadosMostrados = mostrados.filter((c) => !marcados.has(c.id)).length;

  const alternar = (id: string) => {
    const n = new Set(marcados);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    aoMudar(n);
  };
  const marcarMostrados = () => {
    const n = new Set(marcados);
    for (const c of mostrados) if (n.size < LIMITE_LOTE) n.add(c.id);
    aoMudar(n);
  };

  return (
    <div className="space-y-3 rounded-lg border border-[var(--borda)] p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="campo sm:col-span-3 md:col-span-1">
          <span>Procurar</span>
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Nome, CNPJ ou código"
            aria-label="Procurar cliente"
          />
        </label>
        <label className="campo">
          <span>Regime</span>
          <select value={regime} onChange={(e) => setRegime(e.target.value)}>
            <option value="">Todos</option>
            {REGIMES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Grupo</span>
          <select value={grupo} onChange={(e) => setGrupo(e.target.value)} disabled={!grupos.length}>
            <option value="">{grupos.length ? "Todos" : "Sem grupos"}</option>
            {grupos.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn" onClick={marcarMostrados} disabled={!naoMarcadosMostrados}>
          <Icone nome="check" className="h-4 w-4" />
          Marcar os {mostrados.length} mostrados
        </button>
        <button type="button" className="btn" onClick={() => aoMudar(new Set())} disabled={!marcados.size}>
          <Icone nome="fechar" className="h-4 w-4" />
          Desmarcar todos
        </button>
        <span className="ml-auto text-sm font-medium text-[var(--marca)]">
          {marcados.size} {marcados.size === 1 ? "cliente escolhido" : "clientes escolhidos"}
        </span>
      </div>

      <ul className="max-h-72 divide-y divide-[var(--borda)] overflow-y-auto rounded-md border border-[var(--borda)]">
        {mostrados.length === 0 && (
          <li className="p-3 text-sm text-[var(--texto-suave)]">Nenhum cliente ativo com esse filtro. Limpe a busca ou troque o regime.</li>
        )}
        {mostrados.map((c) => (
          <li key={c.id}>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-[var(--fundo)]">
              <input type="checkbox" checked={marcados.has(c.id)} onChange={() => alternar(c.id)} />
              <span className="min-w-0 flex-1 truncate">
                {nomeCliente(c)}
                {c.codigo_dominio && <span className="text-xs text-[var(--texto-suave)]"> · {c.codigo_dominio}</span>}
              </span>
              {jaTem.has(c.id) && (
                <span className="shrink-0">
                  <Chip tom="ambar">já tem</Chip>
                </span>
              )}
              <span className="hidden shrink-0 text-xs text-[var(--texto-suave)] sm:inline">
                {REGIMES.find((r) => r.id === c.regime)?.nome ?? ""}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {marcados.size >= LIMITE_LOTE && <p className="text-xs text-[var(--alerta)]">Limite de {LIMITE_LOTE} clientes por vez.</p>}
    </div>
  );
}
