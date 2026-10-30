"use client";

// Gráficos em SVG puro (sem bibliotecas), na paleta validada da MDC.
import { useState } from "react";
import { brl } from "@/lib/balancete";

export const COR = {
  receita: "#1B8263",
  despesa: "#C0892A",
  lucro: "#4A78B5",
  negativo: "#B42318",
  grade: "#E4E0D4",
  eixo: "#8C948F",
};

const curto = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 1e6 ? `${(a / 1e6).toFixed(1).replace(".", ",")} mi` : a >= 1e3 ? `${Math.round(a / 1e3)} mil` : `${Math.round(a)}`;
  return (v < 0 ? "-" : "") + s;
};

function escala(min: number, max: number, passos = 4) {
  const lo = Math.min(0, min);
  const hi = Math.max(0, max) || 1;
  const bruto = (hi - lo) / passos;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= bruto) ?? bruto;
  const ini = Math.floor(lo / passo) * passo;
  const fim = Math.ceil(hi / passo) * passo;
  const ticks: number[] = [];
  for (let t = ini; t <= fim + passo / 2; t += passo) ticks.push(Math.round(t * 100) / 100);
  return { ini, fim, ticks };
}

function Dica({ x, y, linhas }: { x: number | string; y: number; linhas: string[] }) {
  return (
    <div
      className="pointer-events-none absolute z-10 rounded-md border border-[var(--borda)] bg-white px-2 py-1 text-xs shadow"
      style={{ left: x, top: y, transform: "translate(-50%, calc(-100% - 8px))" }}
    >
      {linhas.map((l, i) => (
        <div key={i} className={i === 0 ? "font-semibold" : ""}>
          {l}
        </div>
      ))}
    </div>
  );
}

/** Cascata da DRE: da receita bruta ao lucro líquido. */
export function Cascata({ passos }: { passos: { rotulo: string; valor: number; total?: boolean }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = 260, ml = 56, mr = 12, mt = 12, mb = 48;
  let acum = 0;
  const barras = passos.map((p) => {
    if (p.total) {
      const b = { ...p, de: 0, ate: p.valor };
      acum = p.valor;
      return b;
    }
    const b = { ...p, de: acum, ate: acum + p.valor };
    acum += p.valor;
    return b;
  });
  const vals = barras.flatMap((b) => [b.de, b.ate]);
  const { ini, fim, ticks } = escala(Math.min(...vals), Math.max(...vals));
  const y = (v: number) => mt + (1 - (v - ini) / (fim - ini)) * (H - mt - mb);
  const bw = (W - ml - mr) / barras.length;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Demonstração do resultado em cascata">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={ml} x2={W - mr} y1={y(t)} y2={y(t)} stroke={COR.grade} strokeWidth={t === 0 ? 1.5 : 1} />
            <text x={ml - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill={COR.eixo}>
              {curto(t)}
            </text>
          </g>
        ))}
        {barras.map((b, i) => {
          const x = ml + i * bw + bw * 0.18;
          const w = bw * 0.64;
          const topo = y(Math.max(b.de, b.ate));
          const alt = Math.max(1.5, Math.abs(y(b.de) - y(b.ate)));
          const cor = b.total ? (b.ate < 0 ? COR.negativo : COR.lucro) : b.valor >= 0 ? COR.receita : COR.despesa;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={ml + i * bw} y={mt} width={bw} height={H - mt - mb} fill="transparent" />
              <rect x={x} y={topo} width={w} height={alt} rx="3" fill={cor} opacity={hover === null || hover === i ? 1 : 0.55} />
              {i < barras.length - 1 && (
                <line x1={x + w} x2={x + bw} y1={y(b.ate)} y2={y(b.ate)} stroke={COR.eixo} strokeDasharray="2 3" />
              )}
              <text x={ml + i * bw + bw / 2} y={H - mb + 16} textAnchor="middle" fontSize="11" fill="#1c2420">
                {b.rotulo.split(" ").slice(0, 2).join(" ")}
              </text>
              <text x={ml + i * bw + bw / 2} y={H - mb + 30} textAnchor="middle" fontSize="11" fill={COR.eixo}>
                {b.rotulo.split(" ").slice(2).join(" ")}
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <Dica
          x={`${((ml + hover * bw + bw / 2) / W) * 100}%`}
          y={0}
          linhas={[barras[hover].rotulo, brl(barras[hover].total ? barras[hover].ate : barras[hover].valor)]}
        />
      )}
    </div>
  );
}

