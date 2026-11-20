// Gráfico de barras agrupadas por mês, com valores negativos abaixo da linha do zero (resultado × caixa, orçado ×
// realizado). SVG simples que se ajusta à largura; o valor de cada barra aparece ao passar o mouse ou tocar.
"use client";

import { useState } from "react";
import { brl } from "@/lib/formato/moeda";
import { rotuloMes } from "@/dominios/financeiro/painel";

export interface SerieGrafico {
  nome: string;
  cor: string;
  valores: number[];
}

const curto = (v: number) => {
  const a = Math.abs(v);
  const s =
    a >= 1e6
      ? `${(a / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`
      : a >= 1e3
        ? `${Math.round(a / 1e3)} mil`
        : `${Math.round(a)}`;
  return `${v < 0 ? "−" : ""}${s}`;
};

export function GraficoBarras({ meses, series, titulo }: { meses: string[]; series: SerieGrafico[]; titulo: string }) {
  const [foco, setFoco] = useState<number | null>(null);
  const W = 1100,
    H = 250,
    ml = 70,
    mr = 10,
    mt = 14,
    mb = 32;
  const todos = series.flatMap((s) => s.valores);
  const max = Math.max(0, ...todos);
  const min = Math.min(0, ...todos);
  const faixa = max - min || 1;
  const y = (v: number) => mt + ((max - v) / faixa) * (H - mt - mb);
  const passo = (W - ml - mr) / Math.max(1, meses.length);
  const bw = Math.max(3, Math.min(22, (passo * 0.7) / series.length));
  const ticks = [max, (max + min) / 2, min].filter((v, i, a) => a.indexOf(v) === i);
  const f = foco !== null ? foco : null;

  return (
    <figure className="cartao p-3 sm:p-4">
      <figcaption className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-semibold text-[var(--marca)]">{titulo}</span>
        {series.map((s) => (
          <span key={s.nome} className="flex items-center gap-1.5 text-[var(--texto-suave)]">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.cor }} aria-hidden="true" />
            {s.nome}
          </span>
        ))}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={titulo} onMouseLeave={() => setFoco(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={ml} x2={W - mr} y1={y(t)} y2={y(t)} stroke="var(--borda)" strokeDasharray={t === 0 ? undefined : "3 3"} />
            <text x={ml - 6} y={y(t) + 4} textAnchor="end" fontSize="14" fill="var(--texto-suave)">
              {curto(t)}
            </text>
          </g>
        ))}
        <line x1={ml} x2={W - mr} y1={y(0)} y2={y(0)} stroke="var(--texto-suave)" />
        {meses.map((mes, i) => {
          const x0 = ml + passo * i + (passo - bw * series.length) / 2;
          return (
            <g key={mes} onMouseEnter={() => setFoco(i)} onClick={() => setFoco(i)}>
              <rect x={ml + passo * i} y={mt} width={passo} height={H - mt - mb} fill={f === i ? "var(--fundo)" : "transparent"} />
              {series.map((s, k) => {
                const v = s.valores[i] ?? 0;
                return (
                  <rect
                    key={s.nome}
                    x={x0 + k * bw}
                    y={Math.min(y(v), y(0))}
                    width={bw - 1}
                    height={Math.abs(y(v) - y(0))}
                    fill={s.cor}
                    rx="1.5"
                  />
                );
              })}
              <text x={ml + passo * i + passo / 2} y={H - 10} textAnchor="middle" fontSize="14" fill="var(--texto-suave)">
                {rotuloMes(mes)}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="min-h-5 text-xs text-[var(--texto-suave)]" aria-live="polite">
        {f !== null
          ? `${rotuloMes(meses[f])}: ${series.map((s) => `${s.nome} ${brl(s.valores[f] ?? 0)}`).join(" · ")}`
          : "Passe o mouse ou toque num mês para ver os valores."}
      </p>
    </figure>
  );
}
