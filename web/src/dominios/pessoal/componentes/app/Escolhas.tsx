// Botões de escolha grandes do app da família (data, conta do banco, tipo de gasto): um toque escolhe.
"use client";

import { Icone } from "@/components/ui/Icone";
import type { NomeIcone } from "@/components/ui/Icone";

export function Escolha({
  rotulo,
  ativo,
  aoEscolher,
  icone,
  alto = false,
}: {
  rotulo: string;
  ativo: boolean;
  aoEscolher: () => void;
  icone?: NomeIcone;
  alto?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={aoEscolher}
      className={`flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition active:scale-[.97] ${
        alto ? "min-h-16 flex-col" : ""
      } ${ativo ? "border-[var(--marca)] bg-[var(--marca)] text-white" : "border-[var(--borda)] bg-white text-neutral-800"}`}
    >
      {icone && <Icone nome={icone} className={`h-5 w-5 ${ativo ? "text-[var(--destaque)]" : "text-[var(--marca)]"}`} />}
      <span className="truncate">{rotulo}</span>
    </button>
  );
}

/** Data em três botões: Hoje, Ontem ou Outro dia (abre o calendário do celular). */
export function EscolhaData({
  valor,
  hoje,
  ontem,
  aoMudar,
}: {
  valor: string;
  hoje: string;
  ontem: string;
  aoMudar: (d: string) => void;
}) {
  const outro = valor !== hoje && valor !== ontem;
  return (
    <div className="grid grid-cols-3 gap-2">
      <Escolha rotulo="Hoje" ativo={valor === hoje} aoEscolher={() => aoMudar(hoje)} />
      <Escolha rotulo="Ontem" ativo={valor === ontem} aoEscolher={() => aoMudar(ontem)} />
      <label
        className={`relative flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-2 text-sm font-semibold ${
          outro ? "border-[var(--marca)] bg-[var(--marca)] text-white" : "border-[var(--borda)] bg-white text-neutral-800"
        }`}
      >
        {outro ? valor.split("-").reverse().join("/") : "Outro dia"}
        <input
          type="date"
          aria-label="Escolher outro dia"
          className="absolute inset-0 opacity-0"
          value={valor}
          onChange={(e) => e.target.value && aoMudar(e.target.value)}
        />
      </label>
    </div>
  );
}
