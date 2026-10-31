// Testes de caracterização de lib/importacao.ts (planilha de clientes do Domínio → linhas de importação).
import { describe, expect, it } from "vitest";
import {
  detectarCabecalho,
  fichasParaTabela,
  mapearRegime,
  mapearSituacao,
  montarLinhas,
  normalizar,
  soDigitos,
  tratarData,
  tratarDocumento,
} from "./importacao";

describe("normalizar e soDigitos", () => {
  it("normalizar tira acento, pontuação e caixa", () => {
    expect(normalizar("  Razão Social/CNPJ  ")).toBe("razao social cnpj");
    expect(normalizar(null)).toBe("");
    expect(soDigitos("11.222.333/0001-81")).toBe("11222333000181");
  });
});

describe("mapearRegime", () => {
  it("reconhece os regimes pelo texto", () => {
    expect(mapearRegime("Simples Nacional")).toBe("simples");
    expect(mapearRegime("SIMEI")).toBe("mei");
    expect(mapearRegime("Lucro Presumido")).toBe("presumido");
    expect(mapearRegime("Lucro Real")).toBe("real");
    expect(mapearRegime("Imune")).toBe("imune_isenta");
    expect(mapearRegime("Produtor rural")).toBe("pf");
    expect(mapearRegime("Arbitrado")).toBe("outro");
    expect(mapearRegime("xpto")).toBe("outro");
  });
  it("vazio: pessoa física quando o documento tem 11 dígitos", () => {
    expect(mapearRegime("", "12345678901")).toBe("pf");
    expect(mapearRegime("", "11222333000181")).toBeNull();
    expect(mapearRegime("")).toBeNull();
  });
});

describe("mapearSituacao", () => {
  it("ativo, inativo ou desconhecido", () => {
    expect(mapearSituacao("Ativa")).toBe(true);
    expect(mapearSituacao("A")).toBe(true);
    expect(mapearSituacao("Inativa")).toBe(false);
    expect(mapearSituacao("Baixada")).toBe(false);
    expect(mapearSituacao("N")).toBe(false);
    expect(mapearSituacao("")).toBeNull();
    expect(mapearSituacao("talvez")).toBeNull();
  });
});

describe("tratarDocumento", () => {
  it("formata e valida CNPJ e CPF", () => {
    expect(tratarDocumento("11222333000181")).toEqual({ doc: "11.222.333/0001-81", valido: true });
    expect(tratarDocumento("11222333000182")).toEqual({ doc: "11.222.333/0001-82", valido: false, aviso: "CNPJ com dígito inválido" });
    expect(tratarDocumento("529.982.247-25")).toEqual({ doc: "529.982.247-25", valido: true });
    expect(tratarDocumento("")).toEqual({ doc: null, valido: true });
  });
  it("completa zeros à esquerda perdidos pelo Excel", () => {
    // 04.252.011/0001-10 sem o zero inicial
    expect(tratarDocumento("4252011000110")).toEqual({ doc: "04.252.011/0001-10", valido: true });
  });
  it("tamanho inválido", () => {
    expect(tratarDocumento("123456789012345")).toEqual({ doc: "123456789012345", valido: false, aviso: "Documento com tamanho inválido" });
  });
});

describe("tratarData", () => {
  it("aceita DD/MM/AAAA, DD/MM/AA, ISO e número de série do Excel", () => {
    expect(tratarData("05/03/2026")).toBe("2026-03-05");
    expect(tratarData("5.3.26")).toBe("2026-03-05");
    expect(tratarData("2026-03-05T00:00:00")).toBe("2026-03-05");
    expect(tratarData("46086")).toBe("2026-03-05");
    expect(tratarData("")).toBeNull();
    expect(tratarData("ontem")).toBeNull();
  });
});

