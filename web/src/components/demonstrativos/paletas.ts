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
export const PAL_RECEITA = { impostos: "#6250d6", custos: "#C0892A", despesas: "#D55181", financeiro: "#2a78d6", lucro: "#1B8263" };
export const PAL_ATIVO = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
export const PAL_PASSIVO = ["#6250d6", "#e34948", "#008300", "#eda100", "#1B8263"];

/** Sentido da tendência linear de um índice. */
export const SENTIDO = {
  melhora: { icone: "▲", cor: "#067647", nome: "melhorando" },
  piora: { icone: "▼", cor: "#B42318", nome: "piorando" },
  estavel: { icone: "●", cor: "#5D6661", nome: "sem tendência clara" },
} as const;
