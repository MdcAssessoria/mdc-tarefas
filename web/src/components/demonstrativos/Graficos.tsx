"use client";

// Gráficos em SVG puro (sem bibliotecas), na paleta validada da MDC.
import { useState } from "react";
import { brl } from "@/lib/formato/moeda";

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

/** Quebra o rótulo em até 2 linhas que cabem na largura da coluna. */
function quebrar(t: string, max: number) {
  const linhas: string[] = [];
  let atual = "";
  for (const p of t.split(" ")) {
    if (atual && (atual + " " + p).length > max) {
      linhas.push(atual);
      atual = p;
    } else atual = atual ? atual + " " + p : p;
  }
  if (atual) linhas.push(atual);
  if (linhas.length > 2)
    linhas.splice(
      1,
      linhas.length - 1,
      linhas
        .slice(1)
        .join(" ")
        .slice(0, max - 1) + "…",
    );
  return linhas;
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

interface CascataPasso {
  rotulo: string;
  valor: number;
  total?: boolean;
}

/** Cascata da DRE: da receita bruta ao lucro líquido. */
export function Cascata({ passos }: { passos: CascataPasso[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720,
    H = 260,
    ml = 56,
    mr = 12,
    mt = 12,
    mb = 48;
  // cada passo começa onde o anterior terminou; passos "total" recomeçam do zero
  const barras: (CascataPasso & { de: number; ate: number })[] = [];
  for (const p of passos) {
    const de = p.total ? 0 : (barras.at(-1)?.ate ?? 0);
    barras.push({ ...p, de, ate: p.total ? p.valor : de + p.valor });
  }
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
              {i < barras.length - 1 && <line x1={x + w} x2={x + bw} y1={y(b.ate)} y2={y(b.ate)} stroke={COR.eixo} strokeDasharray="2 3" />}
              {quebrar(b.rotulo, Math.max(8, Math.floor(bw / 6.5))).map((ln, k) => (
                <text
                  key={k}
                  x={ml + i * bw + bw / 2}
                  y={H - mb + 16 + k * 14}
                  textAnchor="middle"
                  fontSize="11"
                  fill={k ? COR.eixo : "#1c2420"}
                >
                  {ln}
                </text>
              ))}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <Dica
          x={`${((ml + hover * bw + bw / 2) / W) * 100}%`}
          y={0}
          linhas={[barras[hover].rotulo, brl(barras[hover].total ? barras[hover].ate : barras[hover].valor, { centavos: false })]}
        />
      )}
    </div>
  );
}

