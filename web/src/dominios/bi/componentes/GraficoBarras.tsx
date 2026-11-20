// Gráficos do BI em SVG puro, desenhados na largura real da tela (o texto fica com tamanho de verdade também no
// celular):
// · GraficoBarras: barras agrupadas por mês (negativo abaixo do zero), linhas opcionais (ex.: acumulado), escala com
//   números redondos e balão com os valores do mês ao passar o mouse ou tocar;
// · GraficoCascata: a DRE da receita ao resultado, em degraus;
// · GraficoParticipacao: barras deitadas com o valor e a parte de cada item no total (ex.: empresa no grupo).
"use client";

import { useEffect, useRef, useState } from "react";
import { brl } from "@/lib/formato/moeda";
import { rotuloMes } from "@/dominios/financeiro/painel";
import { curto, escalaRedonda } from "../graficos";
import type { DegrauCascata } from "../graficos";

export interface SerieGrafico {
  nome: string;
  cor: string;
  valores: number[];
}

const SOBE = "#2F6B4F";
const DESCE = "#B4533C";
const SUBTOTAL = "#0B2820";

function useLargura(inicial = 720) {
  const ref = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(inicial);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setLargura(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, largura };
}

function Legenda({ itens }: { itens: { nome: string; cor: string; linha?: boolean; total?: number }[] }) {
  return (
    <>
      {itens.map((s) => (
        <span key={s.nome} className="flex items-center gap-1.5 text-[var(--texto-suave)]">
          {s.linha ? (
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.cor }} aria-hidden="true" />
          ) : (
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.cor }} aria-hidden="true" />
          )}
          {s.nome}
          {s.total !== undefined && <b className="num font-semibold text-[var(--texto)]">{brl(s.total)}</b>}
        </span>
      ))}
    </>
  );
}

