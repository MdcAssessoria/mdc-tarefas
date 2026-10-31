// Testes de lib/texto.ts.
import { describe, expect, it } from "vitest";
import { semAcento } from "./texto";

describe("semAcento", () => {
  it("tira acentos e mantém o resto", () => {
    expect(semAcento("Patrimônio Líquido (-) Ação")).toBe("Patrimonio Liquido (-) Acao");
    expect(semAcento(null)).toBe("");
    expect(semAcento(123)).toBe("123");
  });
});
