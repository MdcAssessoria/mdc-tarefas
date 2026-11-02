// Filtro de período em um clique (Este mês, Mês passado…); "Escolher datas" abre os dois campos. Regra 8.3.2.
"use client";

import { PERIODOS } from "@/lib/periodo";
import type { Periodo } from "@/lib/periodo";

export function FiltroPeriodo({
  rotulo = "Período",
  periodo,
  de,
  ate,
  aoMudar,
}: {
  rotulo?: string;
  periodo: Periodo;
  de: string;
  ate: string;
  aoMudar: (v: { periodo?: Periodo; de?: string; ate?: string }) => void;
}) {
  return (
    <>
      <label className="campo">
        <span>{rotulo}</span>
        <select value={periodo} onChange={(e) => aoMudar({ periodo: e.target.value as Periodo })}>
          {PERIODOS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </label>
      {periodo === "escolher" && (
        <>
          <label className="campo">
            <span>De</span>
            <input type="date" value={de} onChange={(e) => aoMudar({ de: e.target.value })} />
          </label>
          <label className="campo">
            <span>Até</span>
            <input type="date" value={ate} onChange={(e) => aoMudar({ ate: e.target.value })} />
          </label>
        </>
      )}
    </>
  );
}