export function GraficoBarras({
  meses,
  series,
  linhas = [],
  titulo,
  altura = 260,
}: {
  meses: string[];
  series: SerieGrafico[];
  /** Séries em linha por cima das barras (ex.: resultado acumulado). */
  linhas?: SerieGrafico[];
  titulo: string;
  altura?: number;
}) {
  const { ref, largura: W } = useLargura();
  const [foco, setFoco] = useState<number | null>(null);
  const H = altura;
  const ml = 58,
    mr = 12,
    mt = 12,
    mb = 28;
  const todos = [...series, ...linhas].flatMap((s) => s.valores);
  const { de, ate, marcas } = escalaRedonda(Math.min(0, ...todos), Math.max(0, ...todos), W < 520 ? 4 : 5);
  const y = (v: number) => mt + ((ate - v) / (ate - de || 1)) * (H - mt - mb);
  const n = Math.max(1, meses.length);
  const passo = (W - ml - mr) / n;
  const bw = Math.max(3, Math.min(26, (passo * 0.72) / Math.max(1, series.length)));
  const xc = (i: number) => ml + passo * i + passo / 2;
  // rótulos do eixo: no celular pula meses para não encavalar
  const cada = Math.max(1, Math.ceil(n / Math.max(1, Math.floor((W - ml - mr) / 52))));
  const f = foco;

  return (
    <figure className="cartao p-3 sm:p-4">
      <figcaption className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-semibold text-[var(--marca)]">{titulo}</span>
        <Legenda
          itens={[
            ...series.map((s) => ({ nome: s.nome, cor: s.cor, total: s.valores.reduce((a, b) => a + b, 0) })),
            ...linhas.map((s) => ({ nome: s.nome, cor: s.cor, linha: true })),
          ]}
        />
      </figcaption>
      <div ref={ref} className="relative">
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="block max-w-full"
          role="img"
          aria-label={titulo}
          onMouseLeave={() => setFoco(null)}
        >
          {marcas.map((t) => (
            <g key={t}>
              <line x1={ml} x2={W - mr} y1={y(t)} y2={y(t)} stroke="var(--borda)" strokeDasharray={t === 0 ? undefined : "3 4"} />
              <text x={ml - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--texto-suave)">
                {curto(t)}
              </text>
            </g>
          ))}
          <line x1={ml} x2={W - mr} y1={y(0)} y2={y(0)} stroke="var(--texto-suave)" />
          {meses.map((mes, i) => {
            const x0 = xc(i) - (bw * series.length) / 2;
            return (
              <g key={mes} onMouseEnter={() => setFoco(i)} onClick={() => setFoco(i)} className="cursor-pointer">
                <rect x={ml + passo * i} y={mt} width={passo} height={H - mt - mb} fill={f === i ? "var(--fundo)" : "transparent"} rx="4" />
                {series.map((s, k) => {
                  const v = s.valores[i] ?? 0;
                  return (
                    <rect
                      key={s.nome}
                      x={x0 + k * bw}
                      y={Math.min(y(v), y(0))}
                      width={Math.max(1, bw - 2)}
                      height={Math.max(v === 0 ? 0 : 1, Math.abs(y(v) - y(0)))}
                      fill={s.cor}
                      opacity={f === null || f === i ? 1 : 0.55}
                      rx="2"
                    />
                  );
                })}
                {i % cada === 0 && (
                  <text x={xc(i)} y={H - 9} textAnchor="middle" fontSize="11" fill="var(--texto-suave)">
                    {rotuloMes(mes)}
                  </text>
                )}
              </g>
            );
          })}
          {linhas.map((s) => (
            <g key={s.nome} pointerEvents="none">
              <polyline
                points={s.valores.map((v, i) => `${xc(i)},${y(v)}`).join(" ")}
                fill="none"
                stroke={s.cor}
                strokeWidth="2"
                strokeLinejoin="round"
              />
              {s.valores.map((v, i) => (
                <circle key={i} cx={xc(i)} cy={y(v)} r={f === i ? 4.5 : 3} fill="#fff" stroke={s.cor} strokeWidth="2" />
              ))}
            </g>
          ))}
        </svg>
        {f !== null && (
          <div
            className="pointer-events-none absolute top-1 z-10 min-w-[11rem] rounded-md border border-[var(--borda)] bg-white px-3 py-2 text-xs shadow-md"
            style={{
              left: `${Math.min(Math.max((xc(f) / W) * 100, 12), 88)}%`,
              transform: "translateX(-50%)",
            }}
          >
            <p className="mb-1 font-semibold text-[var(--marca)]">{rotuloMes(meses[f])}</p>
            {[...series, ...linhas].map((s) => (
              <p key={s.nome} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-[var(--texto-suave)]">
                  <span className="inline-block h-2 w-2 rounded-sm" style={{ background: s.cor }} aria-hidden="true" />
                  {s.nome}
                </span>
                <b className={`num ${(s.valores[f] ?? 0) < 0 ? "text-red-700" : ""}`}>{brl(s.valores[f] ?? 0)}</b>
              </p>
            ))}
          </div>
        )}
      </div>
      <p className="min-h-5 text-xs text-[var(--texto-suave)]" aria-live="polite">
        {f === null ? "Passe o mouse ou toque num mês para ver os valores." : ""}
      </p>
    </figure>
  );
}

