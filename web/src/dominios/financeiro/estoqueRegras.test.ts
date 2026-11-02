import { describe, expect, it } from "vitest";
import {
  combinaBusca,
  custoBase,
  custoMedio,
  custoPorUnidadeEstoque,
  margem,
  markupDe,
  paraUnidadeEstoque,
  precoPorMargem,
  precoPorMarkup,
  situacaoSaldo,
  sugerirCodigo,
} from "./estoqueRegras";
import { lerPlanilhaItens, simNao } from "./planilhaItens";
import { diferencaParcelas, dividirValor, gerarParcelas, margemVenda, ratearCustoCompra, totaisPedido, totalLinha } from "./pedidosRegras";

describe("margem e markup", () => {
  it("margem é sobre o preço; markup é sobre o custo", () => {
    expect(margem(10, 6)).toBe(40);
    expect(markupDe(10, 6)).toBe(66.67);
    expect(margem(0, 6)).toBeNull();
    expect(markupDe(10, 0)).toBeNull();
    expect(margem(5, 6)).toBe(-20); // vendendo abaixo do custo
  });
  it("preço sugerido pelo markup e pela margem desejada", () => {
    expect(precoPorMarkup(6, 66.67)).toBe(10);
    expect(precoPorMarkup(4.25, 100)).toBe(8.5);
    expect(precoPorMargem(6, 40)).toBe(10);
    expect(precoPorMargem(6, 100)).toBeNull();
  });
});

describe("custo médio ponderado (mesma regra do banco)", () => {
  it("pondera pela quantidade", () => {
    expect(custoMedio(10, 5, 10, 8)).toBe(6.5);
    expect(custoMedio(18, 6.5, 24, 4.25)).toBe(5.2143);
  });
  it("com saldo zero ou negativo vale o custo da entrada", () => {
    expect(custoMedio(0, 5, 10, 8)).toBe(8);
    expect(custoMedio(-3, 5, 10, 8)).toBe(8);
    expect(custoMedio(10, null, 10, 8)).toBe(8);
  });
  it("custo de referência: custo médio se houver, senão o preço de custo", () => {
    expect(custoBase({ custo_medio: 6.5, custo: 8 })).toBe(6.5);
    expect(custoBase({ custo_medio: null, custo: 8 })).toBe(8);
    expect(custoBase({ custo_medio: 0, custo: null })).toBeNull();
  });
});

describe("conversão de unidade de compra", () => {
  it("caixa com 12 vira 24 unidades e o custo por unidade", () => {
    expect(paraUnidadeEstoque(2, 12)).toBe(24);
    expect(custoPorUnidadeEstoque(48, 12)).toBe(4);
    expect(paraUnidadeEstoque(1.5, 0)).toBe(1.5); // fator inválido conta como 1
  });
});

describe("situação do saldo", () => {
  it("classifica", () => {
    expect(situacaoSaldo(5, 0, false)).toBe("sem_controle");
    expect(situacaoSaldo(-1, 0, true)).toBe("negativo");
    expect(situacaoSaldo(0, 0, true)).toBe("zerado");
    expect(situacaoSaldo(5, 5, true)).toBe("baixo");
    expect(situacaoSaldo(6, 5, true)).toBe("ok");
  });
});

describe("busca de itens", () => {
  const campos = ["Parafuso sextavado 10mm", "P0001", "7891234567890", "Ciser", "Ferragens"];
  it("todas as palavras, em qualquer ordem, sem acento", () => {
    expect(combinaBusca(campos, "parafuso 10")).toBe(true);
    expect(combinaBusca(campos, "10MM sextavado")).toBe(true);
    expect(combinaBusca(campos, "ferragens ciser")).toBe(true);
    expect(combinaBusca(campos, "789123")).toBe(true);
    expect(combinaBusca(campos, "parafuso 99")).toBe(false);
    expect(combinaBusca(["Água sanitária"], "agua")).toBe(true);
    expect(combinaBusca(campos, "  ")).toBe(true);
  });
});

describe("código sugerido", () => {
  it("continua a numeração com o mesmo número de dígitos", () => {
    expect(sugerirCodigo([])).toBe("P0001");
    expect(sugerirCodigo(["P0001", "P0012", "X9", null])).toBe("P0013");
    expect(sugerirCodigo(["S01"], "S")).toBe("S0002");
    expect(sugerirCodigo(["P123456"])).toBe("P123457");
  });
});

