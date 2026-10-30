// Tendência linear (mínimos quadrados) dos índices ao longo dos meses.
import type { Indices } from "./balancete";

export interface Tendencia {
  n: number; // meses usados
  inclinacao: number; // variação média por mês
  intercepto: number;
  r2: number; // 0 a 1: quanto a reta explica a oscilação
  inicio: number; // valor da reta no primeiro mês
  fim: number; // valor da reta no último mês
  projecao3: number; // valor projetado 3 meses à frente
  sentido: "melhora" | "piora" | "estavel";
}

// sentido "bom" de cada índice: true = quanto maior melhor
export const MAIOR_MELHOR: Partial<Record<keyof Indices, boolean>> = {
  liquidez_corrente: true,
  liquidez_seca: true,
  liquidez_imediata: true,
  liquidez_geral: true,
  capital_giro: true,
  margem_bruta: true,
  margem_operacional: true,
  margem_liquida: true,
  roe: true,
  pmp: true,
  endividamento_geral: false,
  composicao_endividamento: false,
  pmr: false,
  pme: false,
  pmv: false,
  ciclo_operacional: false,
  ciclo_financeiro: false,
  carga_tributaria: false,
};

/**
 * Reta y = a + b·t sobre os meses com valor (t = posição do mês na série, para respeitar meses faltantes).
 * Exige 3 pontos. "Estável" quando a reta explica pouco (R² < 0,3) ou a variação total é menor que 5% do nível.
 */
export function tendenciaLinear(valores: (number | null | undefined)[], maiorMelhor = true): Tendencia | null {
  const pts = valores
    .map((y, t) => ({ t, y }))
    .filter((p): p is { t: number; y: number } => p.y !== null && p.y !== undefined && Number.isFinite(p.y));
  const n = pts.length;
  if (n < 3) return null;
  const mt = pts.reduce((s, p) => s + p.t, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  let sxy = 0,
    sxx = 0,
    syy = 0;
  for (const p of pts) {
    sxy += (p.t - mt) * (p.y - my);
    sxx += (p.t - mt) ** 2;
    syy += (p.y - my) ** 2;
  }
  if (sxx === 0) return null;
  const b = sxy / sxx;
  const a = my - b * mt;
  const r2 = syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  const t0 = pts[0].t,
    t1 = pts[n - 1].t;
  const inicio = a + b * t0,
    fim = a + b * t1;
  const nivel = Math.max(Math.abs(my), 1e-9);
  const relevante = r2 >= 0.3 && Math.abs(fim - inicio) >= 0.05 * nivel;
  const sobe = b > 0;
  return {
    n,
    inclinacao: b,
    intercepto: a,
    r2,
    inicio,
    fim,
    projecao3: a + b * (t1 + 3),
    sentido: !relevante ? "estavel" : sobe === maiorMelhor ? "melhora" : "piora",
  };
}
