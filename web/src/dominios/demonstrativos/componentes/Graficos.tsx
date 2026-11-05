"use client";

// Gráficos em SVG puro (sem bibliotecas), na paleta validada da MDC. Os de eixo (cascata, evolução, colunas) medem a
// largura do quadro (useLargura) e desenham nela: a letra fica com 11–12 px reais no computador e no celular.
import { useState } from "react";
import { brl } from "@/lib/formato/moeda";
import { saltoRotulos, useLargura } from "@/lib/useLargura";
import { COR, corTextoSobre } from "./paletas";

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

/** Dica ao passar o dedo/mouse: fica dentro do quadro (perto das bordas encosta para dentro). `esquerda` em %. */
function Dica({ esquerda, linhas }: { esquerda: number; linhas: string[] }) {
  const desloca = esquerda < 20 ? "0%" : esquerda > 80 ? "-100%" : "-50%";
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 rounded-lg border border-[var(--borda)] bg-white px-2.5 py-1.5 text-xs shadow-md"
      style={{ left: `${esquerda}%`, transform: `translateX(${desloca})` }}
    >
      {linhas.map((l, i) => (
        <div key={i} className={`whitespace-nowrap ${i === 0 ? "font-semibold" : ""}`}>
          {l}
        </div>
      ))}
    </div>
  );
}

