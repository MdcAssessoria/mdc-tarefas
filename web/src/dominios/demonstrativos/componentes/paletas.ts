// Cores dos gráficos de demonstrativos (paletas validadas de visualização de dados): séries, composição
// da receita e do balanço, e o sentido da tendência dos índices. Use sempre com rótulo direto.

/** Cores das séries dos gráficos (receita, despesa, lucro) e dos eixos. */
export const COR = {
  receita: "#1B8263",
  despesa: "#C0892A",
  lucro: "#4A78B5",
  negativo: "#B42318",
  grade: "#E4E0D4",
  eixo: "#8C948F",
};

// paletas validadas (dataviz): composição da receita e do balanço — sempre com rótulo direto
export const PAL_RECEITA = { impostos: "#6250d6", custos: "#C0892A", despesas: "#c0446f", financeiro: "#2a6fc9", lucro: "#1B8263" };
export const PAL_ATIVO = ["#2a6fc9", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
export const PAL_PASSIVO = ["#6250d6", "#c93a39", "#008300", "#eda100", "#1B8263"];

/** Sentido da tendência linear de um índice. */
export const SENTIDO = {
  melhora: { icone: "▲", cor: "#067647", nome: "melhorando" },
  piora: { icone: "▼", cor: "#B42318", nome: "piorando" },
  estavel: { icone: "●", cor: "#5D6661", nome: "sem tendência clara" },
} as const;

/** Luminância relativa (WCAG) de uma cor "#rrggbb". */
function luminancia(hex: string): number {
  const v = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(v.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Cor do texto escrito sobre uma barra colorida: branco ou o texto escuro do HUB, o que tiver mais contraste (WCAG AA). */
export function corTextoSobre(fundo: string): string {
  const l = luminancia(fundo);
  const branco = 1.05 / (l + 0.05);
  const escuro = (l + 0.05) / (luminancia("#18211d") + 0.05);
  return branco >= escuro ? "#ffffff" : "#18211d";
}