/** Linhas de evolução mensal (uma escala, até 3 séries). */
export function Evolucao({
  meses,
  series,
}: {
  meses: string[];
  series: { nome: string; cor: string; valores: (number | null)[] }[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = 240, ml = 56, mr = 12, mt = 12, mb = 28;
  const todos = series.flatMap((s) => s.valores.filter((v): v is number => v !== null));
  const { ini, fim, ticks } = escala(Math.min(0, ...todos), Math.max(0, ...todos));
  const n = Math.max(1, meses.length - 1);
  const x = (i: number) => ml + (meses.length === 1 ? (W - ml - mr) / 2 : (i / n) * (W - ml - mr));
  const y = (v: number) => mt + (1 - (v - ini) / (fim - ini)) * (H - mt - mb);
  return (
    <div className="relative">
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-neutral-600">
        {series.map((s) => (
          <span key={s.nome} className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ background: s.cor }} />
            {s.nome}
          </span>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Evolução mensal"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((px - ml) / (W - ml - mr)) * n);
          setHover(Math.max(0, Math.min(meses.length - 1, i)));
        }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={ml} x2={W - mr} y1={y(t)} y2={y(t)} stroke={COR.grade} strokeWidth={t === 0 ? 1.5 : 1} />
            <text x={ml - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill={COR.eixo}>
              {curto(t)}
            </text>
          </g>
        ))}
        {meses.map((m, i) => (
          <text key={m} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill={COR.eixo}>
            {m}
          </text>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={mt} y2={H - mb} stroke={COR.eixo} strokeDasharray="3 3" />}
        {series.map((s) => {
          const pts = s.valores.map((v, i) => (v === null ? null : [x(i), y(v)])).filter(Boolean) as number[][];
          return (
            <g key={s.nome}>
              {pts.length > 1 && <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={s.cor} strokeWidth="2" strokeLinejoin="round" />}
              {s.valores.map((v, i) =>
                v === null ? null : (
                  <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 5 : 4} fill={s.cor} stroke="#fff" strokeWidth="2" />
                ),
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <Dica
          x={`${(x(hover) / W) * 100}%`}
          y={0}
          linhas={[meses[hover], ...series.map((s) => `${s.nome}: ${brl(s.valores[hover])}`)]}
        />
      )}
    </div>
  );
}

/** Barras horizontais (composição de despesas, tributos). */
export function Barras({ itens, cor = COR.despesa }: { itens: { rotulo: string; valor: number }[]; cor?: string }) {
  const max = Math.max(1, ...itens.map((i) => i.valor));
  const total = itens.reduce((s, i) => s + i.valor, 0);
  return (
    <div className="space-y-1.5">
      {itens.map((i) => (
        <div key={i.rotulo} className="grid grid-cols-[minmax(0,180px)_1fr_auto] items-center gap-2 text-sm" title={`${i.rotulo}: ${brl(i.valor)}`}>
          <span className="truncate text-neutral-700">{i.rotulo}</span>
          <div className="h-3.5 rounded bg-[var(--fundo)]">
            <div className="h-3.5 rounded" style={{ width: `${(i.valor / max) * 100}%`, background: cor }} />
          </div>
          <span className="whitespace-nowrap text-right tabular-nums text-neutral-600">
            {brl(i.valor)} <span className="text-xs text-neutral-400">{total ? `${Math.round((i.valor / total) * 100)}%` : ""}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** Mini-curva de um índice ao longo dos meses. */
export function Faisca({ valores, alerta }: { valores: (number | null)[]; alerta?: boolean }) {
  const v = valores.filter((x): x is number => x !== null && Number.isFinite(x));
  if (v.length < 2) return null;
  const W = 120, H = 32;
  const min = Math.min(...v), max = Math.max(...v);
  const pts = valores
    .map((x, i) => (x === null || !Number.isFinite(x) ? null : `${(i / (valores.length - 1)) * W},${H - 4 - ((x - min) / (max - min || 1)) * (H - 8)}`))
    .filter(Boolean)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-8 w-28" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={alerta ? COR.negativo : COR.lucro} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
