// Testes das margens por faixa da DRE (margens.ts).
import { describe, expect, it } from "vitest";
import { calcularMargens, FAIXAS_MARGEM, nivelDaMargem } from "./margens";
import { montarMatriz } from "./relatorio";
import type { LinhaBanco } from "./relatorio";

const l = (codigo: string, valor: number): LinhaBanco => ({
  codigo,
  nome: codigo,
  ordem: 1,
  subtotal: true,
  natureza: null,
  competencia: "2026-01-01",
  valor,
});

const bruta = FAIXAS_MARGEM[0];
const liquida = FAIXAS_MARGEM[2];

describe("nivelDaMargem", () => {
  it("usa as faixas da margem bruta (abaixo de 20%, 20% a 35%, acima de 35%)", () => {
    expect(nivelDaMargem(bruta, 0.19)).toBe("baixa");
    expect(nivelDaMargem(bruta, 0.2)).toBe("media");
    expect(nivelDaMargem(bruta, 0.35)).toBe("media");
    expect(nivelDaMargem(bruta, 0.351)).toBe("boa");
  });
  it("margem líquida negativa é baixa; até 8% é atenção", () => {
    expect(nivelDaMargem(liquida, -0.01)).toBe("baixa");
    expect(nivelDaMargem(liquida, 0)).toBe("media");
    expect(nivelDaMargem(liquida, 0.09)).toBe("boa");
  });
});

describe("calcularMargens", () => {
  it("calcula as três margens sobre a receita líquida e explica em reais", () => {
    const m = montarMatriz([
      l("receita_liquida", 1000),
      l("lucro_bruto", 400),
      l("resultado_operacional", 80),
      l("resultado_liquido", -20),
    ]);
    const r = calcularMargens(m)!;
    expect(r.map((x) => x.valor)).toEqual([0.4, 0.08, -0.02]);
    expect(r.map((x) => x.nivel)).toEqual(["boa", "media", "baixa"]);
    expect(r[0].frase.replace(/\s/g, " ")).toContain("sobraram R$ 40");
    expect(r[2].frase.replace(/\s/g, " ")).toContain("faltaram R$ 2");
    expect(r[0].regua).toBe("Faixas: abaixo de 20,0% · 20,0% a 35,0% · acima de 35,0%");
  });
  it("sem receita líquida não há margem", () => {
    expect(calcularMargens(montarMatriz([l("lucro_bruto", 10)]))).toBeNull();
  });
});
