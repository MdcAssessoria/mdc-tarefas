// Largura do menu lateral escolhida pela pessoa (arrastando a borda), guardada neste navegador. Regras puras aqui.
export const LARGURA_MENU = { minima: 220, padrao: 248, maxima: 420, passo: 16 } as const;

/** Mantém a largura dentro dos limites e arredonda para pixel inteiro. */
export function limitarLarguraMenu(px: number): number {
  if (!Number.isFinite(px)) return LARGURA_MENU.padrao;
  return Math.round(Math.min(LARGURA_MENU.maxima, Math.max(LARGURA_MENU.minima, px)));
}

/** Largura salva (texto) → número válido, ou a padrão se não houver ou estiver estragada. */
export function lerLarguraMenu(salvo: string | null): number {
  const n = salvo === null || salvo.trim() === "" ? NaN : Number(salvo);
  return Number.isFinite(n) ? limitarLarguraMenu(n) : LARGURA_MENU.padrao;
}