/** Linhas de evolução mensal (uma escala, até 3 séries). */
export function Evolucao({ meses, series }: { meses: string[]; series: { nome: string; cor: string; valores: (number | null)[] }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720,
    H = 240,
    ml = 56,
    mr = 24,
    mt = 12,
    mb = 28;
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
              {pts.length > 1 && (
                <polyline
                  points={pts.map((p) => p.join(",")).join(" ")}
                  fill="none"
                  stroke={s.cor}
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              )}
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
          linhas={[meses[hover], ...series.map((s) => `${s.nome}: ${brl(s.valores[hover], { centavos: false })}`)]}
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
        <div
          key={i.rotulo}
          className="grid grid-cols-[minmax(0,180px)_1fr_auto] items-center gap-2 text-sm"
          title={`${i.rotulo}: ${brl(i.valor, { centavos: false })}`}
        >
          <span className="truncate text-neutral-700">{i.rotulo}</span>
          <div className="h-3.5 rounded bg-[var(--fundo)]">
            <div className="h-3.5 rounded" style={{ width: `${(i.valor / max) * 100}%`, background: cor }} />
          </div>
          <span className="whitespace-nowrap text-right tabular-nums text-neutral-600">
            {brl(i.valor, { centavos: false })}{" "}
            <span className="text-xs text-neutral-400">{total ? `${Math.round((i.valor / total) * 100)}%` : ""}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** Mini-curva de um índice ao longo dos meses. */
export function Faisca({
  valores,
  alerta,
  reta,
}: {
  valores: (number | null)[];
  alerta?: boolean;
  reta?: { a: number; b: number } | null;
}) {
  const v = valores.filter((x): x is number => x !== null && Number.isFinite(x));
  if (v.length < 2) return null;
  const W = 120,
    H = 32;
  const n = valores.length - 1 || 1;
  const yReta = reta ? [reta.a, reta.a + reta.b * n] : [];
  const min = Math.min(...v, ...yReta),
    max = Math.max(...v, ...yReta);
  const py = (x: number) => H - 4 - ((x - min) / (max - min || 1)) * (H - 8);
  const pts = valores
    .map((x, i) => (x === null || !Number.isFinite(x) ? null : `${(i / n) * W},${py(x)}`))
    .filter(Boolean)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-8 w-28" aria-hidden="true">
      {reta && <line x1={0} x2={W} y1={py(yReta[0])} y2={py(yReta[1])} stroke={COR.eixo} strokeWidth="1.2" strokeDasharray="3 3" />}
      <polyline points={pts} fill="none" stroke={alerta ? COR.negativo : COR.lucro} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

// ---------------------------------------------------------------- painel de saúde e composições

export const STATUS = {
  bom: { cor: "#067647", fundo: "#ECFDF3", icone: "✔", rotulo: "Bom" },
  atencao: { cor: "#B54708", fundo: "#FFFAEB", icone: "!", rotulo: "Atenção" },
  critico: { cor: "#B42318", fundo: "#FEF3F2", icone: "✖", rotulo: "Crítico" },
} as const;

/** Termômetro (meio círculo) de 0 a 100 com três faixas. */
export function Termometro({ nota, faixa }: { nota: number; faixa: string }) {
  const W = 240,
    H = 140,
    cx = 120,
    cy = 120,
    R = 96,
    esp = 18;
  const pt = (v: number, r = R) => {
    const a = Math.PI * (1 - v / 100);
    return [cx + r * Math.cos(a), cy - r * Math.sin(a)];
  };
  const arco = (de: number, ate: number) => {
    const [x1, y1] = pt(de),
      [x2, y2] = pt(ate);
    return `M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2}`;
  };
  const cor = nota >= 75 ? STATUS.bom.cor : nota >= 50 ? STATUS.atencao.cor : STATUS.critico.cor;
  const [px, py] = pt(nota, R - esp / 2 - 14);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="mx-auto w-full max-w-[260px]"
      role="img"
      aria-label={`Termômetro de saúde: ${nota} de 100, ${faixa}`}
    >
      <path d={arco(0, 49.5)} stroke={STATUS.critico.cor} strokeOpacity={0.22} strokeWidth={esp} fill="none" />
      <path d={arco(50.5, 74.5)} stroke={STATUS.atencao.cor} strokeOpacity={0.22} strokeWidth={esp} fill="none" />
      <path d={arco(75.5, 100)} stroke={STATUS.bom.cor} strokeOpacity={0.22} strokeWidth={esp} fill="none" />
      <path d={arco(0, Math.max(0.5, nota))} stroke={cor} strokeWidth={esp} fill="none" strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={px} y2={py} stroke="#1c2420" strokeWidth="3" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="6" fill="#1c2420" />
      <text x={cx} y={cy - 34} textAnchor="middle" fontSize="30" fontWeight="700" fill="#1c2420">
        {nota}
      </text>
      <text x={14} y={H - 2} fontSize="10" fill={COR.eixo}>
        0
      </text>
      <text x={W - 14} y={H - 2} textAnchor="end" fontSize="10" fill={COR.eixo}>
        100
      </text>
    </svg>
  );
}

/** Barra 100% com rótulos diretos: para onde vai cada R$ 100 de receita. */
export function Pilha100({ partes }: { partes: { rotulo: string; valor: number; cor: string }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const pos = partes.filter((p) => p.valor > 0);
  const total = pos.reduce((a, p) => a + p.valor, 0) || 1;
  return (
    <div>
      <div className="flex h-10 w-full gap-[2px] overflow-hidden rounded-md" role="img" aria-label="Composição de cada R$ 100 de receita">
        {pos.map((p, i) => {
          const w = (p.valor / total) * 100;
          return (
            <div
              key={p.rotulo}
              className="relative flex items-center justify-center text-xs font-semibold text-white"
              style={{ width: `${w}%`, background: p.cor, opacity: hover === null || hover === i ? 1 : 0.6 }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              title={`${p.rotulo}: R$ ${w.toFixed(1).replace(".", ",")} de cada R$ 100 (${brl(p.valor, { centavos: false })})`}
            >
              {w >= 7 ? `R$ ${Math.round(w)}` : ""}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-700">
        {pos.map((p) => (
          <span key={p.rotulo} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.cor }} />
            {p.rotulo} <b className="tabular-nums">R$ {((p.valor / total) * 100).toFixed(1).replace(".", ",")}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Linha do tempo do ciclo: estoque + recebimento × pagamento. */
export function CicloCaixa({ pme, pmr, pmp }: { pme: number | null; pmr: number | null; pmp: number | null }) {
  const e = Math.max(0, pme ?? 0),
    r = Math.max(0, pmr ?? 0),
    p = Math.max(0, pmp ?? 0);
  const total = Math.max(e + r, p, 1);
  const pctW = (v: number) => `${(v / total) * 100}%`;
  const cf = e + r - p;
  return (
    <div className="space-y-3 text-xs">
      <div>
        <div className="mb-1 text-neutral-600">Do estoque ao dinheiro na conta (ciclo operacional: {e + r} dias)</div>
        <div className="flex h-8 gap-[2px]">
          {e > 0 && (
            <div
              className="flex items-center justify-center rounded-l-md text-white"
              style={{ width: pctW(e), background: COR.despesa }}
              title={`PME ${e} dias`}
            >
              Estoque {e}d
            </div>
          )}
          <div
            className={`flex items-center justify-center text-white ${e > 0 ? "rounded-r-md" : "rounded-md"}`}
            style={{ width: pctW(r), background: COR.receita }}
            title={`PMR ${r} dias`}
          >
            Recebimento {r}d
          </div>
        </div>
      </div>
      <div>
        <div className="mb-1 text-neutral-600">Prazo que os fornecedores dão (PMP)</div>
        <div className="flex h-8">
          <div
            className="flex items-center justify-center rounded-md text-white"
            style={{ width: pctW(p), background: COR.lucro }}
            title={`PMP ${p} dias`}
          >
            Pagamento {p}d
          </div>
        </div>
      </div>
      <p className={`rounded-md p-2 ${cf > 0 ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-900"}`}>
        {cf > 0
          ? `Ciclo financeiro de ${cf} dias: a empresa paga antes de receber e precisa financiar esse intervalo com caixa próprio ou de banco.`
          : cf === 0
            ? "A empresa recebe dos clientes e paga os fornecedores em prazos equivalentes: o ciclo de caixa está zerado."
            : `A empresa recebe ${-cf} dia(s) antes de pagar — os fornecedores financiam a operação.`}
      </p>
    </div>
  );
}

/** Uma coluna empilhada da Composicao; "total" é o maior dos dois lados, para as duas colunas ficarem na mesma escala. */
function ColunaComposicao({
  titulo,
  itens,
  total,
}: {
  titulo: string;
  itens: { rotulo: string; valor: number; cor: string }[];
  total: number;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="mb-1 text-center text-xs font-semibold text-neutral-700">{titulo}</div>
      <div className="flex h-56 flex-col-reverse gap-[2px]">
        {itens
          .filter((x) => x.valor > 0)
          .map((x) => {
            const h = (x.valor / total) * 100;
            return (
              <div
                key={x.rotulo}
                className="flex items-center justify-center rounded-sm px-1 text-center text-[11px] font-semibold leading-tight text-white"
                style={{ height: `${h}%`, background: x.cor }}
                title={`${x.rotulo}: ${brl(x.valor, { centavos: false })} (${h.toFixed(0)}%)`}
              >
                {h >= 8 ? `${h.toFixed(0)}%` : ""}
              </div>
            );
          })}
      </div>
      <div className="mt-2 space-y-0.5 text-[11px] text-neutral-700">
        {[...itens].reverse().map((x) => (
          <div key={x.rotulo} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: x.cor }} />
            <span className="truncate">{x.rotulo}</span>
            <b className={`ml-auto whitespace-nowrap tabular-nums ${x.valor < 0 ? "text-[var(--perigo)]" : ""}`}>
              {brl(x.valor, { centavos: false })}
            </b>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Duas colunas empilhadas: o que a empresa tem × quem financia. */
export function Composicao({
  ativo,
  passivo,
}: {
  ativo: { rotulo: string; valor: number; cor: string }[];
  passivo: { rotulo: string; valor: number; cor: string }[];
}) {
  const tot = Math.max(
    1,
    ativo.reduce((a, x) => a + Math.max(0, x.valor), 0),
    passivo.reduce((a, x) => a + Math.max(0, x.valor), 0),
  );
  return (
    <div className="flex gap-5">
      <ColunaComposicao titulo="O que a empresa tem" itens={ativo} total={tot} />
      <ColunaComposicao titulo="Quem financia" itens={passivo} total={tot} />
    </div>
  );
}

/** Colunas agrupadas por mês (até 2 séries, mesma escala). */
export function ColunasPareadas({
  meses,
  series,
}: {
  meses: string[];
  series: { nome: string; cor: string; valores: (number | null)[] }[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720,
    H = 240,
    ml = 56,
    mr = 12,
    mt = 12,
    mb = 28;
  const todos = series.flatMap((s) => s.valores.filter((v): v is number => v !== null));
  const { ini, fim, ticks } = escala(Math.min(0, ...todos), Math.max(0, ...todos));
  const y = (v: number) => mt + (1 - (v - ini) / (fim - ini)) * (H - mt - mb);
  const gw = (W - ml - mr) / Math.max(1, meses.length);
  const bw = Math.min(22, (gw * 0.7) / series.length);
  return (
    <div className="relative">
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-neutral-600">
        {series.map((s) => (
          <span key={s.nome} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.cor }} />
            {s.nome}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Comparação mensal" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={ml} x2={W - mr} y1={y(t)} y2={y(t)} stroke={COR.grade} strokeWidth={t === 0 ? 1.5 : 1} />
            <text x={ml - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill={COR.eixo}>
              {curto(t)}
            </text>
          </g>
        ))}
        {meses.map((m, i) => {
          const x0 = ml + i * gw + (gw - bw * series.length - 2 * (series.length - 1)) / 2;
          return (
            <g key={m} onMouseEnter={() => setHover(i)}>
              <rect x={ml + i * gw} y={mt} width={gw} height={H - mt - mb} fill="transparent" />
              {series.map((s, k) => {
                const v = s.valores[i];
                if (v === null) return null;
                const top = y(Math.max(0, v)),
                  alt = Math.max(1.5, Math.abs(y(v) - y(0)));
                return (
                  <rect
                    key={s.nome}
                    x={x0 + k * (bw + 2)}
                    y={top}
                    width={bw}
                    height={alt}
                    rx="3"
                    fill={v < 0 && series.length === 1 ? COR.negativo : s.cor}
                    opacity={hover === null || hover === i ? 1 : 0.55}
                  />
                );
              })}
              <text x={ml + i * gw + gw / 2} y={H - 8} textAnchor="middle" fontSize="11" fill={COR.eixo}>
                {m}
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <Dica
          x={`${((ml + hover * gw + gw / 2) / W) * 100}%`}
          y={0}
          linhas={[meses[hover], ...series.map((s) => `${s.nome}: ${brl(s.valores[hover], { centavos: false })}`)]}
        />
      )}
    </div>
  );
}
