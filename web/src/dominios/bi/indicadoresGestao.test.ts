// Testes dos indicadores principais da gestão (indicadoresGestao.ts).
import { describe, expect, it } from "vitest";
import { fmtIndicador, indicadoresGestao, nivel } from "./indicadoresGestao";
import { montarMatriz } from "./relatorio";
import type { LinhaBanco } from "./relatorio";

const l = (codigo: string, valor: number): LinhaBanco => ({
  codigo,
  nome: codigo,
  ordem: 1,
  subtotal: false,
  natureza: null,
  competencia: "2026-01-01",
  valor,
});

const dre = montarMatriz([
  l("receita_liquida", 1200),
  l("custos", -480),
  l("despesas_comerciais", -60),
  l("despesas_pessoal", -300),
  l("despesas_administrativas", -120),
  l("resultado_operacional", 240),
  l("despesas_financeiras", -60),
]);
const dfc = montarMatriz([
  l("fluxo_operacional", 180),
  l("pag_fornecedores", -400),
  l("pag_pessoal", -300),
  l("pag_impostos", -50),
  l("pag_despesas", -150),
]);

describe("indicadoresGestao", () => {
  const r = Object.fromEntries(indicadoresGestao(dre, dfc, 450, 3).map((i) => [i.id, i]));
  it("margem EBITDA e cobertura de juros", () => {
    expect(r.ebitda.valor).toBe(0.2);
    expect(r.ebitda.nivel).toBe("boa");
    expect(r.cobertura_juros.valor).toBe(4);
  });
  it("ponto de equilíbrio: fixos 420/3 = 140 por mês ÷ MC 55% = 254,5; receita 400/mês → folga 57%", () => {
    expect(r.folga_equilibrio.valor).toBeCloseTo(400 / (140 / 0.55) - 1, 6);
    expect(r.folga_equilibrio.nivel).toBe("boa");
  });
  it("fôlego: 450 ÷ (900/3 = 300 por mês) = 1,5 mês; conversão 180/240 = 75%", () => {
    expect(r.folego_caixa.valor).toBe(1.5);
    expect(r.folego_caixa.nivel).toBe("media");
    expect(fmtIndicador(r.folego_caixa)).toBe("1,5 mês");
    expect(r.conversao_caixa.valor).toBe(0.75);
  });
  it("sem saldos ou sem juros fica sem valor", () => {
    const s = Object.fromEntries(indicadoresGestao(dre, dfc, null, 3).map((i) => [i.id, i]));
    expect(s.folego_caixa.valor).toBeNull();
    expect(s.folego_caixa.nivel).toBeNull();
    expect(fmtIndicador(s.folego_caixa)).toBe("–");
  });
  it("nível pelas faixas", () => {
    expect(nivel(-0.1, 0, 0.2)).toBe("baixa");
    expect(nivel(0.2, 0, 0.2)).toBe("media");
  });
});
