// Testes do valor por extenso usado no contrato (cláusula de honorários e taxa de implantação).
import { describe, expect, it } from "vitest";
import { valorExtenso } from "./crm";

describe("valor por extenso", () => {
  it.each([
    [0.01, "um centavo"],
    [0.5, "cinquenta centavos"],
    [1, "um real"],
    [101, "cento e um reais"],
    [1000, "mil reais"],
    [1001, "mil e um reais"],
    [1200, "mil e duzentos reais"],
    [1234.56, "mil duzentos e trinta e quatro reais e cinquenta e seis centavos"],
    [1250.5, "mil duzentos e cinquenta reais e cinquenta centavos"],
    [2000, "dois mil reais"],
    [21500, "vinte e um mil e quinhentos reais"],
    [1_000_000, "um milhão de reais"],
    [2_000_000, "dois milhões de reais"],
    [1_000_001, "um milhão e um reais"],
    [1_001_000, "um milhão e mil reais"],
    [2_500_000, "dois milhões e quinhentos mil reais"],
    [1_100_000.1, "um milhão e cem mil reais e dez centavos"],
    [2_000_300, "dois milhões e trezentos reais"],
    [1_234_567, "um milhão duzentos e trinta e quatro mil quinhentos e sessenta e sete reais"],
    [1_000_000_000, "um bilhão de reais"],
    [1_200_300, "um milhão e duzentos mil e trezentos reais"],
    [1_200_000, "um milhão e duzentos mil reais"],
    [1_230_300, "um milhão duzentos e trinta mil e trezentos reais"],
    [2_100_050, "dois milhões e cem mil e cinquenta reais"],
    [1_500_000_000, "um bilhão e quinhentos milhões de reais"],
  ])("%s → %s", (v, esperado) => {
    expect(valorExtenso(v)).toBe(esperado);
  });

  it('nunca escreve "um mil"', () => {
    for (const v of [1000, 1001, 1_001_000, 3_001_999]) expect(valorExtenso(v)).not.toMatch(/\bum mil\b/);
  });
});
