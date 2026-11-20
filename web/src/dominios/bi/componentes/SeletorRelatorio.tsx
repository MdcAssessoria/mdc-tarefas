// Botões DRE / Fluxo de caixa usados nas abas do BI.
"use client";

import { Icone } from "@/components/ui/Icone";
import type { TipoRelatorio } from "../relatorio";

const OPCOES: { id: TipoRelatorio; nome: string; icone: "grafico" | "tendencia" }[] = [
  { id: "dre", nome: "DRE", icone: "grafico" },
  { id: "dfc", nome: "Fluxo de caixa", icone: "tendencia" },
];

export function SeletorRelatorio({ valor, aoMudar }: { valor: TipoRelatorio; aoMudar: (r: TipoRelatorio) => void }) {
  return (
    <div role="group" aria-label="Relatório" className="flex gap-2">
      {OPCOES.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={valor === o.id}
          onClick={() => aoMudar(o.id)}
          className={`chip flex min-h-10 items-center gap-1.5 border px-3 ${
            valor === o.id ? "border-[var(--marca)] bg-[var(--marca)] text-white" : "border-[var(--borda)] bg-white text-[var(--texto)]"
          }`}
        >
          <Icone nome={o.icone} className="h-4 w-4" />
          {o.nome}
        </button>
      ))}
    </div>
  );
}
