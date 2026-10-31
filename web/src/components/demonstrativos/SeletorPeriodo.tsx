// Seletor de período dos demonstrativos (mês, trimestre, semestre, ano) e o hook que lembra a escolha neste navegador.
"use client";

import { TIPOS_PERIODO } from "@/lib/periodos";
import type { TipoPeriodo } from "@/lib/periodos";
import { CHAVES, useEstadoLembrado } from "@/lib/armazenamentoLocal";

/** Período escolhido (lembrado neste navegador). */
export function useSeletorPeriodo(): [TipoPeriodo, (t: TipoPeriodo) => void] {
  return useEstadoLembrado<TipoPeriodo>(CHAVES.periodoDemonstrativos, "mensal", (v) => TIPOS_PERIODO.some((x) => x.id === v));
}

export function SeletorPeriodo({ tipo, aoMudar }: { tipo: TipoPeriodo; aoMudar: (t: TipoPeriodo) => void }) {
  return (
    <div className="flex rounded-lg border border-[var(--borda)] bg-white p-0.5 text-sm print:hidden" role="group" aria-label="Período">
      {TIPOS_PERIODO.map((p) => (
        <button
          key={p.id}
          className={`rounded-md px-3 py-1 ${tipo === p.id ? "bg-[var(--marca)] text-white" : ""}`}
          onClick={() => aoMudar(p.id)}
        >
          {p.nome}
        </button>
      ))}
    </div>
  );
}
