// Contas puras dos gráficos do BI: escala com números redondos, acumulado e degraus da cascata (DRE da receita ao
// resultado). Sem React, para ter teste.
import type { Matriz } from "./relatorio";

/** Escala com números "redondos" (1, 2, 2,5, 5 × 10^n) cobrindo [min, max], sempre incluindo o zero. */
export function escalaRedonda(min: number, max: number, alvo = 5): { de: number; ate: number; marcas: number[] } {
  const lo = Math.min(0, min);
  const hi = Math.max(0, max);
  if (hi - lo < 1e-9) return { de: 0, ate: 1, marcas: [0, 1] };
  const bruto = (hi - lo) / Math.max(1, alvo - 1);
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * pot).find((p) => p >= bruto) ?? 10 * pot;
  const de = Math.floor(lo / passo) * passo;
  const ate = Math.ceil(hi / passo) * passo;
  const marcas: number[] = [];
  for (let v = de; v <= ate + passo / 1e6; v += passo) marcas.push(Math.round(v / passo) * passo);
  return { de, ate, marcas };
}

/** Soma acumulada mês a mês. */
export const acumulado = (valores: number[]) => {
  let s = 0;
  return valores.map((v) => (s += v));
};

export interface DegrauCascata {
  codigo: string;
  nome: string;
  /** Início e fim da barra (para subtotal, de 0 ao total). */
  de: number;
  ate: number;
  valor: number;
  subtotal: boolean;
}

/**
 * Degraus da cascata pela ordem do relatório: conta analítica sobe ou desce a partir do acumulado; subtotal mostra o
 * total até ali (de zero). Contas sem valor no período ficam de fora.
 */
export function cascata(m: Matriz, minimo = 0.005): DegrauCascata[] {
  let corrente = 0;
  const saida: DegrauCascata[] = [];
  for (const l of m.linhas) {
    if (l.subtotal) {
      corrente = l.total;
      if (saida.length) saida.push({ codigo: l.codigo, nome: l.nome, de: 0, ate: l.total, valor: l.total, subtotal: true });
      continue;
    }
    if (Math.abs(l.total) < minimo) continue;
    saida.push({ codigo: l.codigo, nome: l.nome, de: corrente, ate: corrente + l.total, valor: l.total, subtotal: false });
    corrente += l.total;
  }
  return saida;
}

/** Valor curto para eixo e rótulo: 1,2 mi · 350 mil · 980. */
export function curto(v: number): string {
  const a = Math.abs(v);
  const s =
    a >= 1e6
      ? `${(a / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: a >= 1e7 ? 0 : 1 })} mi`
      : a >= 1e3
        ? `${Math.round(a / 1e3).toLocaleString("pt-BR")} mil`
        : `${Math.round(a)}`;
  return `${v < 0 ? "−" : ""}${s}`;
}
