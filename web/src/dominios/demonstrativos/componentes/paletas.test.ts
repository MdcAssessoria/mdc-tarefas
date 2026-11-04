// Testes da escolha da cor do texto sobre as barras coloridas dos gráficos (contraste WCAG AA).
import { describe, expect, it } from "vitest";
import { COR, PAL_ATIVO, PAL_PASSIVO, PAL_RECEITA, corTextoSobre } from "./paletas";

function contraste(a: string, b: string) {
  const l = (h: string) => {
    const [r, g, bb] = [0, 2, 4].map((i) => {
      const c = parseInt(h.replace("#", "").slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bb;
  };
  const [x, y] = [l(a), l(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

describe("corTextoSobre", () => {
  it("usa branco em fundo escuro e texto escuro em fundo claro", () => {
    expect(corTextoSobre("#0b2820")).toBe("#ffffff");
    expect(corTextoSobre("#eda100")).toBe("#18211d");
  });
  it("todas as cores dos gráficos ficam com contraste de pelo menos 4,5:1 com o texto escolhido", () => {
    const cores = [COR.receita, COR.despesa, COR.lucro, ...Object.values(PAL_RECEITA), ...PAL_ATIVO, ...PAL_PASSIVO];
    for (const c of cores) expect(contraste(c, corTextoSobre(c)), c).toBeGreaterThanOrEqual(4.5);
  });
});
