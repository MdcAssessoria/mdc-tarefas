"use client";

import { useEffect, useRef, useState } from "react";

export interface OpcaoMulti {
  id: string;
  nome: string;
  cor?: string;
  grupo?: string;
}

/** Caixa de seleção múltipla com busca: vazio = todos. */
export function MultiSelecao({
  rotulo,
  todos,
  opcoes,
  valor,
  aoMudar,
}: {
  rotulo: string;
  todos: string;
  opcoes: OpcaoMulti[];
  valor: string[];
  aoMudar: (v: string[]) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setAberto(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const sel = new Set(valor);
  const alternar = (id: string) => aoMudar(sel.has(id) ? valor.filter((x) => x !== id) : [...valor, id]);
  const q = busca.trim().toLowerCase();
  const visiveis = opcoes.filter((o) => !q || o.nome.toLowerCase().includes(q));
  const resumo =
    valor.length === 0 ? todos : valor.length === 1 ? opcoes.find((o) => o.id === valor[0])?.nome ?? "1 selecionado" : `${valor.length} selecionados`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className={`entrada flex w-full items-center justify-between gap-2 text-left ${valor.length ? "!border-[var(--marca)]" : ""}`}
        onClick={() => setAberto((x) => !x)}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-label={rotulo}
      >
        <span className="truncate">{resumo}</span>
        <span className="text-neutral-400" aria-hidden="true">
          ▾
        </span>
      </button>
      {aberto && (
        <div className="absolute left-0 z-40 mt-1 w-full min-w-60 rounded-xl border border-[var(--borda)] bg-white p-2 shadow-lg">
          {opcoes.length > 8 && (
            <input className="entrada mb-2 !min-h-8 text-sm" placeholder="Buscar…" value={busca} onChange={(e) => setBusca(e.target.value)} autoFocus />
          )}
          <div className="max-h-72 overflow-y-auto" role="listbox" aria-multiselectable="true">
            {visiveis.map((o, i) => (
              <div key={o.id}>
                {o.grupo && o.grupo !== visiveis[i - 1]?.grupo && (
                  <div className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{o.grupo}</div>
                )}
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-[var(--fundo)]">
                  <input type="checkbox" className="h-4 w-4 accent-[var(--marca)]" checked={sel.has(o.id)} onChange={() => alternar(o.id)} />
                  {o.cor && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: o.cor }} />}
                  <span className="truncate">{o.nome}</span>
                </label>
              </div>
            ))}
            {visiveis.length === 0 && <p className="px-2 py-1 text-sm text-neutral-500">Nada encontrado.</p>}
          </div>
          <div className="mt-2 flex justify-between border-t border-[var(--borda)] pt-2 text-xs">
            <button type="button" className="btn-link" onClick={() => aoMudar([])}>
              Limpar ({todos.toLowerCase()})
            </button>
            <button type="button" className="btn-link" onClick={() => setAberto(false)}>
              Pronto
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
