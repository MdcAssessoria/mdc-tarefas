// Testes do comparativo Resultado × Caixa (conciliacao.ts).
import { describe, expect, it } from "vitest";
import { conciliar, grupoDaConta, nivelDaDiferenca } from "./conciliacao";
import type { ContaBanco } from "./detalhe";

const c = (conta: string | null, valor: number, linha = "x"): ContaBanco => ({
  linha,
  conta,
  nome: "",
  ordem: 1,
  competencia: "2026-01-01",
  valor,
});

describe("grupoDaConta", () => {
  it("o prefixo mais longo ganha: mão de obra da produção é pessoal, matéria-prima é custo", () => {
    expect(grupoDaConta("5.1.05")).toBe("pessoal");
    expect(grupoDaConta("5.1.01")).toBe("custos");
    expect(grupoDaConta("6.1.01")).toBe("pessoal");
    expect(grupoDaConta("4.1.07")).toBe("vendas");
    expect(grupoDaConta("4.1.02")).toBe("impostos");
    expect(grupoDaConta("7.2.03")).toBe("financeiras");
  });
  it("contas só de caixa ficam fora dos grupos; sem conta vira o grupo próprio", () => {
    expect(grupoDaConta("7.2.04")).toBeNull();
    expect(grupoDaConta("9.3.05")).toBeNull();
    expect(grupoDaConta(null)).toBe("sem_conta");
  });
});

describe("nivelDaDiferenca", () => {
  it("abaixo de R$ 5 mil nunca alerta", () => expect(nivelDaDiferenca(1000, 5000)).toBe("ok"));
  it("10% é atenção e 25% é alerta, sobre o maior lado", () => {
    expect(nivelDaDiferenca(100_000, 91_000)).toBe("ok");
    expect(nivelDaDiferenca(100_000, 90_000)).toBe("atencao");
    expect(nivelDaDiferenca(100_000, 75_000)).toBe("alerta");
  });
});

describe("conciliar", () => {
  it("resultado + diferenças + só caixa = variação do caixa", () => {
    const r = conciliar(
      [c("3.1.01", 100_000), c("5.1.01", -40_000), c("6.1.01", -20_000), c(null, -1_000)],
      [c("3.1.01", 70_000), c("5.1.01", -38_000), c("6.1.01", -20_000), c("9.3.01", 50_000), c("7.2.04", -5_000)],
    );
    expect(r.resultado).toBe(39_000);
    expect(r.soCaixa).toBe(45_000);
    expect(r.variacaoCaixa).toBe(57_000);
    const vendas = r.linhas.find((l) => l.id === "vendas")!;
    expect(vendas).toMatchObject({ competencia: 100_000, caixa: 70_000, diferenca: -30_000, nivel: "alerta" });
    expect(r.linhas.find((l) => l.id === "pessoal")!.nivel).toBe("ok");
    const somaDif = r.linhas.reduce((a, l) => a + l.diferenca, 0);
    expect(r.resultado + somaDif + r.soCaixa).toBe(r.variacaoCaixa);
    expect(r.caixaOperacional).toBe(12_000);
  });
});
