"use client";

import { useId, useState } from "react";

/** Etiquetas livres (grupos de clientes): digita e Enter para incluir, sugestões das já usadas. */
export function Etiquetas({
  valor,
  aoMudar,
  sugestoes = [],
  placeholder = "Adicionar grupo…",
  compacto,
}: {
  valor: string[];
  aoMudar: (v: string[]) => void;
  sugestoes?: string[];
  placeholder?: string;
  compacto?: boolean;
}) {
  const [texto, setTexto] = useState("");
  const lista = useId();
  const incluir = (t: string) => {
    const v = t.trim().replace(/\s+/g, " ");
    if (!v || valor.some((x) => x.toLowerCase() === v.toLowerCase())) return setTexto("");
    aoMudar([...valor, v]);
    setTexto("");
  };
  return (
    <div
      className={`flex flex-wrap items-center gap-1 rounded-lg border border-[var(--borda)] bg-white px-1.5 ${compacto ? "min-h-8 py-0.5" : "min-h-10 py-1"}`}
    >
      {valor.map((g) => (
        <span key={g} className="chip bg-[#F6EEDC] text-[#6B5220]">
          {g}
          <button
            type="button"
            className="ml-0.5 opacity-60 hover:opacity-100"
            onClick={() => aoMudar(valor.filter((x) => x !== g))}
            aria-label={`Remover ${g}`}
          >
            ✕
          </button>
        </span>
      ))}
      <input
        list={lista}
        className="min-w-24 flex-1 bg-transparent px-1 text-sm outline-none"
        placeholder={valor.length ? "" : placeholder}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            incluir(texto);
          } else if (e.key === "Backspace" && !texto && valor.length) aoMudar(valor.slice(0, -1));
        }}
        onBlur={() => texto && incluir(texto)}
      />
      <datalist id={lista}>
        {sugestoes
          .filter((s) => !valor.includes(s))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </div>
  );
}