export function GraficoCascata({ titulo, degraus }: { titulo: string; degraus: DegrauCascata[] }) {
  const { ref, largura: W } = useLargura();
  // tela estreita: o nome vai acima da barra, que usa a largura toda
  const estreito = W < 560;
  const linha = estreito ? 44 : 30;
  const topo = estreito ? 16 : 0;
  const rotulo = estreito ? 6 : Math.min(240, Math.max(120, Math.round(W * 0.3)));
  const mr = estreito ? 64 : 86;
  const H = degraus.length * linha + 24;
  const vals = degraus.flatMap((d) => [d.de, d.ate]);
  const { de, ate, marcas } = escalaRedonda(Math.min(0, ...vals), Math.max(0, ...vals), W < 520 ? 3 : 5);
  const x = (v: number) => rotulo + ((v - de) / (ate - de || 1)) * (W - rotulo - mr);
  return (
    <figure className="cartao p-3 sm:p-4">
      <figcaption className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-semibold text-[var(--marca)]">{titulo}</span>
        <Legenda
          itens={[
            { nome: "Soma", cor: SOBE },
            { nome: "Diminui", cor: DESCE },
            { nome: "Subtotal", cor: SUBTOTAL },
          ]}
        />
      </figcaption>
      <div ref={ref}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full" role="img" aria-label={titulo}>
          {marcas.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={0} y2={H - 18} stroke="var(--borda)" strokeDasharray={t === 0 ? undefined : "3 4"} />
              <text x={x(t)} y={H - 4} textAnchor="middle" fontSize="11" fill="var(--texto-suave)">
                {curto(t)}
              </text>
            </g>
          ))}
          {degraus.map((d, i) => {
            const yy = i * linha + 4;
            const x1 = x(Math.min(d.de, d.ate));
            const x2 = x(Math.max(d.de, d.ate));
            const cor = d.subtotal ? SUBTOTAL : d.valor >= 0 ? SOBE : DESCE;
            const prox = degraus[i + 1];
            return (
              <g key={d.codigo}>
                <title>{`${d.nome}: ${brl(d.valor)}`}</title>
                <text
                  x={estreito ? 0 : rotulo - 8}
                  y={estreito ? yy + 11 : yy + linha / 2}
                  textAnchor={estreito ? "start" : "end"}
                  fontSize="12"
                  fontWeight={d.subtotal ? 700 : 400}
                  fill={d.subtotal ? "var(--marca)" : "var(--texto)"}
                >
                  {estreito || d.nome.length <= Math.floor(rotulo / 6.4) ? d.nome : `${d.nome.slice(0, Math.floor(rotulo / 6.4) - 1)}…`}
                </text>
                <rect x={x1} y={yy + 4 + topo} width={Math.max(2, x2 - x1)} height={linha - 10 - topo} fill={cor} rx="2" />
                <text x={x2 + 6} y={yy + (linha + topo) / 2 + 2} fontSize="11" fill={d.valor < 0 ? "#991B1B" : "var(--texto-suave)"}>
                  {curto(d.valor)}
                </text>
                {!estreito && prox && !prox.subtotal && (
                  <line
                    x1={x(d.ate)}
                    x2={x(d.ate)}
                    y1={yy + linha - 6}
                    y2={yy + linha + 4 + topo}
                    stroke="var(--texto-suave)"
                    strokeDasharray="2 2"
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </figure>
  );
}

export interface ItemParticipacao {
  nome: string;
  valor: number;
}

export function GraficoParticipacao({ titulo, itens, cor = SUBTOTAL }: { titulo: string; itens: ItemParticipacao[]; cor?: string }) {
  const somaAbs = itens.reduce((a, i) => a + Math.abs(i.valor), 0) || 1;
  const maior = Math.max(...itens.map((i) => Math.abs(i.valor)), 1);
  const total = itens.reduce((a, i) => a + i.valor, 0);
  return (
    <figure className="cartao p-3 sm:p-4">
      <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold text-[var(--marca)]">{titulo}</span>
        <span className="text-[var(--texto-suave)]">
          Consolidado <b className="num text-[var(--texto)]">{brl(total)}</b>
        </span>
      </figcaption>
      <ul className="space-y-2.5">
        {itens.map((i) => {
          const neg = i.valor < 0;
          return (
            <li key={i.nome} className="text-sm">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="truncate">{i.nome}</span>
                <span className="shrink-0">
                  <b className={`num ${neg ? "text-red-700" : ""}`}>{brl(i.valor)}</b>
                  <span className="ml-2 text-xs text-[var(--texto-suave)]">
                    {((Math.abs(i.valor) / somaAbs) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
                  </span>
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-[var(--fundo)]">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(Math.abs(i.valor) / maior) * 100}%`, background: neg ? DESCE : cor }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