const PLANILHA: string[][] = [
  ["Relação de empresas", "", "", "", "", ""],
  ["Código", "Razão social", "Apelido", "CNPJ", "Regime", "Situação", "Data da situação"],
  ["101", "EMPRESA EXEMPLO COMERCIO LTDA", "Exemplo", "11222333000181", "Simples Nacional", "Ativa", ""],
  ["102.0", "EXEMPLO SERVICOS", "", "11222333000182", "Arbitrado", "Inativa", "30/09/2026"],
  ["103", "OUTRA SEM DATA", "", "", "", "Baixada", ""],
  ["", "", "", "", "", "", ""],
  ["Código", "Razão social", "Apelido", "CNPJ", "Regime", "Situação", "Data da situação"],
  ["9999", "EMPRESA PADRAO", "", "", "", "Ativa", ""],
  ["", "Total de empresas: 3", "", "", "", "", ""],
];

describe("detectarCabecalho e montarLinhas", () => {
  it("acha o cabeçalho depois do título e mapeia as colunas", () => {
    expect(detectarCabecalho(PLANILHA)).toEqual({
      linha: 1,
      mapa: { codigo_dominio: 0, razao_social: 1, nome_fantasia: 2, cnpj: 3, regime: 4, situacao: 5, inativo_em: 6 },
    });
  });
  it("monta as linhas, pulando cabeçalho repetido, empresa-modelo e totais", () => {
    const { linha, mapa } = detectarCabecalho(PLANILHA);
    expect(montarLinhas(PLANILHA, linha, mapa)).toMatchInlineSnapshot(`
      [
        {
          "ativo": true,
          "avisos": [],
          "cidade": null,
          "cliente_desde": null,
          "cnpj": "11.222.333/0001-81",
          "codigo_dominio": "101",
          "erro": undefined,
          "inativo_em": null,
          "inicio_em": null,
          "motivo_inativacao": null,
          "n": 3,
          "nome_fantasia": "Exemplo",
          "razao_social": "EMPRESA EXEMPLO COMERCIO LTDA",
          "regime": "simples",
          "regime_original": "Simples Nacional",
          "uf": null,
        },
        {
          "ativo": false,
          "avisos": [
            "CNPJ com dígito inválido",
            "Regime "Arbitrado" entra como Outro",
          ],
          "cidade": null,
          "cliente_desde": null,
          "cnpj": "11.222.333/0001-82",
          "codigo_dominio": "102",
          "erro": undefined,
          "inativo_em": "2026-09-30",
          "inicio_em": null,
          "motivo_inativacao": null,
          "n": 4,
          "nome_fantasia": null,
          "razao_social": "EXEMPLO SERVICOS",
          "regime": "outro",
          "regime_original": "Arbitrado",
          "uf": null,
        },
        {
          "ativo": false,
          "avisos": [
            "Inativa sem data: será usada a data de hoje",
          ],
          "cidade": null,
          "cliente_desde": null,
          "cnpj": null,
          "codigo_dominio": "103",
          "erro": undefined,
          "inativo_em": null,
          "inicio_em": null,
          "motivo_inativacao": null,
          "n": 5,
          "nome_fantasia": null,
          "razao_social": "OUTRA SEM DATA",
          "regime": null,
          "regime_original": "",
          "uf": null,
        },
      ]
    `);
  });
});

describe("fichasParaTabela", () => {
  it("devolve null quando não é relatório em fichas", () => {
    expect(fichasParaTabela(PLANILHA)).toBeNull();
  });
  it("converte fichas (rótulo: valor) em tabela", () => {
    const fichas = [
      ["Código:", "101", "Nome:", "EMPRESA A"],
      ["CNPJ:", "11.222.333/0001-81"],
      ["Código:", "102", "Nome:", "EMPRESA B"],
      ["CNPJ:", ""],
    ];
    expect(fichasParaTabela(fichas)).toEqual([
      ["Código", "Nome", "CNPJ"],
      ["101", "EMPRESA A", "11.222.333/0001-81"],
      ["102", "EMPRESA B", ""],
    ]);
  });
});
