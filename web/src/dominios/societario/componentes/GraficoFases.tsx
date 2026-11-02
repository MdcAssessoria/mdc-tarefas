// Gráfico de barras deitadas do painel do Societário (SVG puro): processos em andamento por fase, separando os que
// estão com o prazo da fase vencido. O SVG acompanha a largura do quadro (letra de 12 px de verdade no celular).
"use client";

import { COR } from "@/dominios/demonstrativos/componentes/paletas";
import { useLargura } from "@/lib/useLargura";

const EM_DIA = COR.lucro;
const ATRASADO = COR.negativo;

export interface BarraFase {
  nome: string;
  emDia: number;
  atrasados: number;
}

export function GraficoFases({ barras }: { barras: BarraFase[] }) {
  const { ref, largura } = useLargura(560);
  const W = largura;
  const rotulo = W < 420 ? 112 : 150;
  const alturaBarra = 22;
  const espaco = 8;
  const H = barras.length * (alturaBarra + espaco) + 4;
  const max = Math.max(1, ...barras.map((b) => b.emDia + b.atrasados));
  const util = W - rotulo - 36;
  const x = (n: number) => (n / max) * util;
  const total = barras.reduce((s, b) => s + b.emDia + b.atrasados, 0);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--texto-suave)]">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: EM_DIA }} />
          No prazo
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: ATRASADO }} />
          Fase atrasada
        </span>
      </div>
      <div ref={ref}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label={`Processos em andamento por fase: ${total} no total. ${barras
            .filter((b) => b.emDia + b.atrasados)
            .map((b) => `${b.nome}: ${b.emDia + b.atrasados}${b.atrasados ? ` (${b.atrasados} atrasado)` : ""}`)
            .join("; ")}`}
        >
          {barras.map((b, i) => {
            const y = i * (alturaBarra + espaco) + 2;
            const n = b.emDia + b.atrasados;
            const wDia = x(b.emDia);
            const wAtr = x(b.atrasados);
            return (
              <g key={b.nome}>
                <text x={rotulo - 8} y={y + alturaBarra / 2} textAnchor="end" dominantBaseline="central" fontSize={12} fill="#4b5551">
                  {b.nome.length > (W < 420 ? 16 : 22) ? `${b.nome.slice(0, W < 420 ? 15 : 21)}…` : b.nome}
                </text>
                <rect x={rotulo} y={y} width={util} height={alturaBarra} rx={4} fill={COR.grade} opacity={0.45} />
                {wDia > 0 && <rect x={rotulo} y={y} width={wDia} height={alturaBarra} rx={4} fill={EM_DIA} />}
                {wAtr > 0 && <rect x={rotulo + wDia} y={y} width={wAtr} height={alturaBarra} rx={4} fill={ATRASADO} />}
                <text
                  x={rotulo + Math.max(wDia + wAtr, 0) + 6}
                  y={y + alturaBarra / 2}
                  dominantBaseline="central"
                  fontSize={12}
                  fontWeight={600}
                  fill={n ? "#0b2820" : "#9aa29e"}
                >
                  {n}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
