// Testes das regras da tela de classificação (classificacao.ts).
import { describe, expect, it } from "vitest";
import { filtrar, gruposDoPlano, mesmaCategoriaEmOutras, pendente, resumir, situacao } from "./classificacao";
import type { CategoriaClassificacao } from "./dados";

const c = (p: Partial<CategoriaClassificacao>): CategoriaClassificacao => ({
  cliente_id: "a",
  empresa: "A",
  categoria_codigo: "2.01.01",
  descricao: "Algo",
  conta: "6.2.08",
  conta_nome: "Outras",
  origem: "codigo",
  excecao_id: null,
  a_conferir: false,
  observacao: null,
  alterado_em: null,
  valor: -100,
  lancamentos: 1,
  ...p,
});

const lista = [
  c({ categoria_codigo: "1", conta: null, conta_nome: null, origem: "sem", valor: -500 }),
  c({ categoria_codigo: "2", conta: "9.9.02", valor: 200 }),
  c({ categoria_codigo: "3", origem: "excecao", a_conferir: true, excecao_id: "x" }),
  c({ categoria_codigo: "4", descricao: "6.1.01 - Salários", conta: "6.1.01" }),
];

describe("classificação", () => {
  it("pendentes = sem conta, contas a classificar e a conferir", () => {
    expect(lista.filter(pendente).map((x) => x.categoria_codigo)).toEqual(["1", "2", "3"]);
    expect(filtrar(lista, "pendentes", "").length).toBe(3);
    expect(filtrar(lista, "codigo", "").map((x) => x.categoria_codigo)).toEqual(["2", "4"]);
    expect(filtrar(lista, "todas", "salár").map((x) => x.categoria_codigo)).toEqual(["4"]);
  });
  it("resumo soma o valor do que está sem conta", () => {
    expect(resumir(lista)).toEqual({ semConta: 2, valorSemConta: -300, aConferir: 1, total: 4 });
  });
  it("situação: a conferir antes da origem", () => {
    expect(situacao(lista[2]).nome).toBe("A conferir");
    expect(situacao(lista[0]).nome).toBe("Sem conta");
    expect(situacao(lista[1]).nome).toBe("Contas a classificar");
  });
  it("agrupa o plano por tipo e acha a mesma categoria nas outras empresas", () => {
    const g = gruposDoPlano([
      { codigo: "3.1.01", nome: "Venda", tipo: "RB", ordem: 1, linha_dre: null, linha_dfc: null, linha_dfc_entrada: null },
      { codigo: "6.1.01", nome: "Salários", tipo: "PES", ordem: 2, linha_dre: null, linha_dfc: null, linha_dfc_entrada: null },
      { codigo: "3.3.01", nome: "Outras", tipo: "RB", ordem: 3, linha_dre: null, linha_dfc: null, linha_dfc_entrada: null },
    ]);
    expect(g.map((x) => [x.nome, x.contas.length])).toEqual([
      ["Receitas", 2],
      ["Pessoal", 1],
    ]);
    const outra = c({ cliente_id: "b", empresa: "B", categoria_codigo: "1", descricao: " algo " });
    expect(mesmaCategoriaEmOutras([...lista, outra], lista[0])).toEqual([outra]);
  });
});
