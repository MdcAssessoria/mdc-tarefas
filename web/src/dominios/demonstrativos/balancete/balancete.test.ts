// Testes de caracterização do balancete (pasta balancete/): leitura do Excel do Domínio, classificação, DRE e índices.
import { describe, expect, it } from "vitest";
import { MATRIZ_BALANCETE, MATRIZ_SEM_DC } from "@/dominios/demonstrativos/__testes__/balanceteExemplo";
import { calcularIndices } from "./indices";
import { classificar } from "./classificacao";
import { conferir, fragilidades } from "./fragilidades";
import { lerBalancete, lerValor, sem } from "./leitura";
import { resumir } from "./resumo";

describe("lerValor", () => {
  it("lê os formatos do Domínio (D positivo, C negativo)", () => {
    expect(lerValor("1.234,56D")).toEqual({ valor: 1234.56, natureza: "D" });
    expect(lerValor("1.234,56 C")).toEqual({ valor: -1234.56, natureza: "C" });
    expect(lerValor("(1.234,56)")).toEqual({ valor: -1234.56, natureza: null });
    expect(lerValor("-1234.56")).toEqual({ valor: -1234.56, natureza: null });
    expect(lerValor("R$ 1.000")).toEqual({ valor: 1000, natureza: null });
    expect(lerValor("1,234.56")).toEqual({ valor: 1234.56, natureza: null });
    expect(lerValor("12,5")).toEqual({ valor: 12.5, natureza: null });
    expect(lerValor(42)).toEqual({ valor: 42, natureza: null });
    expect(lerValor("")).toEqual({ valor: 0, natureza: null });
    expect(lerValor(null)).toEqual({ valor: 0, natureza: null });
    expect(lerValor("xyz")).toEqual({ valor: 0, natureza: null });
    // comportamento atual: texto terminado em D/C tem a letra lida como natureza ("abc" → C)
    expect(lerValor("abc")).toEqual({ valor: 0, natureza: "C" });
    // natureza manda no sinal, mesmo com sinal negativo escrito
    expect(lerValor("-500D")).toEqual({ valor: 500, natureza: "D" });
  });
});

describe("sem", () => {
  it("normaliza descrições (sem acento, maiúsculas, (-) vira (MENOS))", () => {
    expect(sem("  Patrimônio  líquido ")).toBe("PATRIMONIO LIQUIDO");
    expect(sem("(-) Simples Nacional")).toBe("(MENOS) SIMPLES NACIONAL");
    expect(sem("Ativo – Circulante")).toBe("ATIVO CIRCULANTE");
  });
});

describe("lerBalancete", () => {
  it("lê cabeçalho, contas e marca analíticas", () => {
    const l = lerBalancete(MATRIZ_BALANCETE);
    expect(l.cabecalho).toEqual({
      empresa: "EMPRESA EXEMPLO COMERCIO LTDA",
      cnpj: "11.222.333/0001-81",
      codigoEmpresa: "123",
      inicio: "2026-09-01",
      fim: "2026-09-30",
    });
    expect(l.avisos).toEqual([]);
    expect(l.linhas).toHaveLength(23);
    const caixa = l.linhas.find((x) => x.classificacao === "1.1.1.01")!;
    expect(caixa).toEqual({
      codigo: "10",
      classificacao: "1.1.1.01",
      descricao: "CAIXA GERAL",
      nivel: 4,
      analitica: true,
      saldo_anterior: 1000,
      debitos: 7200,
      creditos: 4000,
      saldo_atual: 4200,
      grupo: null,
    });
    expect(l.linhas.find((x) => x.classificacao === "1.1")!.analitica).toBe(false);
    expect(l.linhas.find((x) => x.classificacao === "2.1.1.01")!.saldo_atual).toBe(-4000);
    expect(l.linhas.reduce((a, x) => (x.analitica ? a + x.saldo_atual : a), 0)).toBeCloseTo(0);
  });

  it("sem D/C, inverte passivo, PL e receitas e avisa", () => {
    const l = lerBalancete(MATRIZ_SEM_DC);
    expect(l.avisos).toHaveLength(1);
    expect(l.avisos[0]).toMatch(/^Saldos sem D\/C/);
    expect(l.linhas.find((x) => x.classificacao === "2.1.1.01")!.saldo_atual).toBe(-4000);
    expect(l.linhas.find((x) => x.classificacao === "3.1.1.01")!.saldo_atual).toBe(-6000);
    // despesas continuam devedoras
    expect(l.linhas.find((x) => x.classificacao === "4.2.1.01")!.saldo_atual).toBe(1000);
  });

  it("falha com mensagem clara quando não acha os títulos", () => {
    expect(() => lerBalancete([["qualquer"], ["coisa"]])).toThrow(/Não encontrei os títulos das colunas/);
  });
});

