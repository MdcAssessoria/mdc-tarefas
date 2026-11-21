// Testes do formato da tabela e dos documentos por mês (formatoMatriz.ts).
import { describe, expect, it } from "vitest";
import { documentosNosMeses, fmtCelula } from "./formatoMatriz";
import type { OrigemBanco } from "./detalhe";

describe("fmtCelula", () => {
  it("sem centavos por padrão, com sinal tipográfico e traço no zero", () => {
    expect(fmtCelula(468666.25)).toBe("468.666");
    expect(fmtCelula(-26252)).toBe("−26.252");
    expect(fmtCelula(0)).toBe("–");
    expect(fmtCelula(0.4)).toBe("–");
    expect(fmtCelula(1234.5, true)).toBe("1.234,50");
  });
});

describe("documentosNosMeses", () => {
  const o = (data: string, valor: number, documento: string): OrigemBanco => ({
    empresa: "A",
    origem: "titulo",
    data,
    documento,
    pessoa: "Fulano",
    doc: null,
    categoria: "6.1.01 - Salários",
    conta: "6.1.01",
    valor,
  });
  it("põe cada documento no mês da data e ordena pelo maior valor", () => {
    const r = documentosNosMeses(
      [o("2026-01-05", -100, "1"), o("2026-02-10", -300, "2"), o("2025-12-01", -5, "3")],
      ["2026-01", "2026-02"],
      false,
    );
    expect(r.map((d) => d.rotulo)).toEqual(["10/02 · Doc. 2 · Fulano", "05/01 · Doc. 1 · Fulano", "01/12 · Doc. 3 · Fulano"]);
    expect(r[0].valores).toEqual([0, -300]);
    expect(r[2].valores).toEqual([0, 0]);
  });
});
