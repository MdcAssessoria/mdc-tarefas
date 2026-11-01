// Testes das contas dos relatórios gerenciais do Financeiro.
import { describe, expect, it } from "vitest";
import { fluxoPorMes, linhasDoResultado, mesesEntre, pagosERecebidos, porCentroDeCusto, resultadoDeCaixa } from "./relatorios";
import type { BaixaRel, CategoriaRel, TituloRel } from "./relatorios";

const titulo = (id: string, tipo: "pagar" | "receber", categoria_id: string, extra: Partial<TituloRel> = {}): TituloRel => ({
  id,
  tipo,
  categoria_id,
  centro_id: null,
  pessoa_id: null,
  descricao: id,
  vencimento: "2026-10-10",
  valor: 1000,
  situacao: "aberto",
  ...extra,
});
let seq = 0;
const baixa = (titulo_id: string, data: string, valor: number, extra: Partial<BaixaRel> = {}): BaixaRel => {
  const b = { id: ++seq, titulo_id, conta_id: "itau", data, valor, juros: 0, multa: 0, desconto: 0, estornada: false, ...extra };
  return { ...b, total: b.valor + b.juros + b.multa - b.desconto };
};

const titulos = new Map(
  [
    titulo("aluguel", "pagar", "c-aluguel", { centro_id: "adm" }),
    titulo("luz", "pagar", "c-luz", { centro_id: "loja" }),
    titulo("folha", "pagar", "c-folha"),
    titulo("venda", "receber", "c-venda", { centro_id: "loja", pessoa_id: "abc" }),
  ].map((t) => [t.id, t]),
);
const categorias = new Map<string, CategoriaRel>(
  [
    { id: "c-aluguel", nome: "Aluguel", grupo: "Administrativas", tipo: "despesa" as const },
    { id: "c-luz", nome: "Energia", grupo: "Administrativas", tipo: "despesa" as const },
    { id: "c-folha", nome: "Salários", grupo: "Pessoal", tipo: "despesa" as const },
    { id: "c-venda", nome: "Vendas", grupo: null, tipo: "receita" as const },
  ].map((c) => [c.id, c]),
);
const baixas = [
  baixa("venda", "2026-10-05", 5000, { juros: 50 }),
  baixa("venda", "2026-10-06", 1000, { desconto: 100 }),
  baixa("aluguel", "2026-10-07", 2000, { multa: 40 }),
  baixa("luz", "2026-10-08", 300, { desconto: 10 }),
  baixa("folha", "2026-11-01", 1500),
  baixa("folha", "2026-11-02", 999, { estornada: true }),
  baixa("desconhecido", "2026-11-02", 7),
];

describe("resultadoDeCaixa", () => {
  const r = resultadoDeCaixa(baixas, titulos, categorias);

  it("agrupa receitas e despesas por grupo e categoria, maiores primeiro", () => {
    expect(r.receitas).toEqual([{ grupo: "Sem grupo", valor: 6000, categorias: [{ id: "c-venda", nome: "Vendas", valor: 6000 }] }]);
    expect(r.despesas.map((g) => [g.grupo, g.valor])).toEqual([
      ["Administrativas", 2300],
      ["Pessoal", 1500],
    ]);
    expect(r.despesas[0].categorias.map((c) => c.nome)).toEqual(["Aluguel", "Energia"]);
  });

  it("separa juros, multas e descontos e fecha com o caixa", () => {
    expect([r.jurosRecebidos, r.jurosPagos, r.descontosObtidos, r.descontosConcedidos]).toEqual([50, 40, 10, 100]);
    expect(r.financeiro).toBe(50 - 40 + 10 - 100);
    expect(r.resultado).toBe(6000 - 3800 - 80);
    // o resultado é igual ao que entrou menos o que saiu de verdade
    const entrou = 5050 + 900;
    const saiu = 2040 + 290 + 1500;
    expect(r.resultado).toBe(entrou - saiu);
  });

  it("linhas para a tela: totais, grupos e categorias com sinal; financeiro só com o que tem valor", () => {
    const l = linhasDoResultado(r);
    expect(l[0]).toEqual({ chave: "rec", nome: "Receitas (dinheiro que entrou)", valor: 6000, nivel: 0 });
    const desp = l.find((x) => x.chave === "desp:Administrativas");
    expect(desp).toMatchObject({ valor: -2300, nivel: 1 });
    expect(desp?.parte).toBeCloseTo(2300 / 3800);
    expect(l.filter((x) => x.chave.startsWith("fin:")).map((x) => x.valor)).toEqual([50, -40, 10, -100]);
    expect(l.at(-1)).toMatchObject({ nome: "Sobrou no período", valor: 2120 });
  });
});

describe("fluxoPorMes", () => {
  it("realizado pelas baixas e previsto pelos vencimentos, mês a mês no intervalo", () => {
    const doPeriodo = [
      titulo("p1", "pagar", "x", { vencimento: "2026-10-31", valor: 2500 }),
      titulo("r1", "receber", "x", { vencimento: "2026-11-15", valor: 4000 }),
      titulo("r2", "receber", "x", { vencimento: "2026-11-16", valor: 10, situacao: "cancelado" }),
    ];
    const f = fluxoPorMes(baixas, titulos, doPeriodo, { de: "2026-09-01", ate: "2026-11-30" });
    expect(f.map((m) => m.mes)).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(f[1]).toEqual({ mes: "2026-10", previstoEntrar: 0, entrou: 5950, previstoSair: 2500, saiu: 2330, resultado: 3620 });
    expect(f[2]).toEqual({ mes: "2026-11", previstoEntrar: 4000, entrou: 0, previstoSair: 0, saiu: 1500, resultado: -1500 });
  });

  it("sem datas (Tudo) usa do primeiro ao último mês com movimento; sem nada, lista vazia", () => {
    expect(fluxoPorMes(baixas, titulos, [], {}).map((m) => m.mes)).toEqual(["2026-10", "2026-11"]);
    expect(fluxoPorMes([], new Map(), [], {})).toEqual([]);
  });

  it("mesesEntre vira o ano", () => {
    expect(mesesEntre("2026-11-20", "2027-02-01")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
  });
});

describe("pagosERecebidos", () => {
  it("lista em ordem de data, com o total assinado e sem estornados", () => {
    const l = pagosERecebidos(baixas, titulos);
    expect(l).toHaveLength(5);
    expect(l[0]).toMatchObject({ tipo: "receber", valor: 5000, encargos: 50, total: 5050, pessoaId: "abc" });
    expect(l[2]).toMatchObject({ tipo: "pagar", encargos: 40, total: -2040 });
    expect(l.reduce((a, x) => a + x.total, 0)).toBe(2120);
  });
});

describe("porCentroDeCusto", () => {
  it("receitas, despesas e resultado por centro; sem centro por último", () => {
    const c = porCentroDeCusto(baixas, titulos);
    expect(c.map((x) => [x.id, x.receitas, x.despesas, x.resultado])).toEqual([
      ["adm", 0, 2000, -2000],
      ["loja", 6000, 300, 5700],
      ["", 0, 1500, -1500],
    ]);
    expect(c[0].parteDespesas).toBeCloseTo(2000 / 3800);
  });
});