/** Legenda em HTML: quebra linha sozinha quando não cabe (celular). */
function Legenda({ itens }: { itens: { nome: string; cor: string; linha?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600">
      {itens.map((s) => (
        <span key={s.nome} className="flex items-center gap-1.5">
          <span className={s.linha ? "h-0.5 w-4 shrink-0 rounded" : "h-2.5 w-2.5 shrink-0 rounded-sm"} style={{ background: s.cor }} />
          {s.nome}
        </span>
      ))}
    </div>
  );
}

/** Índice da coluna sob o dedo/mouse (gráficos com colunas de largura igual). */
function colunaSob(e: React.PointerEvent<SVGSVGElement>, W: number, ml: number, passo: number, n: number) {
  const r = e.currentTarget.getBoundingClientRect();
  const px = ((e.clientX - r.left) / r.width) * W;
  return Math.max(0, Math.min(n - 1, Math.floor((px - ml) / passo)));
}

/** Rótulo do eixo X só a cada `k` colunas (e sempre o último), para não encavalar no celular. */
const mostrarRotulo = (i: number, total: number, k: number) => i === total - 1 || (i % k === 0 && total - 1 - i >= Math.ceil(k * 0.6));

/** Abaixo desta largura (px) a cascata vira barras deitadas e os gráficos de linha/coluna ficam mais baixos. */
const LARGURA_ESTREITA = 520;

interface CascataPasso {
  rotulo: string;
  valor: number;
  total?: boolean;
}

/**
 * Cascata da DRE: da receita bruta ao lucro líquido. O SVG usa a largura real do quadro (useLargura), então a
 * letra tem sempre 11–12 px na tela. Em quadro estreito (celular) vira barras deitadas, uma por linha, com o nome
 * e o valor escritos — nada de rótulo espremido embaixo de coluna fina.
 */
export function Cascata({ passos }: { passos: CascataPasso[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const { ref, largura: W } = useLargura();
  // cada passo começa onde o anterior terminou; passos "total" recomeçam do zero
  const barras: (CascataPasso & { de: number; ate: number })[] = [];
  for (const p of passos) {
    const de = p.total ? 0 : (barras.at(-1)?.ate ?? 0);
    barras.push({ ...p, de, ate: p.total ? p.valor : de + p.valor });
  }
  const vals = barras.flatMap((b) => [b.de, b.ate]);
  const { ini, fim, ticks } = escala(Math.min(...vals), Math.max(...vals));
  const cor = (b: (typeof barras)[number]) => (b.total ? (b.ate < 0 ? COR.negativo : COR.lucro) : b.valor >= 0 ? COR.receita : COR.despesa);
  const descricao = "Cascata: " + barras.map((b) => `${b.rotulo} ${brl(b.total ? b.ate : b.valor, { centavos: false })}`).join("; ");

  if (W < LARGURA_ESTREITA) {
    const linhaH = 44,
      H = barras.length * linhaH,
      ml = 2,
      mr = 2;
    const x = (v: number) => ml + ((v - ini) / (fim - ini)) * (W - ml - mr);
    const letras = Math.max(10, Math.floor((W - 96) / 6.6));
    return (
      <div ref={ref}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={descricao}>
          <line x1={x(0)} x2={x(0)} y1={18} y2={H} stroke={COR.grade} strokeWidth="1.5" />
          {barras.map((b, i) => {
            const y0 = i * linhaH;
            const nome = b.rotulo.length > letras ? b.rotulo.slice(0, letras - 1) + "…" : b.rotulo;
            const valor = (b.total ? b.ate : b.valor) || 0; // "|| 0" evita "-R$ 0" (zero negativo)
            return (
              <g key={i}>
                <text x={ml} y={y0 + 14} fontSize="12" fontWeight={b.total ? 600 : 400} fill="#1c2420">
                  {nome}
                </text>
                <text x={W - mr} y={y0 + 14} textAnchor="end" fontSize="12" fontWeight="600" fill={valor < 0 ? COR.negativo : "#1c2420"}>
                  {!b.total && valor > 0 ? "+" : ""}
                  {brl(valor, { centavos: false })}
                </text>
                <rect
                  x={x(Math.min(b.de, b.ate))}
                  y={y0 + 21}
                  width={Math.max(2, Math.abs(x(b.ate) - x(b.de)))}
                  height={14}
                  rx="3"
                  fill={cor(b)}
                />
                {i < barras.length - 1 && (
                  <line x1={x(b.ate)} x2={x(b.ate)} y1={y0 + 35} y2={y0 + linhaH + 21} stroke={COR.eixo} strokeDasharray="2 3" />
                )}
              </g>
            );
          })}
        </svg>
      </div>
    );
  }

  const H = 260,
    ml = 52,
    mr = 12,
    mt = 12,
    mb = 48;
  const y = (v: number) => mt + (1 - (v - ini) / (fim - ini)) * (H - mt - mb);
  const bw = (W - ml - mr) / barras.length;
  const letras = Math.max(6, Math.floor(bw / 6.4));
  return (
    <div className="relative" ref={ref}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-pan-y"
        role="img"
        aria-label={descricao}
        onPointerMove={(e) => setHover(colunaSob(e, W, ml, bw, barras.length))}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={ml} x2={W - mr} y1={y(t)} y2={y(t)} stroke={COR.grade} strokeWidth={t === 0 ? 1.5 : 1} />
            <text x={ml - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill={COR.eixo}>
              {curto(t)}
            </text>
          </g>
        ))}
        {barras.map((b, i) => {
          const xb = ml + i * bw + bw * 0.18;
          const w = bw * 0.64;
          const topo = y(Math.max(b.de, b.ate));
          const alt = Math.max(1.5, Math.abs(y(b.de) - y(b.ate)));
          return (
            <g key={i}>
              <rect x={xb} y={topo} width={w} height={alt} rx="3" fill={cor(b)} opacity={hover === null || hover === i ? 1 : 0.55} />
              {i < barras.length - 1 && (
                <line x1={xb + w} x2={xb + bw} y1={y(b.ate)} y2={y(b.ate)} stroke={COR.eixo} strokeDasharray="2 3" />
              )}
              {quebrar(b.rotulo, letras).map((ln, k) => (
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
          esquerda={((ml + hover * bw + bw / 2) / W) * 100}
          linhas={[barras[hover].rotulo, brl(barras[hover].total ? barras[hover].ate : barras[hover].valor, { centavos: false })]}
        />
      )}
    </div>
  );
}

/** Linhas de evolução mensal (uma escala, até 3 séries). Acompanha a largura do quadro; no celular mostra menos meses no eixo. */
export function Evolucao({ meses, series }: { meses: string[]; series: { nome: string; cor: string; valores: (number | null)[] }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const { ref, largura: W } = useLargura();
  const H = W < LARGURA_ESTREITA ? 210 : 240,
    ml = 48,
    mr = 22,
    mt = 12,
    mb = 28;
  const todos = series.flatMap((s) => s.valores.filter((v): v is number => v !== null));
  const { ini, fim, ticks } = escala(Math.min(0, ...todos), Math.max(0, ...todos));
  const n = Math.max(1, meses.length - 1);
  const x = (i: number) => ml + (meses.length === 1 ? (W - ml - mr) / 2 : (i / n) * (W - ml - mr));
  const y = (v: number) => mt + (1 - (v - ini) / (fim - ini)) * (H - mt - mb);
  const k = saltoRotulos((W - ml - mr) / n);
  return (
    <div className="space-y-2">
      <Legenda itens={series.map((s) => ({ nome: s.nome, cor: s.cor, linha: true }))} />
      <div className="relative" ref={ref}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full touch-pan-y"
          role="img"
          aria-label={`Evolução de ${meses[0]} a ${meses.at(-1)}: ${series.map((s) => s.nome).join(", ")}`}
          onPointerLeave={() => setHover(null)}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
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
          {meses.map((m, i) =>
            mostrarRotulo(i, meses.length, k) ? (
              <text key={m} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill={COR.eixo}>
                {m}
              </text>
            ) : null,
          )}
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
                    <circle
                      key={i}
                      cx={x(i)}
                      cy={y(v)}
                      r={hover === i ? 5 : k > 1 ? 2.5 : 4}
                      fill={s.cor}
                      stroke="#fff"
                      strokeWidth={k > 1 ? 1 : 2}
                    />
                  ),
                )}
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <Dica
            esquerda={(x(hover) / W) * 100}
            linhas={[meses[hover], ...series.map((s) => `${s.nome}: ${brl(s.valores[hover], { centavos: false })}`)]}
          />
        )}
      </div>
    </div>
  );
}

/** Barras horizontais (composição de despesas, tributos): nome e valor em cima, barra embaixo (lê bem no celular). */
export function Barras({ itens, cor = COR.despesa }: { itens: { rotulo: string; valor: number }[]; cor?: string }) {
  const max = Math.max(1, ...itens.map((i) => i.valor));
  const total = itens.reduce((s, i) => s + i.valor, 0);
  return (
    <ul className="space-y-3">
      {itens.map((i) => (
        <li key={i.rotulo} title={`${i.rotulo}: ${brl(i.valor, { centavos: false })}`}>
          <div className="flex items-baseline gap-2 text-sm">
            <span className="min-w-0 flex-1 break-words text-neutral-700">{i.rotulo}</span>
            <span className="whitespace-nowrap font-medium tabular-nums">{brl(i.valor, { centavos: false })}</span>
            <span className="w-9 text-right text-xs tabular-nums text-neutral-500">
              {total ? `${Math.round((i.valor / total) * 100)}%` : ""}
            </span>
          </div>
          <div className="mt-1 h-2.5 rounded-full bg-[var(--fundo)]">
            <div className="h-2.5 rounded-full" style={{ width: `${Math.max(1, (i.valor / max) * 100)}%`, background: cor }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Mini-curva de um índice ao longo dos meses. */
export function Faisca({
  valores,
  alerta,
  reta,
  className = "h-8 w-28",
}: {
  valores: (number | null)[];
  alerta?: boolean;
  reta?: { a: number; b: number } | null;
  /** Tamanho na tela (padrão 112 × 32 px). */
  className?: string;
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
    <svg viewBox={`0 0 ${W} ${H}`} className={`shrink-0 ${className}`} aria-hidden="true">
      {reta && <line x1={0} x2={W} y1={py(yReta[0])} y2={py(yReta[1])} stroke={COR.eixo} strokeWidth="1.2" strokeDasharray="3 3" />}
      <polyline points={pts} fill="none" stroke={alerta ? COR.negativo : COR.lucro} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

// ---------------------------------------------------------------- painel de saúde e composições

/** Cores e rótulos do status de saúde financeira (bom, atenção, crítico). */
export const STATUS_SAUDE = {
  bom: { cor: "#067647", fundo: "#ECFDF3", icone: "check", rotulo: "Bom" },
  atencao: { cor: "#B54708", fundo: "#FFFAEB", icone: "exclamacao", rotulo: "Atenção" },
  critico: { cor: "#B42318", fundo: "#FEF3F2", icone: "fechar", rotulo: "Crítico" },
} as const;

/** Termômetro (meio círculo) de 0 a 100 com três faixas. Desenhado em ~240 px, mostrado com até 260 px. */
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
  const cor = nota >= 75 ? STATUS_SAUDE.bom.cor : nota >= 50 ? STATUS_SAUDE.atencao.cor : STATUS_SAUDE.critico.cor;
  const [px, py] = pt(nota, R - esp / 2 - 14);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="mx-auto w-full max-w-[260px]"
      role="img"
      aria-label={`Termômetro de saúde: ${nota} de 100, ${faixa}`}
    >
      <path d={arco(0, 49.5)} stroke={STATUS_SAUDE.critico.cor} strokeOpacity={0.22} strokeWidth={esp} fill="none" />
      <path d={arco(50.5, 74.5)} stroke={STATUS_SAUDE.atencao.cor} strokeOpacity={0.22} strokeWidth={esp} fill="none" />
      <path d={arco(75.5, 100)} stroke={STATUS_SAUDE.bom.cor} strokeOpacity={0.22} strokeWidth={esp} fill="none" />
      <path d={arco(0, Math.max(0.5, nota))} stroke={cor} strokeWidth={esp} fill="none" strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={px} y2={py} stroke="#1c2420" strokeWidth="3" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="6" fill="#1c2420" />
      <text x={cx} y={cy - 34} textAnchor="middle" fontSize="30" fontWeight="700" fill="#1c2420">
        {nota}
      </text>
      <text x={14} y={H - 2} fontSize="12" fill={COR.eixo}>
        0
      </text>
      <text x={W - 14} y={H - 2} textAnchor="end" fontSize="12" fill={COR.eixo}>
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
              className="relative flex items-center justify-center text-xs font-semibold"
              style={{ width: `${w}%`, background: p.cor, color: corTextoSobre(p.cor), opacity: hover === null || hover === i ? 1 : 0.6 }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              title={`${p.rotulo}: R$ ${w.toFixed(1).replace(".", ",")} de cada R$ 100 (${brl(p.valor, { centavos: false })})`}
            >
              {w >= 9 ? `R$ ${Math.round(w)}` : ""}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-700">
        {pos.map((p) => (
          <span key={p.rotulo} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: p.cor }} />
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
              className="flex min-w-0 items-center justify-center truncate rounded-l-md px-1"
              style={{ width: pctW(e), background: COR.despesa, color: corTextoSobre(COR.despesa) }}
              title={`PME ${e} dias`}
            >
              Estoque {e}d
            </div>
          )}
          <div
            className={`flex min-w-0 items-center justify-center truncate px-1 ${e > 0 ? "rounded-r-md" : "rounded-md"}`}
            style={{ width: pctW(r), background: COR.receita, color: corTextoSobre(COR.receita) }}
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
            className="flex min-w-0 items-center justify-center truncate rounded-md px-1"
            style={{ width: pctW(p), background: COR.lucro, color: corTextoSobre(COR.lucro) }}
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
                className="flex items-center justify-center rounded-sm px-1 text-center text-xs font-semibold leading-tight"
                style={{ height: `${h}%`, background: x.cor, color: corTextoSobre(x.cor) }}
                title={`${x.rotulo}: ${brl(x.valor, { centavos: false })} (${h.toFixed(0)}%)`}
              >
                {h >= 8 ? `${h.toFixed(0)}%` : ""}
              </div>
            );
          })}
      </div>
      {/* nome quebra linha em vez de ser cortado (no celular cada coluna tem ~160 px) */}
      <div className="mt-2 space-y-1 text-xs leading-tight text-neutral-700">
        {[...itens].reverse().map((x) => (
          <div key={x.rotulo} className="flex items-start gap-1.5">
            <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: x.cor }} />
            <span className="min-w-0 flex-1 break-words">{x.rotulo}</span>
            <b className={`whitespace-nowrap tabular-nums ${x.valor < 0 ? "text-[var(--perigo)]" : ""}`}>
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
    <div className="flex gap-3 sm:gap-5">
      <ColunaComposicao titulo="O que a empresa tem" itens={ativo} total={tot} />
      <ColunaComposicao titulo="Quem financia" itens={passivo} total={tot} />
    </div>
  );
}

/** Colunas agrupadas por mês (até 2 séries, mesma escala). Acompanha a largura do quadro; no celular pula rótulos do eixo. */
export function ColunasPareadas({
  meses,
  series,
}: {
  meses: string[];
  series: { nome: string; cor: string; valores: (number | null)[] }[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const { ref, largura: W } = useLargura();
  const H = W < LARGURA_ESTREITA ? 210 : 240,
    ml = 48,
    mr = 12,
    mt = 12,
    mb = 28;
  const todos = series.flatMap((s) => s.valores.filter((v): v is number => v !== null));
  const { ini, fim, ticks } = escala(Math.min(0, ...todos), Math.max(0, ...todos));
  const y = (v: number) => mt + (1 - (v - ini) / (fim - ini)) * (H - mt - mb);
  const gw = (W - ml - mr) / Math.max(1, meses.length);
  const vao = gw < 20 ? 1 : 2;
  const bw = Math.max(2, Math.min(22, (gw * 0.72) / series.length));
  const k = saltoRotulos(gw);
  return (
    <div className="space-y-2">
      <Legenda itens={series.map((s) => ({ nome: s.nome, cor: s.cor }))} />
      <div className="relative" ref={ref}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full touch-pan-y"
          role="img"
          aria-label={`Comparação de ${meses[0]} a ${meses.at(-1)}: ${series.map((s) => s.nome).join(" e ")}`}
          onPointerMove={(e) => setHover(colunaSob(e, W, ml, gw, meses.length))}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={ml} x2={W - mr} y1={y(t)} y2={y(t)} stroke={COR.grade} strokeWidth={t === 0 ? 1.5 : 1} />
              <text x={ml - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill={COR.eixo}>
                {curto(t)}
              </text>
            </g>
          ))}
          {meses.map((m, i) => {
            const x0 = ml + i * gw + (gw - bw * series.length - vao * (series.length - 1)) / 2;
            return (
              <g key={m}>
                {hover === i && <rect x={ml + i * gw} y={mt} width={gw} height={H - mt - mb} fill="#0b2820" opacity="0.05" />}
                {series.map((s, j) => {
                  const v = s.valores[i];
                  if (v === null) return null;
                  const top = y(Math.max(0, v)),
                    alt = Math.max(1.5, Math.abs(y(v) - y(0)));
                  return (
                    <rect
                      key={s.nome}
                      x={x0 + j * (bw + vao)}
                      y={top}
                      width={bw}
                      height={alt}
                      rx={bw > 6 ? 3 : 1}
                      fill={v < 0 && series.length === 1 ? COR.negativo : s.cor}
                      opacity={hover === null || hover === i ? 1 : 0.55}
                    />
                  );
                })}
                {mostrarRotulo(i, meses.length, k) && (
                  <text x={ml + i * gw + gw / 2} y={H - 8} textAnchor="middle" fontSize="11" fill={COR.eixo}>
                    {m}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <Dica
            esquerda={((ml + hover * gw + gw / 2) / W) * 100}
            linhas={[meses[hover], ...series.map((s) => `${s.nome}: ${brl(s.valores[hover], { centavos: false })}`)]}
          />
        )}
      </div>
    </div>
  );
}
