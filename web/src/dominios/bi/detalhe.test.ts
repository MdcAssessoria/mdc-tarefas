// Testes do detalhe por conta do plano (detalhe.ts).
import { describe, expect, it } from "vitest";
import { contaDoClique, montarContas } from "./detalhe";
import type { ContaBanco } from "./detalhe";

const c = (linha: string, conta: string | null, nome: string, ordem: number, competencia: string, valor: number): ContaBanco => ({
  linha,
  conta,
  nome,
  ordem,
  competencia,
  valor,
});

describe("montarContas", () => {
  it("agrupa por linha, na ordem do plano, com os meses e o total", () => {
    const r = montarContas(
      [
        c("despesas_pessoal", "6.1.03", "Pró-Labore", 310, "2026-02-01", -10),
        c("despesas_pessoal", "6.1.01", "Salários", 290, "2026-01-01", -100),
        c("despesas_pessoal", "6.1.01", "Salários", 290, "2026-02-01", -50.5),
        c("custos", null, "Sem conta do plano", 99999, "2026-01-01", -3),
      ],
      ["2026-01", "2026-02"],
    );
    const p = r.get("despesas_pessoal")!;
    expect(p.map((x) => x.nome)).toEqual(["6.1.01 · Salários", "6.1.03 · Pró-Labore"]);
    expect(p[0]).toMatchObject({ valores: [-100, -50.5], total: -150.5, conta: "6.1.01" });
    expect(r.get("custos")![0]).toMatchObject({ nome: "Sem conta do plano", conta: null, total: -3 });
  });
  it("descarta conta zerada e mês fora do período", () => {
    const r = montarContas([c("custos", "5.1.01", "MP", 1, "2025-12-01", 10)], ["2026-01"]);
    expect(r.size).toBe(0);
  });
});

describe("contaDoClique", () => {
  it("linha inteira, conta do plano ou sem conta", () => {
    expect(contaDoClique(null)).toBeNull();
    const base = { linha: "custos", codigo: "x", nome: "x", subtotal: false, valores: [], total: 0 };
    expect(contaDoClique({ ...base, conta: "5.1.01" })).toBe("5.1.01");
    expect(contaDoClique({ ...base, conta: null })).toBe("-");
  });
});
