// Gráficos do painel do Financeiro em SVG puro (sem biblioteca), nas cores dos demonstrativos: fluxo de caixa
// previsto (barras de entrada/saída por dia + linha do saldo), realizado por mês e maiores despesas por categoria.
"use client";

import { useEffect, useRef, useState } from "react";
import { brl } from "@/lib/formato/moeda";
import { fmtData } from "@/lib/formato/datas";
import { COR } from "@/dominios/demonstrativos/componentes/paletas";
import { rotuloMes, valorCurto } from "../painel";
import type { DiaFluxo, FatiaCategoria, MesRealizado } from "../painel";

const SALDO = "#0b2820";

/**
 * Largura real do quadro do gráfico (acompanha a tela). O SVG usa essa largura no viewBox, então o texto fica sempre
 * com 11 px de verdade: no celular o gráfico não vira miniatura ilegível.
 */
function useLargura(inicial = 720) {
  const ref = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(inicial);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setLargura(Math.max(300, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, largura };
}

function escala(min: number, max: number, passos = 4) {
  const lo = Math.min(0, min);
  const hi = Math.max(0, max) || 1;
  const bruto = (hi - lo) / passos || 1;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= bruto) ?? bruto;
  const ini = Math.floor(lo / passo) * passo;
  const fim = Math.ceil(hi / passo) * passo;
  const ticks: number[] = [];
  for (let t = ini; t <= fim + passo / 2; t += passo) ticks.push(Math.round(t * 100) / 100);
  return { ini, fim: fim === ini ? ini + 1 : fim, ticks };
}

function Dica({ esquerda, linhas }: { esquerda: number; linhas: { texto: string; cor?: string; forte?: boolean }[] }) {
  // esquerda em % da largura; perto das bordas a dica encosta para dentro
  const desloca = esquerda < 18 ? "0%" : esquerda > 82 ? "-100%" : "-50%";
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 rounded-lg border border-[var(--borda)] bg-white px-2.5 py-1.5 text-xs shadow-md"
      style={{ left: `${esquerda}%`, transform: `translateX(${desloca})` }}
    >
      {linhas.map((l, i) => (
        <div key={i} className={`flex items-center gap-1.5 whitespace-nowrap ${l.forte ? "font-semibold" : ""}`}>
          {l.cor && <span className="h-2 w-2 rounded-sm" style={{ background: l.cor }} />}
          {l.texto}
        </div>
      ))}
    </div>
  );
}

function Legenda({ itens }: { itens: { nome: string; cor: string; linha?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--texto-suave)]">
      {itens.map((i) => (
        <span key={i.nome} className="flex items-center gap-1.5">
          <span className={i.linha ? "h-0.5 w-4 rounded" : "h-2.5 w-2.5 rounded-sm"} style={{ background: i.cor }} />
          {i.nome}
        </span>
      ))}
    </div>
  );
}