function exemploClassificado() {
  return classificar(lerBalancete(MATRIZ_BALANCETE).linhas);
}

describe("classificar", () => {
  it("atribui grupo gerencial pelas descrições da conta e das contas-mãe", () => {
    const grupos = Object.fromEntries(exemploClassificado().map((l) => [l.classificacao, l.grupo]));
    expect(grupos).toMatchInlineSnapshot(`
      {
        "1": "ac_outros",
        "1.1": "ac_outros",
        "1.1.1": "ac_disponivel",
        "1.1.1.01": "ac_disponivel",
        "1.1.2": "ac_clientes",
        "1.1.2.01": "ac_clientes",
        "1.1.3": "ac_estoques",
        "1.1.3.01": "ac_estoques",
        "2": "pc_outros",
        "2.1": "pc_outros",
        "2.1.1": "pc_fornecedores",
        "2.1.1.01": "pc_fornecedores",
        "2.1.2": "pc_obrigacoes",
        "2.1.2.01": "pc_obrigacoes",
        "2.3": "pl",
        "2.3.1.01": "pl",
        "2.3.2.01": "pl",
        "3": "receita_bruta",
        "3.1.1.01": "receita_bruta",
        "3.1.2.01": "deducoes",
        "4": "custos",
        "4.1.1.01": "custos",
        "4.2.1.01": "despesas_operacionais",
      }
    `);
  });
  it("o mapa salvo (prefixo mais longo) tem prioridade", () => {
    const l = classificar(lerBalancete(MATRIZ_BALANCETE).linhas, [
      { classificacao: "4", grupo: "outras_despesas" },
      { classificacao: "4.2", grupo: "despesas_financeiras" },
    ]);
    expect(l.find((x) => x.classificacao === "4.1.1.01")!.grupo).toBe("outras_despesas");
    expect(l.find((x) => x.classificacao === "4.2.1.01")!.grupo).toBe("despesas_financeiras");
  });
});

