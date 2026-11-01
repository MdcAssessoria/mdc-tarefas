// "Últimos extratos importados", com o botão de desfazer uma importação feita por engano (pede confirmação na linha).
"use client";

import { useState } from "react";
import { desfazerLote } from "@/dominios/financeiro/repositorio";
import type { LoteExtrato } from "@/dominios/financeiro/tipos";
import { traduzirErro } from "@/lib/erros";
import { fmtDataHora } from "@/lib/formato/datas";
import type { TomAviso } from "@/components/ui/Aviso";

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
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  if (!lotes.length) return null;

  async function desfazer(l: LoteExtrato) {
    setOcupado(true);
    try {
      const r = await desfazerLote(l.id);
      avisar(`Importação desfeita: ${r.apagadas} lançamento(s) de ${l.arquivo} foram retirados.`);
      setConfirmando(null);
      aoDesfazer();
    } catch (e) {
      avisar(traduzirErro(e), "erro");
    } finally {
      setOcupado(false);
    }
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
                {confirmando === l.id ? (
                  <>
                    <button className="btn !min-h-8 !border-red-300 !text-red-800" disabled={ocupado} onClick={() => desfazer(l)}>
                      {ocupado ? "Desfazendo…" : `Sim, retirar ${l.novas} lançamento(s)`}
                    </button>
                    <button className="btn !min-h-8" disabled={ocupado} onClick={() => setConfirmando(null)}>
                      Não
                    </button>
                  </>
                ) : (
                  <button
                    className="btn !min-h-8"
                    onClick={() => setConfirmando(l.id)}
                    title="Retira os lançamentos que entraram com este arquivo"
                  >
                    Desfazer importação
                  </button>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