/** Próximos dias: barras do que entra (para cima) e sai (para baixo) e a linha do saldo previsto no fim de cada dia. */
export function GraficoFluxo({ dias }: { dias: DiaFluxo[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const { ref, largura } = useLargura();
  const W = largura,
    H = largura < 520 ? 210 : 250,
    ml = 46,
    mr = 12,
    mt = 14,
    mb = 26;
  const valores = dias.flatMap((d) => [d.saldo, d.entra, -d.sai]);
  const { ini, fim, ticks } = escala(Math.min(...valores), Math.max(...valores));
  const y = (v: number) => mt + (1 - (v - ini) / (fim - ini)) * (H - mt - mb);
  const passo = (W - ml - mr) / Math.max(1, dias.length);
  const cx = (i: number) => ml + passo * i + passo / 2;
  const bw = Math.max(3, Math.min(14, passo * 0.36));
  const linha = dias.map((d, i) => `${cx(i)},${y(d.saldo)}`).join(" ");
  const area = `${cx(0)},${y(0)} ${linha} ${cx(dias.length - 1)},${y(0)}`;
  const h = hover !== null ? dias[hover] : null;
  return (
    <div className="space-y-2">
      <Legenda
        itens={[
          { nome: "Saldo previsto", cor: SALDO, linha: true },
          { nome: "Vai entrar", cor: COR.receita },
          { nome: "Vai sair", cor: COR.despesa },
        ]}
      />
      <div className="relative" ref={ref}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full touch-pan-y"
          role="img"
          aria-label={`Fluxo de caixa previsto: saldo de ${brl(dias[0]?.saldo ?? 0)} hoje a ${brl(dias.at(-1)?.saldo ?? 0)} em ${fmtData(dias.at(-1)?.data ?? "")}`}
          onPointerLeave={() => setHover(null)}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * W;
            setHover(Math.max(0, Math.min(dias.length - 1, Math.floor((px - ml) / passo))));
          }}
        >
          <defs>
            <linearGradient id="fluxo-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#e2c17e" stopOpacity="0.38" />
              <stop offset="1" stopColor="#e2c17e" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={ml} x2={W - mr} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#b9c4bd" : COR.grade} strokeWidth={t === 0 ? 1.4 : 1} />
              <text x={ml - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill={COR.eixo}>
                {valorCurto(t)}
              </text>
            </g>
          ))}
          {dias.map((d, i) =>
            // rótulo a cada 5 dias (7 no celular) e no último dia, sem encostar um no outro no fim do eixo
            (i % (W < 520 ? 7 : 5) === 0 && dias.length - 1 - i >= (W < 520 ? 4 : 3)) || i === dias.length - 1 ? (
              <text key={d.data} x={cx(i)} y={H - 6} textAnchor="middle" fontSize="11" fill={COR.eixo}>
                {i === 0 ? "Hoje" : `${d.data.slice(8, 10)}/${d.data.slice(5, 7)}`}
              </text>
            ) : null,
          )}
          {hover !== null && <rect x={ml + passo * hover} y={mt} width={passo} height={H - mt - mb} fill="#0b2820" opacity="0.05" />}
          <polygon points={area} fill="url(#fluxo-area)" />
          {dias.map((d, i) => (
            <g key={d.data}>
              {d.entra > 0 && (
                <rect x={cx(i) - bw - 0.5} y={y(d.entra)} width={bw} height={Math.max(1.5, y(0) - y(d.entra))} rx="2" fill={COR.receita} />
              )}
              {d.sai > 0 && <rect x={cx(i) + 0.5} y={y(0)} width={bw} height={Math.max(1.5, y(-d.sai) - y(0))} rx="2" fill={COR.despesa} />}
            </g>
          ))}
          <polyline points={linha} fill="none" stroke={SALDO} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
          {dias.map((d, i) =>
            d.saldo < 0 || i === hover ? (
              <circle
                key={d.data}
                cx={cx(i)}
                cy={y(d.saldo)}
                r={i === hover ? 4.5 : 3}
                fill={d.saldo < 0 ? COR.negativo : SALDO}
                stroke="#fff"
                strokeWidth="1.5"
              />
            ) : null,
          )}
        </svg>
        {h && (
          <Dica
            esquerda={(cx(hover!) / W) * 100}
            linhas={[
              { texto: hover === 0 ? `Hoje, ${fmtData(h.data)}` : fmtData(h.data), forte: true },
              ...(h.entra ? [{ texto: `Entra ${brl(h.entra)}`, cor: COR.receita }] : []),
              ...(h.sai ? [{ texto: `Sai ${brl(h.sai)}`, cor: COR.despesa }] : []),
              { texto: `Saldo no fim do dia: ${brl(h.saldo)}`, cor: h.saldo < 0 ? COR.negativo : SALDO },
            ]}
          />
        )}
      </div>
    </div>
  );
}