describe("resumir e calcularIndices", () => {
  it("monta balanço e DRE do mês e do ano", () => {
    expect(resumir(exemploClassificado())).toMatchInlineSnapshot(`
      {
        "ac": 12200,
        "ac_outros": 0,
        "anc": 0,
        "ano": {
          "custos": 2500,
          "deducoes": 300,
          "despesas_financeiras": 0,
          "despesas_operacionais": 1000,
          "despesas_por_conta": [
            {
              "conta": "CUSTO DAS MERCADORIAS VENDIDAS",
              "valor": 2500,
            },
            {
              "conta": "DESPESAS COM ALUGUEL",
              "valor": 1000,
            },
          ],
          "ir_csll": 0,
          "lucro_bruto": 3200,
          "lucro_liquido": 2200,
          "outras": -0,
          "receita_bruta": 6000,
          "receita_liquida": 5700,
          "receitas_financeiras": -0,
          "resultado_antes_ir": 2200,
          "resultado_operacional": 2200,
        },
        "ativo_total": 12200,
        "clientes": 5000,
        "creditos": 22000,
        "debitos": 22000,
        "disponivel": 4200,
        "estoques": 3000,
        "fornecedores": 4000,
        "mes": {
          "custos": 2500,
          "deducoes": 300,
          "despesas_financeiras": 0,
          "despesas_operacionais": 1000,
          "despesas_por_conta": [
            {
              "conta": "CUSTO DAS MERCADORIAS VENDIDAS",
              "valor": 2500,
            },
            {
              "conta": "DESPESAS COM ALUGUEL",
              "valor": 1000,
            },
          ],
          "ir_csll": 0,
          "lucro_bruto": 3200,
          "lucro_liquido": 2200,
          "outras": -0,
          "receita_bruta": 6000,
          "receita_liquida": 5700,
          "receitas_financeiras": -0,
          "resultado_antes_ir": 2200,
          "resultado_operacional": 2200,
        },
        "pc": 4500,
        "pc_emprestimos": -0,
        "pc_obrigacoes": 500,
        "pc_outros": -0,
        "permanente": 0,
        "pl": 5500,
        "pnc": -0,
        "pnc_emprestimos": -0,
        "resultado_exercicio": 2200,
        "rlp": 0,
      }
    `);
  });
  it("calcula os índices sem e com base de prazos", () => {
    const r = resumir(exemploClassificado());
    expect(calcularIndices(r)).toMatchInlineSnapshot(`
      {
        "capital_giro": 7700,
        "carga_tributaria": 0.05,
        "ciclo_financeiro": 25,
        "ciclo_operacional": 25,
        "composicao_endividamento": 1,
        "endividamento_geral": 0.36885245901639346,
        "liquidez_corrente": 2.7111111111111112,
        "liquidez_geral": 2.7111111111111112,
        "liquidez_imediata": 0.9333333333333333,
        "liquidez_seca": 2.0444444444444443,
        "margem_bruta": 0.5614035087719298,
        "margem_liquida": 0.38596491228070173,
        "margem_operacional": 0.38596491228070173,
        "pme": null,
        "pmp": null,
        "pmr": 25,
        "pmv": null,
        "roe": 0.2857142857142857,
      }
    `);
    expect(
      calcularIndices(r, 30, {
        dias: 30,
        clientes_medio: 4000,
        estoques_medio: 4250,
        acabados_medio: null,
        fornecedores_medio: 3850,
        estoque_inicial: 5500,
        estoque_final: 3000,
      }),
    ).toMatchInlineSnapshot(`
      {
        "capital_giro": 7700,
        "carga_tributaria": 0.05,
        "ciclo_financeiro": 71,
        "ciclo_operacional": 71,
        "composicao_endividamento": 1,
        "endividamento_geral": 0.36885245901639346,
        "liquidez_corrente": 2.7111111111111112,
        "liquidez_geral": 2.7111111111111112,
        "liquidez_imediata": 0.9333333333333333,
        "liquidez_seca": 2.0444444444444443,
        "margem_bruta": 0.5614035087719298,
        "margem_liquida": 0.38596491228070173,
        "margem_operacional": 0.38596491228070173,
        "pme": 51,
        "pmp": null,
        "pmr": 20,
        "pmv": 51,
        "roe": 0.2857142857142857,
      }
    `);
  });
  it("conferências e fragilidades do exemplo", () => {
    const linhas = exemploClassificado();
    const r = resumir(linhas);
    const i = calcularIndices(r);
    expect(conferir(r, linhas, "2026-09-01")).toMatchInlineSnapshot(`
      [
        {
          "detalhe": "ok",
          "nome": "Balancete fechado (débitos = créditos)",
          "ok": true,
        },
        {
          "detalhe": "ok",
          "nome": "Ativo = passivo + PL + resultado do ano",
          "ok": true,
        },
        {
          "detalhe": "09/2026",
          "nome": "Competência identificada",
          "ok": true,
        },
        {
          "detalhe": "ok",
          "nome": "Todas as contas com grupo gerencial",
          "ok": true,
        },
      ]
    `);
    expect(fragilidades(r, i, linhas).map((a) => a.texto)).toMatchInlineSnapshot(`[]`);
  });
});
