import { describe, expect, it } from "vitest";
import { limparPin, msAte, problemaPinNovo, textoMinutos } from "./pin";

describe("PIN das organizações pessoais", () => {
  it("o campo aceita só 4 números", () => {
    expect(limparPin("48a2-61")).toBe("4826");
    expect(limparPin("12")).toBe("12");
  });

  it("PIN novo: 4 números, difícil de adivinhar e confirmado", () => {
    expect(problemaPinNovo("482", "482")).toMatch(/exatamente 4/);
    expect(problemaPinNovo("1234", "1234")).toMatch(/fácil/);
    expect(problemaPinNovo("0000", "0000")).toMatch(/fácil/);
    expect(problemaPinNovo("4826", "4827")).toMatch(/não são iguais/);
    expect(problemaPinNovo("4826", "4826")).toBeNull();
  });

  it("tempo até o fim do prazo", () => {
    expect(msAte(null)).toBe(0);
    expect(msAte(new Date(10_000).toISOString(), 4_000)).toBe(6_000);
    expect(msAte(new Date(1_000).toISOString(), 4_000)).toBe(0);
    expect(textoMinutos(61_000)).toBe("2 minutos");
    expect(textoMinutos(10_000)).toBe("1 minuto");
  });
});
