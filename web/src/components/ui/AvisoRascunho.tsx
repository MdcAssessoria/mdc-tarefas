// Faixa "Encontramos dados não salvos" no topo de um formulário com rascunho automático (lib/rascunho.ts).
// Recuperar vem primeiro (ação principal), com ícone; Descartar apaga o rascunho guardado.
"use client";

import { Icone } from "./Icone";
import { fmtDataHora } from "@/lib/formato/datas";

export function AvisoRascunho({
  pendente,
  aoRecuperar,
  aoDescartar,
}: {
  pendente: { em: number } | null;
  aoRecuperar: () => void;
  aoDescartar: () => void;
}) {
  if (!pendente) return null;
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
      <Icone nome="alerta" className="h-5 w-5 shrink-0" />
      <p className="min-w-0 flex-1">
        <b>Encontramos dados não salvos</b> deste formulário ({fmtDataHora(new Date(pendente.em).toISOString())}). Deseja recuperar?
      </p>
      <div className="flex gap-2">
        <button type="button" className="btn-primario" onClick={aoRecuperar}>
          <Icone nome="atualizar" className="h-4 w-4" />
          Recuperar
        </button>
        <button type="button" className="btn" onClick={aoDescartar}>
          <Icone nome="lixeira" className="h-4 w-4" />
          Descartar
        </button>
      </div>
    </div>
  );
}
