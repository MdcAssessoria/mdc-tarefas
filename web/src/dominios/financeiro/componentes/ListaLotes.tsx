// "Últimos extratos importados", com o botão de desfazer uma importação feita por engano (pede o motivo; nada se apaga).
"use client";

import { useState } from "react";
import { desfazerLote } from "@/dominios/financeiro/repositorio";
import type { LoteExtrato } from "@/dominios/financeiro/tipos";
import { fmtDataHora } from "@/lib/formato/datas";
import type { TomAviso } from "@/components/ui/Aviso";
import { JanelaMotivo } from "./Comuns";

export function ListaLotes({
  lotes,
  nomeConta,
  podeOperar,
  avisar,
  aoDesfazer,
}: {
  lotes: LoteExtrato[];
  nomeConta: (id: string) => string;
  podeOperar: boolean;
  avisar: (texto: string, tom?: TomAviso) => void;
  aoDesfazer: () => void;
}) {
  const [confirmando, setConfirmando] = useState<LoteExtrato | null>(null);
  if (!lotes.length) return null;

  async function desfazer(l: LoteExtrato, motivo: string) {
    const r = await desfazerLote(l.id, motivo);
    avisar(`Importação desfeita: ${r.desfeitas} lançamento(s) de ${l.arquivo} foram retirados (ficam guardados com o motivo).`);
    setConfirmando(null);
    aoDesfazer();
  }

  return (
    <div className="cartao p-4">
      <h2 className="mb-2 font-semibold text-[var(--marca)]">Últimos extratos importados</h2>
      <ul className="divide-y divide-neutral-100 text-sm">
        {lotes.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2">
            <span className="text-neutral-500">{fmtDataHora(l.em)}</span>
            <span>{nomeConta(l.conta_id)}</span>
            <span className="max-w-full truncate text-neutral-600">{l.arquivo}</span>
            <span>
              · {l.novas} novo(s){l.repetidas ? `, ${l.repetidas} repetido(s)` : ""}
            </span>
            {podeOperar && l.novas > 0 && (
              <span className="ml-auto flex gap-2">
                <button
                  className="btn !min-h-8"
                  onClick={() => setConfirmando(l)}
                  title="Retira os lançamentos que entraram com este arquivo"
                >
                  Desfazer importação
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {confirmando && (
        <JanelaMotivo
          titulo="Desfazer importação"
          descricao={`Os ${confirmando.novas} lançamento(s) de ${confirmando.arquivo} saem do extrato. Eles ficam guardados, marcados como desfeitos, com o motivo.`}
          botao={`Retirar ${confirmando.novas} lançamento(s)`}
          aoConfirmar={(motivo) => desfazer(confirmando, motivo)}
          aoFechar={() => setConfirmando(null)}
        />
      )}
    </div>
  );
}
