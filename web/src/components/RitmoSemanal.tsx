"use client";

import { useMemo, useState } from "react";

export interface SemanaRitmo {
  inicio: string; // segunda-feira, YYYY-MM-DD
  noPrazo: number;
  atrasadas: number;
  previstas: number; // tarefas abertas com prazo nesta semana
  atual: boolean;
  futura: boolean;
}

const OK = "#1B8263", ATRASO = "#C0892A", PREVISTA = "#0B2820";

const rotulo = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

/**
 * Colunas por semana: o que foi concluído (no prazo e com atraso) e o que vence nas próximas semanas.
 * Passe o mouse para ver os números; clique numa semana para ver as tarefas dela.
 */
export function RitmoSemanal({ semanas, selecionada, aoSelecionar }: { semanas: SemanaRitmo[]; selecionada: string | null; aoSelecionar: (inicio: string | null) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = 240, ml = 34, mr = 12, mt = 16, mb = 34;
  const max = Math.max(4, ...semanas.map((s) => Math.max(s.noPrazo + s.atrasadas, s.previstas)));
  const passo = Math.ceil(max / 4);
  const topo = passo * 4;
  const larg = (W - ml - mr) / semanas.length;
  const y = (v: number) => mt + (H - mt - mb) * (1 - v / topo);
  const ticks = useMemo(() => [0, 1, 2, 3, 4].map((i) => i * passo), [passo]);
  const s = hover !== null ? semanas[hover] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Tarefas concluídas e previstas por semana">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={ml} x2={W - mr} y1={y(t)} y2={y(t)} stroke="#DCE3DE" strokeWidth={t === 0 ? 1.2 : 1} />
            <text x={ml - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#5D6661">
              {t}
            </text>
          </g>
        ))}
        {semanas.map((sm, i) => {
          const x = ml + i * larg;
          const bw = Math.min(30, larg * 0.56);
          const cx = x + larg / 2;
          const sel = selecionada === sm.inicio;
          const apagada = selecionada !== null && !sel;
          return (
            <g
              key={sm.inicio}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => aoSelecionar(sel ? null : sm.inicio)}
              style={{ cursor: "pointer" }}
              opacity={apagada ? 0.35 : 1}
            >
              <rect x={x} y={mt} width={larg} height={H - mt - mb} fill={sm.atual ? "#E2C17E" : hover === i ? "#EEF2EF" : "transparent"} fillOpacity={sm.atual ? 0.18 : 1} />
              {sm.futura ? (
                sm.previstas > 0 && (
                  <rect x={cx - bw / 2} y={y(sm.previstas)} width={bw} height={y(0) - y(sm.previstas)} rx="3" fill="none" stroke={PREVISTA} strokeWidth="1.5" strokeDasharray="4 3" />
                )
              ) : (
                <>
                  {sm.noPrazo > 0 && <rect x={cx - bw / 2} y={y(sm.noPrazo)} width={bw} height={y(0) - y(sm.noPrazo)} rx="3" fill={OK} />}
                  {sm.atrasadas > 0 && (
                    <rect x={cx - bw / 2} y={y(sm.noPrazo + sm.atrasadas)} width={bw} height={y(sm.noPrazo) - y(sm.noPrazo + sm.atrasadas) - 1} rx="3" fill={ATRASO} />
                  )}
                  {sm.atual && sm.previstas > 0 && (
                    <rect x={cx + bw / 2 + 2} y={y(sm.previstas)} width={6} height={y(0) - y(sm.previstas)} rx="2" fill="none" stroke={PREVISTA} strokeWidth="1.2" strokeDasharray="3 2" />
                  )}
                </>
              )}
              <text x={cx} y={H - mb + 16} textAnchor="middle" fontSize="11" fontWeight={sm.atual || sel ? 600 : 400} fill={sm.atual ? "#0B2820" : "#5D6661"}>
                {sm.atual ? "esta" : rotulo(sm.inicio)}
              </text>
              {sel && <rect x={cx - 12} y={H - mb + 22} width={24} height={2.5} rx="1" fill="#8A6A2A" />}
            </g>
          );
        })}
      </svg>
      {s && (
        <div
          className="pointer-events-none absolute top-1 z-10 w-48 rounded-lg border border-[var(--borda)] bg-white px-3 py-2 text-[12px] shadow-lg"
          style={{ left: `clamp(0px, calc(${((ml + (hover! + 0.5) * larg) / W) * 100}% - 96px), calc(100% - 192px))` }}
        >
          <div className="mb-1 font-semibold text-[var(--marca)]">Semana de {rotulo(s.inicio)}</div>
          {!s.futura && (
            <>
              <Linha cor={OK} rot="concluídas no prazo" v={s.noPrazo} />
              <Linha cor={ATRASO} rot="concluídas com atraso" v={s.atrasadas} />
            </>
          )}
          {(s.futura || s.atual) && <Linha cor={PREVISTA} rot="abertas que vencem" v={s.previstas} tracejada />}
          <div className="mt-1 text-[11px] text-[var(--texto-suave)]">Clique para ver as tarefas</div>
        </div>
      )}
    </div>
  );
}

function Linha({ cor, rot, v, tracejada }: { cor: string; rot: string; v: number; tracejada?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2.5 w-2.5 rounded-sm" style={tracejada ? { border: `1.5px dashed ${cor}` } : { background: cor }} />
      <span className="flex-1 text-[var(--texto-suave)]">{rot}</span>
      <b className="num">{v}</b>
    </div>
  );
}

export const CORES_RITMO = { OK, ATRASO, PREVISTA };
