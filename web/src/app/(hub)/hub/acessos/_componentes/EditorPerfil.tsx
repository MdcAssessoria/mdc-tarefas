// Janela para criar ou editar um perfil de acesso (nome e nível em cada ferramenta).
"use client";

import { useState } from "react";
import { PAPEIS_APP } from "@/lib/types";
import type { PapelApp } from "@/lib/types";
import type { Perfil } from "@/dominios/acessos/tipos";

export function EditorPerfil({
  perfil,
  ferramentas,
  aoFechar,
  aoSalvar,
}: {
  perfil: Perfil;
  ferramentas: { slug: string; nome: string; status: string }[];
  aoFechar: () => void;
  aoSalvar: (p: Perfil) => void;
}) {
  const [p, setP] = useState(perfil);
  const definir = (slug: string, v: string) =>
    setP((x) => {
      const apps = { ...x.apps };
      if (v) apps[slug] = v as PapelApp;
      else delete apps[slug];
      return { ...x, apps };
    });
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={aoFechar}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          aoSalvar(p);
        }}
        className="cartao max-h-[90vh] w-full max-w-lg space-y-3 overflow-y-auto p-5"
      >
        <h2 className="text-lg font-semibold text-[var(--marca)]">{perfil.id ? `Perfil ${perfil.nome}` : "Novo perfil"}</h2>
        <label className="campo">
          <span>Nome do perfil</span>
          <input
            required
            value={p.nome}
            onChange={(e) => setP({ ...p, nome: e.target.value })}
            placeholder="Ex.: Fiscal, Contábil, Estagiário"
          />
        </label>
        <div>
          <div className="mb-1 text-sm font-medium">Ferramentas liberadas</div>
          <div className="divide-y divide-[var(--borda)] rounded-lg border border-[var(--borda)]">
            {ferramentas.map((f) => (
              <div key={f.slug} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-sm">
                  {f.nome}
                  {f.status === "em_breve" && <span className="ml-1 text-xs text-neutral-400">(em construção)</span>}
                </span>
                <div className="flex rounded-md border border-[var(--borda)] p-0.5 text-xs">
                  {[{ id: "", nome: "Sem acesso" }, ...PAPEIS_APP].map((n) => (
                    <button
                      type="button"
                      key={n.id}
                      onClick={() => definir(f.slug, n.id)}
                      className={`rounded px-2 py-1 ${(p.apps[f.slug] ?? "") === n.id ? "bg-[var(--marca)] text-white" : "text-neutral-600"}`}
                    >
                      {n.nome}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-neutral-500">{PAPEIS_APP.map((x) => `${x.nome}: ${x.ajuda}`).join(" · ")}.</p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn" onClick={aoFechar}>
            Cancelar
          </button>
          <button className="btn-primario">Salvar perfil</button>
        </div>
      </form>
    </div>
  );
}
