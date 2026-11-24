import { describe, expect, it } from "vitest";
import { acharLinha, lerData, lerPlanilhaComplementares, lerPlanilhaOrcamento, lerValor, mesesDoAno, somarOrcamento } from "./lancamentos";
import type { LinhaRelatorio } from "./lancamentos";
import { cicloFinanceiro, cobertura, fmtDoc, inadimplencia, nomeItem } from "./indicadores";
import type { Indicadores } from "./indicadores";

const LINHAS: LinhaRelatorio[] = [
  { relatorio: "dre", codigo: "despesas_pessoal", nome: "(−) Despesas com pessoal", natureza: "P" },
  { relatorio: "dre", codigo: "receita_bruta", nome: "Receita bruta de vendas e serviços", natureza: "R" },
  { relatorio: "dfc", codigo: "pag_pessoal", nome: "(−) Pagamentos de pessoal", natureza: "P" },
];

describe("leitura de células", () => {
  it("datas em vários formatos", () => {
    expect(lerData("15/03/2026")).toBe("2026-03-15");
    expect(lerData("3/2026")).toBe("2026-03-01");
    expect(lerData("2026-03")).toBe("2026-03-01");
    expect(lerData(46096)).toBe("2026-03-15");
    expect(lerData("")).toBeNull();
  });
  it("valores no formato brasileiro", () => {
    expect(lerValor("1.234,56")).toBe(1234.56);
    expect(lerValor("R$ 10,00")).toBe(10);
    expect(lerValor(7.5)).toBe(7.5);
    expect(lerValor("")).toBeNull();
    expect(Number.isNaN(lerValor("abc"))).toBe(true);
  });
  it("acha a linha pelo código ou pelo nome, sem acento e sem sinal", () => {
    expect(acharLinha("despesas_pessoal", LINHAS, "dre")).toBe("despesas_pessoal");
    expect(acharLinha("Despesas com pessoal", LINHAS, "dre")).toBe("despesas_pessoal");
    expect(acharLinha("(−) Pagamentos de pessoal", LINHAS, "dfc")).toBe("pag_pessoal");
    expect(acharLinha("Despesas com pessoal", LINHAS, "dfc")).toBeNull();
  });
});

describe("planilha de lançamentos complementares", () => {
  const cab = ["CNPJ", "Competência", "Data do caixa", "Linha DRE", "Linha DFC", "Histórico", "Valor"];
  it("converte e acusa erros por linha", () => {
    const r = lerPlanilhaComplementares(
      [
        cab,
        ["14.012.035/0001-55", "01/2026", "10/01/2026", "Despesas com pessoal", "Pagamentos de pessoal", "Folha jan", "1.000,00"],
        ["14.012.035/0001-55", "01/2026", "", "", "Pagamentos de pessoal", "sem data", "10"],
        [],
        ["123", "01/2026", "", "Despesas com pessoal", "", "x", "1"],
      ],
      LINHAS,
    );
    expect(r.linhas).toEqual([
      {
        cnpj: "14012035000155",
        competencia: "2026-01-01",
        data_caixa: "2026-01-10",
        linha_dre: "despesas_pessoal",
        linha_dfc: "pag_pessoal",
        historico: "Folha jan",
        valor: 1000,
      },
    ]);
    expect(r.erros).toEqual(["Linha 3: lançamento no DFC precisa da data do caixa", "Linha 5: CNPJ inválido"]);
  });
  it("cabeçalho errado avisa para usar o modelo", () => {
    expect(lerPlanilhaComplementares([["A", "B"]], LINHAS).erros[0]).toMatch(/Faltam colunas/);
  });
});

describe("planilha de orçamento", () => {
  it("converte, guarda o valor positivo e apaga com valor em branco", () => {
    const r = lerPlanilhaOrcamento(
      [
        ["CNPJ", "Relatório", "Linha", "Mês", "Valor"],
        ["14012035000155", "DRE", "Despesas com pessoal", "02/2026", "-500"],
        ["14012035000155", "dre", "receita_bruta", "15/02/2026", ""],
        ["14012035000155", "DFX", "x", "02/2026", "1"],
      ],
      LINHAS,
    );
    expect(r.linhas).toEqual([
      { cnpj: "14012035000155", relatorio: "dre", linha: "despesas_pessoal", competencia: "2026-02-01", valor: 500 },
      { cnpj: "14012035000155", relatorio: "dre", linha: "receita_bruta", competencia: "2026-02-01", valor: null },
    ]);
    expect(r.erros).toEqual(["Linha 4: relatório deve ser DRE ou DFC"]);
    expect(mesesDoAno(2026)[11]).toBe("2026-12-01");
  });
});

describe("indicadores", () => {
  const ind: Indicadores = {
    corte: "2026-11-20",
    pmr: 30,
    pmp: 21.5,
    receber: { aberto: 1000, vencido: 250 },
    pagar: { aberto: 2000 },
    clientes_total: 0,
    clientes: [],
    fornecedores_total: 0,
    fornecedores: [],
    liquidez: [],
  };
  it("inadimplência, cobertura e ciclo", () => {
    expect(inadimplencia(ind)).toBe(0.25);
    expect(cobertura(ind)).toBe(0.5);
    expect(cicloFinanceiro(ind)).toBe(8.5);
    expect(inadimplencia({ ...ind, receber: {} })).toBeNull();
    expect(cicloFinanceiro({ ...ind, pmp: null })).toBeNull();
  });
  it("documento e nome", () => {
    expect(fmtDoc("14012035000155")).toEqual({ texto: "14.012.035/0001-55", pf: false });
    expect(fmtDoc("28086343820")).toEqual({ texto: "280.863.438-20", pf: true });
    expect(nomeItem({ doc: "28086343820", nome: null, valor: 1 })).toBe("280.863.438-20 (pessoa física)");
    expect(nomeItem({ doc: "1", nome: " ACME ", valor: 1 })).toBe("ACME");
  });
});

describe("modelo baixado do HUB", () => {
  it("acha o cabeçalho depois do título e do subtítulo", () => {
    const m = [
      ["MDC Assessoria · Orçamento"],
      ["Ano 2027"],
      [],
      ["CNPJ", "Relatório", "Linha", "Mês", "Valor"],
      ["11.222.333/0001-81", "DRE", "receita_bruta", "01/2027", "1.000,00"],
    ];
    const r = lerPlanilhaOrcamento(m, [{ relatorio: "dre", codigo: "receita_bruta", nome: "Receita bruta", natureza: "R" }]);
    expect(r.erros).toEqual([]);
    expect(r.linhas[0]).toMatchObject({ linha: "receita_bruta", competencia: "2027-01-01", valor: 1000 });
  });
});


describe("somarOrcamento", () => {
  it("soma as empresas por linha e mês, no centavo", () => {
    const m = somarOrcamento([
      { linha: "receita_bruta", competencia: "2027-01-01", valor: "220581.90" },
      { linha: "receita_bruta", competencia: "2027-01-01", valor: 300582.7 },
      { linha: "receita_bruta", competencia: "2027-01-01", valor: "28835.40" },
      { linha: "custos", competencia: "2027-02-01", valor: 0.1 },
      { linha: "custos", competencia: "2027-02-01", valor: 0.2 },
    ]);
    expect(m.get("receita_bruta|2027-01-01")).toBe(550000);
    expect(m.get("custos|2027-02-01")).toBe(0.3);
    expect(m.has("custos|2027-01-01")).toBe(false);
  });
});