/** Últimos meses: o que entrou e o que saiu de verdade, lado a lado, com o resultado do mês. */
export function GraficoMeses({ meses }: { meses: MesRealizado[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const { ref, largura } = useLargura();
  const W = largura,
    H = largura < 520 ? 200 : 230,
    ml = 46,
    mr = 12,
    mt = 22,
    mb = 26;
  const { ini, fim, ticks } = escala(0, Math.max(...meses.flatMap((m) => [m.entrou, m.saiu])));
  const y = (v: number) => mt + (1 - (v - ini) / (fim - ini)) * (H - mt - mb);
  const passo = (W - ml - mr) / Math.max(1, meses.length);
  const bw = Math.min(34, passo * 0.3);
  const cx = (i: number) => ml + passo * i + passo / 2;
  const h = hover !== null ? meses[hover] : null;
  return (
    <div className="space-y-2">
      <Legenda
        itens={[
          { nome: "Entrou", cor: COR.receita },
          { nome: "Saiu", cor: COR.despesa },
        ]}
      />
      <div className="relative" ref={ref}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full touch-pan-y"
          role="img"
          aria-label="Dinheiro que entrou e saiu nos últimos meses"
          onPointerLeave={() => setHover(null)}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * W;
            setHover(Math.max(0, Math.min(meses.length - 1, Math.floor((px - ml) / passo))));
          }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={ml} x2={W - mr} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#b9c4bd" : COR.grade} />
              <text x={ml - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill={COR.eixo}>
                {valorCurto(t)}
              </text>
            </g>
          ))}
          {meses.map((m, i) => {
            const res = m.entrou - m.saiu;
            return (
              <g key={m.mes}>
                {hover === i && (
                  <rect x={ml + passo * i} y={mt - 18} width={passo} height={H - mt - mb + 18} fill="#0b2820" opacity="0.05" />
                )}
                <rect x={cx(i) - bw - 2} y={y(m.entrou)} width={bw} height={Math.max(0, y(0) - y(m.entrou))} rx="3" fill={COR.receita} />
                <rect x={cx(i) + 2} y={y(m.saiu)} width={bw} height={Math.max(0, y(0) - y(m.saiu))} rx="3" fill={COR.despesa} />
                {(m.entrou || m.saiu) > 0 && (
                  <text
                    x={cx(i)}
                    y={y(Math.max(m.entrou, m.saiu)) - 6}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="600"
                    fill={res < 0 ? COR.negativo : "#067647"}
                  >
                    {res >= 0 ? "+" : ""}
                    {valorCurto(res)}
                  </text>
                )}
                <text x={cx(i)} y={H - 6} textAnchor="middle" fontSize="11" fill={COR.eixo}>
                  {rotuloMes(m.mes)}
                </text>
              </g>
            );
          })}
        </svg>
        {h && (
          <Dica
            esquerda={(cx(hover!) / W) * 100}
            linhas={[
              { texto: rotuloMes(h.mes), forte: true },
              { texto: `Entrou ${brl(h.entrou)}`, cor: COR.receita },
              { texto: `Saiu ${brl(h.saiu)}`, cor: COR.despesa },
              { texto: `${h.entrou - h.saiu >= 0 ? "Sobrou" : "Faltou"} ${brl(Math.abs(h.entrou - h.saiu))}` },
            ]}
          />
        )}
      </div>
    </div>
  );
}

/** Maiores despesas do mês: barras horizontais com o valor e a parte do total. */
export function BarrasCategorias({ fatias }: { fatias: FatiaCategoria[] }) {
  const total = fatias.reduce((a, f) => a + f.valor, 0);
  const maior = Math.max(...fatias.map((f) => f.valor), 1);
  return (
    <ul className="space-y-3">
      {fatias.map((f) => (
        <li key={f.id}>
          <div className="flex items-baseline gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{f.nome}</span>
            <span className="num font-medium">{brl(f.valor)}</span>
            <span className="num w-10 text-right text-xs text-[var(--texto-suave)]">{Math.round((f.valor / total) * 100)}%</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-[var(--fundo)]">
            <div
              className="h-2 rounded-full"
              style={{ width: `${Math.max(2, (f.valor / maior) * 100)}%`, background: f.id === "_outras" ? "#b9c4bd" : COR.despesa }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
