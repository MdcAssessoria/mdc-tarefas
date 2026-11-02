// Tons de cor das peças de lista (indicador, chip): o mesmo tom para o mesmo significado em todo o HUB.
// vermelho = vencido/problema, âmbar = atenção, azul = a vencer/previsto, verde = pago/feito, neutro = inativo.
export type Tom = "neutro" | "verde" | "vermelho" | "ambar" | "azul" | "violeta";

/** Cores de cada tom: texto do número, fundo e traço do ícone, e o chip. */
export const TONS: Record<Tom, { valor: string; icone: string; chip: string; ponto: string }> = {
  neutro: { valor: "text-[var(--texto)]", icone: "bg-[var(--fundo)] text-[var(--marca)]", chip: "bg-neutral-100 text-neutral-700", ponto: "bg-neutral-400" },
  verde: { valor: "text-emerald-800", icone: "bg-emerald-50 text-emerald-700", chip: "bg-emerald-50 text-emerald-800", ponto: "bg-emerald-600" },
  vermelho: { valor: "text-red-700", icone: "bg-red-50 text-red-700", chip: "bg-red-50 text-red-800", ponto: "bg-red-600" },
  ambar: { valor: "text-amber-800", icone: "bg-amber-50 text-amber-700", chip: "bg-amber-50 text-amber-900", ponto: "bg-amber-500" },
  azul: { valor: "text-sky-900", icone: "bg-sky-50 text-sky-700", chip: "bg-sky-50 text-sky-900", ponto: "bg-sky-600" },
  violeta: { valor: "text-violet-900", icone: "bg-violet-50 text-violet-700", chip: "bg-violet-50 text-violet-900", ponto: "bg-violet-600" },
};
