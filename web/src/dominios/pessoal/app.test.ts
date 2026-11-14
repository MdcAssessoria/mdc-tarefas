// Testes das regras do app da família no celular (agrupar contas, resumo do mês, teclado, ícones, textos).
import { describe, expect, it } from "vitest";
import { agruparAbertas, iconeDaCategoria, limitesDoMes, resumoDoMes, teclar, textoVencimento, valorDosDigitos } from "./app";
import type { ContaApp } from "./app";

const HOJE = "2026-11-14";
const conta = (o: Partial<ContaApp>): ContaApp => ({
  id: Math.random().toString(36),
  tipo: "pagar",
  descricao: "Conta",
  vencimento: HOJE,
  valor: 100,
  valor_pago: 0,
  situacao: "aberto",
  quitado_em: null,
  parcela: null,
  parcelas: null,
  categoria: null,
  ...o,
});

describe("agruparAbertas", () => {
  const contas = [
    conta({ descricao: "Aluguel", vencimento: "2026-11-09", valor: 2500 }),
    conta({ descricao: "Condomínio", vencimento: HOJE, valor: 640 }),
    conta({ descricao: "Escola", vencimento: "2026-11-18", valor: 1200 }),
    conta({ descricao: "Luz", vencimento: "2026-11-25", valor: 310 }),
    conta({ descricao: "Paga", vencimento: "2026-11-10", valor: 90, valor_pago: 90, situacao: "quitado" }),
    conta({ descricao: "Cancelada", vencimento: "2026-11-10", situacao: "cancelado" }),
    conta({ descricao: "Salário", tipo: "receber", vencimento: "2026-11-17", valor: 4850 }),
  ];
  it("separa por quando vence, sem pagas, canceladas nem o outro tipo", () => {
    const g = agruparAbertas(contas, "pagar", HOJE);
    expect(g.map((x) => [x.titulo, x.contas.map((c) => c.descricao)])).toEqual([
      ["Atrasadas", ["Aluguel"]],
      ["Hoje", ["Condomínio"]],
      ["Próximos 7 dias", ["Escola"]],
      ["Mais para frente", ["Luz"]],
    ]);
  });
  it("o total do grupo conta só o que falta pagar", () => {
    const g = agruparAbertas([conta({ vencimento: "2026-11-01", valor: 1000, valor_pago: 400, situacao: "parcial" })], "pagar", HOJE);
    expect(g[0].total).toBe(600);
  });
});

describe("resumoDoMes", () => {
  it("sobra = entradas do mês - saídas do mês; percentual pago das contas do mês", () => {
    const r = resumoDoMes(
      [
        conta({ valor: 1000, valor_pago: 1000, situacao: "quitado" }),
        conta({ valor: 1000 }),
        conta({ tipo: "receber", valor: 3000 }),
        conta({ vencimento: "2026-12-05", valor: 999 }),
        conta({ valor: 500, situacao: "cancelado" }),
      ],
      HOJE,
    );
    expect(r).toEqual({ sobra: 1000, totalPagar: 2000, pago: 1000, percentualPago: 50 });
  });
  it("mês sem contas a pagar mostra 0%", () => {
    expect(resumoDoMes([], HOJE).percentualPago).toBe(0);
  });
});

describe("limitesDoMes", () => {
  it("acha o último dia (fevereiro bissexto)", () => {
    expect(limitesDoMes("2028-02-10")).toEqual({ de: "2028-02-01", ate: "2028-02-29" });
  });
});

describe("teclar", () => {
  it("monta centavos, ignora zero à esquerda e apaga", () => {
    let d = "";
    for (const t of ["0", "1", "8", "6", "4", "0"]) d = teclar(d, t);
    expect(d).toBe("18640");
    expect(valorDosDigitos(d)).toBe(186.4);
    expect(teclar(d, "apagar")).toBe("1864");
    expect(teclar("", "00")).toBe("");
    expect(teclar("123456789", "1")).toBe("123456789");
  });
});

describe("iconeDaCategoria", () => {
  it("acha pelo nome do plano padrão da família", () => {
    expect(iconeDaCategoria("Supermercado")).toBe("carrinho");
    expect(iconeDaCategoria("Energia elétrica")).toBe("raio");
    expect(iconeDaCategoria("Escola, faculdade e cursos")).toBe("escola");
    expect(iconeDaCategoria("Salário e pró-labore", "receber")).toBe("carteira");
    expect(iconeDaCategoria("Mercado")).toBe("carrinho");
    expect(iconeDaCategoria("Contas da casa")).toBe("raio");
    expect(iconeDaCategoria("Moradia")).toBe("casa");
    expect(iconeDaCategoria("Cartão e empréstimos")).toBe("banco");
    expect(iconeDaCategoria("Compras pessoais")).toBe("sacola");
    expect(iconeDaCategoria("Renda extra", "receber")).toBe("carteira");
    expect(iconeDaCategoria("Outros gastos")).toBe("etiqueta");
    expect(iconeDaCategoria("Algo novo")).toBe("etiqueta");
    expect(iconeDaCategoria(null, "receber")).toBe("seta-entrada");
  });
});

describe("textoVencimento", () => {
  it("fala como gente", () => {
    expect(textoVencimento({ vencimento: "2026-11-09", tipo: "pagar" }, HOJE)).toBe("Atrasada há 5 dias");
    expect(textoVencimento({ vencimento: "2026-11-13", tipo: "pagar" }, HOJE)).toBe("Venceu ontem");
    expect(textoVencimento({ vencimento: HOJE, tipo: "pagar" }, HOJE)).toBe("Vence hoje");
    expect(textoVencimento({ vencimento: "2026-11-15", tipo: "receber" }, HOJE)).toBe("Entra amanhã");
    expect(textoVencimento({ vencimento: "2026-11-18", tipo: "pagar" }, HOJE)).toBe("Vence em 18/11");
  });
});
