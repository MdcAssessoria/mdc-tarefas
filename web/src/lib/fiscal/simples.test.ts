import { describe, expect, it } from "vitest";
import { aliquotaEfetiva, anexoDaAtividade, anexoPeloFatorR } from "./simples";

describe("aliquotaEfetiva (LC 123, art. 18, §1º-A)", () => {
  it("1ª faixa: a efetiva é a nominal", () => {
    expect(aliquotaEfetiva("III", 150_000)).toMatchObject({ faixa: 1, efetiva: 6 });
  });
  it("Anexo III, 2ª faixa: (300.000 × 11,2% − 9.360) ÷ 300.000 = 8,08%", () => {
    expect(aliquotaEfetiva("III", 300_000)).toMatchObject({ faixa: 2, nominal: 11.2, deduzir: 9_360, efetiva: 8.08 });
  });
  it("Anexo V, 3ª faixa: (500.000 × 19,5% − 9.900) ÷ 500.000 = 17,52%", () => {
    expect(aliquotaEfetiva("V", 500_000).efetiva).toBe(17.52);
  });
  it("limite da faixa fica na faixa (até 180.000 é 1ª)", () => {
    expect(aliquotaEfetiva("III", 180_000).faixa).toBe(1);
    expect(aliquotaEfetiva("III", 180_000.01).faixa).toBe(2);
  });
  it("Anexo IV, 4ª faixa: (1.000.000 × 14% − 39.780) ÷ 1.000.000 = 10,02%", () => {
    expect(aliquotaEfetiva("IV", 1_000_000).efetiva).toBe(10.02);
  });
  it("sem receita no ano: 1ª faixa, com aviso", () => {
    const r = aliquotaEfetiva("V", 0);
    expect(r).toMatchObject({ faixa: 1, efetiva: 15.5 });
    expect(r.aviso).toBeTruthy();
  });
  it("acima de 4,8 milhões: última faixa e aviso", () => {
    const r = aliquotaEfetiva("III", 5_000_000);
    expect(r.faixa).toBe(6);
    expect(r.aviso).toMatch(/limite/);
  });
});

describe("Fator R", () => {
  it("28% ou mais vai para o Anexo III", () => {
    expect(anexoPeloFatorR(28_000, 100_000)).toMatchObject({ anexo: "III" });
  });
  it("abaixo de 28% vai para o Anexo V", () => {
    expect(anexoPeloFatorR(27_999, 100_000)).toMatchObject({ anexo: "V" });
  });
});

describe("anexoDaAtividade (Anexo VIII, COD_ATIV_SN)", () => {
  it("códigos do Anexo VIII", () => {
    expect(anexoDaAtividade("7")).toBe("III");
    expect(anexoDaAtividade("9")).toBe("fator_r");
    expect(anexoDaAtividade("14")).toBe("IV");
    expect(anexoDaAtividade("IMP")).toBe("impeditiva");
    expect(anexoDaAtividade("")).toBeNull();
  });
});

describe("semIssAnexoIII (escritório contábil, ISS fixo)", () => {
  it("2ª faixa: 8,08% sem os 32% do ISS = 5,49%", async () => {
    const { semIssAnexoIII } = await import("./simples");
    expect(semIssAnexoIII(aliquotaEfetiva("III", 300_000))).toBe(5.49);
  });
  it("outro anexo não muda", async () => {
    const { semIssAnexoIII } = await import("./simples");
    expect(semIssAnexoIII(aliquotaEfetiva("V", 300_000))).toBe(aliquotaEfetiva("V", 300_000).efetiva);
  });
});
