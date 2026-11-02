// Gráfico simples de barras: o que foi faturado (mensalidades do mês) e o que foi recebido em cada mês.
// Feito com divs (sem biblioteca), funciona no celular e mostra os valores ao passar o mouse ou tocar.
"use client";

import { brl } from "@/lib/formato/moeda";
import { mesAno } from "@/lib/formato/datas";
import type { PontoMes } from "../regras";

export function GraficoMeses({ pontos }: { pontos: PontoMes[] }) {
  const maximo = Math.max(1, ...pontos.flatMap((p) => [p.faturado, p.recebido]));
  const altura = (v: number) => `${Math.max(v > 0 ? 3 : 0, Math.round((v / maximo) * 100))}%`;
  const resumo = pontos.map((p) => `${mesAno(p.mes)}: faturado ${brl(p.faturado)}, recebido ${brl(p.recebido)}`).join("; ");
  return (
    <figure className="space-y-2">
      <div className="flex h-44 items-end gap-2 sm:gap-4" role="img" aria-label={`Faturado e recebido por mês. ${resumo}`}>
        {pontos.map((p) => (
          <div key={p.mes} className="flex h-full flex-1 flex-col justify-end">
            <div className="flex h-full items-end justify-center gap-1">
              <div
                className="w-1/2 max-w-7 rounded-t bg-[var(--marca)]"
                style={{ height: altura(p.faturado) }}
                title={`${mesAno(p.mes)} · faturado ${brl(p.faturado)}`}
              />
              <div
                className="w-1/2 max-w-7 rounded-t bg-[var(--destaque)]"
                style={{ height: altura(p.recebido) }}
                title={`${mesAno(p.mes)} · recebido ${brl(p.recebido)}`}
              />
            </div>
            <span className="mt-1 text-center text-xs text-neutral-500">{mesAno(p.mes)}</span>
          </div>
        ))}
      </div>
      <figcaption className="flex flex-wrap gap-4 text-xs text-neutral-600">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-[var(--marca)]" /> Faturado (mensalidades do mês)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-[var(--destaque)]" /> Recebido no mês
        </span>
      </figcaption>
    </figure>
  );
}