describe("pedidos: totais e parcelas", () => {
  it("total da linha e do pedido", () => {
    expect(totalLinha(3, 9.99, 0.97)).toBe(29);
    expect(totalLinha(0.333, 10)).toBe(3.33);
    const l = [{ total: 47.5 }, { total: 100 }, { total: 2 }];
    expect(totaisPedido(l, 2, 10)).toEqual({ itens: 149.5, total: 157.5 });
  });
  it("divide em parcelas com os centavos na última", () => {
    expect(dividirValor(100, 3)).toEqual([33.33, 33.33, 33.34]);
    const p = gerarParcelas(100, "30_60_90", "2026-01-31");
    expect(p.map((x) => x.vencimento)).toEqual(["2026-03-02", "2026-04-01", "2026-05-01"]);
    expect(diferencaParcelas(100, p)).toBe(0);
  });
  it("mensal começa um mês depois e respeita o fim do mês", () => {
    const p = gerarParcelas(300, "mensal", "2026-01-31", 3);
    expect(p.map((x) => x.vencimento)).toEqual(["2026-02-28", "2026-03-31", "2026-04-30"]);
    expect(p.map((x) => x.valor)).toEqual([100, 100, 100]);
  });
  it("à vista vence na data; total zero não gera parcela", () => {
    expect(gerarParcelas(50, "avista", "2026-11-01")).toEqual([{ numero: 1, vencimento: "2026-11-01", valor: 50 }]);
    expect(gerarParcelas(0, "30", "2026-11-01")).toEqual([]);
  });
  it("rateia frete e desconto no custo da compra (igual ao banco)", () => {
    expect(ratearCustoCompra([{ total: 96, quantidade: 2, fator: 12 }], 6, 12)).toEqual([4.25]);
    expect(
      ratearCustoCompra(
        [
          { total: 75, quantidade: 1, fator: 1 },
          { total: 25, quantidade: 5, fator: 1 },
        ],
        0,
        10,
      ),
    ).toEqual([82.5, 5.5]);
  });
  it("margem bruta da venda", () => {
    expect(margemVenda(200, 120)).toBe(40);
    expect(margemVenda(0, 10)).toBeNull();
  });
});

describe("planilha de itens", () => {
  it("acha o cabeçalho com variações de nome e lê os números brasileiros", () => {
    const r = lerPlanilhaItens([
      ["Cadastro de produtos"],
      [],
      ["Cód.", "Descrição", "Un", "Família", "Preço", "Preço de custo", "Estoque", "EAN", "NCM", "Tipo"],
      ["P1", "Água 500ml", "un", "Bebidas", "3,00", 1.2, "24", 7891234567890, "2201.10.00", "Produto"],
      ["", "", "", "", "", "", "", "", "", ""],
      ["S1", "Instalação", "H", "", "120", "", "", "", "", "Serviço"],
    ]);
    expect(r.colunas).toEqual(expect.arrayContaining(["Código", "Nome", "Unidade", "Grupo", "Preço de venda", "Custo", "Saldo inicial"]));
    expect(r.linhas).toHaveLength(2);
    expect(r.linhas[0]).toMatchObject({
      linha: 4,
      erros: [],
      dados: {
        codigo: "P1",
        nome: "Água 500ml",
        unidade: "UN",
        grupo_nome: "Bebidas",
        preco_venda: 3,
        custo: 1.2,
        saldo_inicial: 24,
        codigo_barras: "7891234567890",
        ncm: "22011000",
        tipo: "produto",
      },
    });
    expect(r.linhas[1].dados).toMatchObject({ tipo: "servico", controla_estoque: false, preco_venda: 120 });
  });
  it("aponta os erros de cada linha em português", () => {
    const r = lerPlanilhaItens([
      ["Nome", "Código", "Preço de venda", "NCM", "Tipo", "Saldo inicial", "Controla estoque"],
      ["Item A", "A1", "abc", "123", "Kit", "", "talvez"],
      ["", "", "", "", "", "", ""],
      ["Item B", "A1", "-5", "", "Serviço", "3", ""],
      ["", "", "10", "", "", "", ""],
    ]);
    expect(r.linhas[0].erros).toEqual([
      'Tipo "Kit" não reconhecido (use Produto ou Serviço)',
      'NCM "123" precisa ter 8 números',
      '"Controla estoque" deve ser Sim ou Não',
      'Preço de venda "abc" não é um número',
    ]);
    expect(r.linhas[1].erros).toEqual([
      "Preço de venda não pode ser negativo",
      "Serviço não tem saldo de estoque",
      "Repetido na planilha (igual à linha 2)",
    ]);
    expect(r.linhas[2].erros).toEqual(["Sem nome e sem código"]);
  });
  it("sem coluna de nome, explica o que falta", () => {
    expect(() =>
      lerPlanilhaItens([
        ["Valor", "Data"],
        [1, 2],
      ]),
    ).toThrow(/coluna "Nome"/);
  });
  it("sim/não", () => {
    expect(simNao("Sim")).toBe(true);
    expect(simNao("não")).toBe(false);
    expect(simNao("")).toBeUndefined();
  });
});
