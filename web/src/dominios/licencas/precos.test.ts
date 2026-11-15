// Testes das regras das tabelas de preço (produtos e pacotes).
import { describe, expect, it } from "vitest";
import { lerPreco, pacotesAlterados, precoComDesconto, precosAlterados, somaDoPacote } from "./precos";
import type { Plano, Produto } from "./tipos";

const prod = (id: string, preco: number): Produto => ({ id, org_id: "o", slug: id, nome: id, descricao: "", preco, ativo: true, ordem: 1, sistema: "ledgra" });
const P = [prod("fin", 100), prod("xml", 50), prod("link", 0)];
const mapa = new Map(P.map((p) => [p.id, p]));
const plano = (id: string, produtos: string[], preco: number): Plano => ({ id, org_id: "o", nome: id, descricao: "", preco, ativo: true, produtos });

describe("precos", () => {
  it("lê o preço digitado em reais", () => {
    expect(lerPreco("1.234,56")).toBe(1234.56);
    expect(lerPreco("")).toBe(0);
    expect(lerPreco("-5")).toBeNull();
    expect(lerPreco("abc")).toBeNull();
  });
  it("só os preços que mudaram", () => {
    expect(precosAlterados(P, { fin: "100,00", xml: "79,90", link: "x" })).toEqual([{ produto: P[1], preco: 79.9 }]);
  });
  it("soma do pacote usa o que acabou de ser digitado", () => {
    expect(somaDoPacote(["fin", "xml"], mapa)).toBe(150);
    expect(somaDoPacote(["fin", "xml"], mapa, { xml: "79,90" })).toBe(179.9);
  });
  it("preço com desconto", () => {
    expect(precoComDesconto(179.9, 10)).toBe(161.91);
    expect(precoComDesconto(100, 0)).toBe(100);
    expect(precoComDesconto(100, 120)).toBe(100);
  });
  it("só os pacotes que mudaram", () => {
    const pls = [plano("a", ["fin"], 90), plano("b", ["fin", "xml"], 120)];
    expect(pacotesAlterados(pls, { a: { produtos: ["fin"], preco: "90" }, b: { produtos: ["xml", "fin", "link"], preco: "120" } })).toEqual([
      { plano: pls[1], produtos: ["xml", "fin", "link"], preco: 120 },
    ]);
  });
});
