// Testes da leitura da fala do MDC · Pessoal (frase vira lançamento).
import { describe, expect, it } from "vitest";
import { descricaoDaFrase, faltaNoFalado, interpretarFala, lerData, lerValor, quebrarFrases } from "./voz";
import type { CategoriaFala } from "./voz";

const HOJE = "2026-11-14";
const nomes: [string, "receita" | "despesa"][] = [
  ["Salário", "receita"], ["Renda extra", "receita"], ["Aluguel recebido", "receita"], ["Outras entradas", "receita"],
  ["Moradia", "despesa"], ["Contas da casa", "despesa"], ["Mercado", "despesa"], ["Restaurante e delivery", "despesa"],
  ["Transporte", "despesa"], ["Saúde", "despesa"], ["Educação", "despesa"], ["Lazer", "despesa"], ["Compras pessoais", "despesa"],
  ["Cartão e empréstimos", "despesa"], ["Impostos e taxas", "despesa"], ["Outros gastos", "despesa"], ["Pet", "despesa"],
];
const CATS: CategoriaFala[] = nomes.map(([nome, tipo]) => ({ id: nome, nome, tipo }));

describe("lerValor", () => {
  it("números do jeito que o celular escreve", () => {
    expect(lerValor("gastei R$ 80 no mercado")).toBe(80);
    expect(lerValor("paguei 1.250,50 de condomínio")).toBe(1250.5);
    expect(lerValor("recebi 5 mil de salário")).toBe(5000);
    expect(lerValor("recebi 2,5 mil")).toBe(2500);
    expect(lerValor("5 mil e 500 de salário")).toBe(5500);
    expect(lerValor("gastei 45,9 na farmácia")).toBe(45.9);
  });
  it("por extenso", () => {
    expect(lerValor("gastei cinquenta reais na padaria")).toBe(50);
    expect(lerValor("paguei mil e duzentos de aluguel")).toBe(1200);
    expect(lerValor("comprei uma pizza de setenta")).toBe(70);
    expect(lerValor("cento e cinquenta de luz")).toBe(150);
  });
  it("'dia 10' não é valor", () => {
    expect(lerValor("paguei a escola dia 10, 800 reais")).toBe(800);
    expect(lerValor("comprei um tênis")).toBe(0);
  });
});

describe("lerData", () => {
  it("palavras do dia", () => {
    expect(lerData("paguei ontem", HOJE, false)).toBe("2026-11-13");
    expect(lerData("anteontem", HOJE, false)).toBe("2026-11-12");
    expect(lerData("vou pagar amanhã", HOJE, true)).toBe("2026-11-15");
    expect(lerData("sem data", HOJE, false)).toBe(HOJE);
  });
  it("'dia N' no mês certo", () => {
    expect(lerData("paguei dia 10", HOJE, false)).toBe("2026-11-10");
    expect(lerData("paguei dia 20", HOJE, false)).toBe("2026-10-20");
    expect(lerData("vence dia 20", HOJE, true)).toBe("2026-11-20");
    expect(lerData("vence dia 5", HOJE, true)).toBe("2026-12-05");
    expect(lerData("vence dia 31", "2026-02-10", true)).toBe("2026-02-28");
  });
});

describe("quebrarFrases", () => {
  it("um lançamento por verbo", () => {
    expect(quebrarFrases("paguei a luz 230 ontem e recebi o salário de 5 mil")).toEqual(["paguei a luz 230 ontem", "recebi o salário de 5 mil"]);
    expect(quebrarFrases("gastei 50 com pão e leite")).toEqual(["gastei 50 com pão e leite"]);
  });
});

describe("interpretarFala", () => {
  it("gasto simples, já pago hoje", () => {
    expect(interpretarFala("gastei 80 no mercado", CATS, HOJE)).toEqual([
      { tipo: "pagar", valor: 80, categoria: "Mercado", descricao: "Mercado", data: HOJE, pago: true },
    ]);
  });
  it("duas coisas na mesma fala", () => {
    const [a, b] = interpretarFala("paguei a luz 230 ontem e recebi o salário de 5 mil", CATS, HOJE);
    expect(a).toMatchObject({ tipo: "pagar", valor: 230, categoria: "Contas da casa", data: "2026-11-13", pago: true });
    expect(b).toMatchObject({ tipo: "receber", valor: 5000, categoria: "Salário", data: HOJE, pago: true });
  });
  it("conta futura fica em aberto", () => {
    expect(interpretarFala("tenho que pagar a escola dia 20, 900 reais", CATS, HOJE)[0]).toMatchObject({
      tipo: "pagar", valor: 900, categoria: "Educação", data: "2026-11-20", pago: false,
    });
  });
  it("categoria criada pela família pelo nome", () => {
    expect(interpretarFala("gastei 120 com o pet", CATS, HOJE)[0].categoria).toBe("Pet");
  });
  it("aluguel: pago é Moradia, recebido é Aluguel recebido", () => {
    expect(interpretarFala("paguei o aluguel 1.500", CATS, HOJE)[0].categoria).toBe("Moradia");
    expect(interpretarFala("recebi o aluguel 1.500", CATS, HOJE)[0]).toMatchObject({ tipo: "receber", categoria: "Aluguel recebido" });
  });
  it("sem verbo, salário é entrada", () => {
    expect(interpretarFala("salário 4 mil", CATS, HOJE)[0]).toMatchObject({ tipo: "receber", categoria: "Salário", valor: 4000 });
  });
  it("o que não entende fica para escolher", () => {
    const [l] = interpretarFala("gastei 35 com coisas", CATS, HOJE);
    expect(l.categoria).toBeNull();
    expect(faltaNoFalado(l)).toBe("Escolha o tipo de gasto");
    expect(interpretarFala("bom dia", CATS, HOJE)).toEqual([]);
  });
});

describe("descricaoDaFrase", () => {
  it("tira verbo, valor e data", () => {
    expect(descricaoDaFrase("paguei a luz 230 ontem")).toBe("Luz");
    expect(descricaoDaFrase("gastei R$ 45,90 na farmácia")).toBe("Farmácia");
    expect(descricaoDaFrase("recebi o salário de 5 mil")).toBe("Salário");
  });
});
