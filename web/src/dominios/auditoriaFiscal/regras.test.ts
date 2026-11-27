// Testes das regras puras da tela Auditoria fiscal › Regras de validação.
import { describe, expect, it } from "vitest";
import {
  conferirRegra,
  conferirUtilizacao,
  filtrarRegras,
  filtrarUtilizacoes,
  lerCodigos,
  textoCondicao,
  type Catalogo,
  type RegraPropria,
  type Utilizacao,
} from "./regras";

const cat: Catalogo = {
  colunas: [
    { coluna: "CFOP", nome: "CFOP" },
    { coluna: "VL_ICMS", nome: "Valor do ICMS" },
  ],
  operadores: [
    { operador: "na_lista", nome: "está na lista", sem_valor: false, dica: null },
    { operador: "maior", nome: "é maior que", sem_valor: false, dica: null },
    { operador: "vazio", nome: "está vazio", sem_valor: true, dica: null },
  ],
};
const regra: RegraPropria = {
  id: "1",
  codigo: "P001",
  empresa_id: "e",
  nome: "Uso e consumo com crédito",
  condicoes: [
    { coluna: "CFOP", operador: "na_lista", valor: "1556, 2556" },
    { coluna: "VL_ICMS", operador: "maior", valor: "0" },
  ],
  gravidade: "ALTA",
  ajuste: "Estornar o crédito de ICMS",
  fundamento: "LC 87/96, art. 33, I",
  ativo: true,
};
const util: Utilizacao = {
  id: "u",
  empresa_id: null,
  utilizacao: "Uso e consumo",
  sentido: "E",
  natureza: "fiscal",
  cfops: ["1556", "2556"],
  cst_icms: ["90"],
  credito_icms: false,
  cst_ipi: [],
  cst_pis_real: ["98"],
  cst_pis_presumido: [],
  observacao: null,
  fundamento: null,
  ativo: false,
};

describe("regras de validação da auditoria do SAP", () => {
  it("lê a lista de códigos sem repetir", () => {
    expect(lerCodigos("1556, 2556; 1556\n1407")).toEqual(["1556", "2556", "1407"]);
    expect(lerCodigos("  ")).toEqual([]);
  });

  it("escreve a condição em português", () => {
    expect(textoCondicao(regra.condicoes[0], cat)).toBe("CFOP está na lista 1556, 2556");
    expect(textoCondicao({ coluna: "CFOP", operador: "vazio", valor: "" }, cat)).toBe("CFOP está vazio");
  });

  it("confere a regra como o banco do Ledgra", () => {
    expect(conferirRegra(regra, cat)).toBeNull();
    expect(conferirRegra({ ...regra, nome: "ab" }, cat)).toMatch(/nome/);
    expect(conferirRegra({ ...regra, condicoes: [] }, cat)).toMatch(/1 a 6/);
    expect(conferirRegra({ ...regra, condicoes: [{ coluna: "CFOP", operador: "maior", valor: "" }] }, cat)).toMatch(/valor/);
    expect(conferirRegra({ ...regra, condicoes: [{ coluna: "CFOP", operador: "vazio", valor: "" }] }, cat)).toBeNull();
    expect(conferirRegra({ ...regra, ajuste: "x" }, cat)).toMatch(/ajuste/);
  });

  it("confere CFOP e CST da utilização", () => {
    expect(conferirUtilizacao(util)).toBeNull();
    expect(conferirUtilizacao({ ...util, cfops: ["155"] })).toMatch(/CFOP "155"/);
    expect(conferirUtilizacao({ ...util, cst_icms: ["9"] })).toMatch(/CST do ICMS/);
    expect(conferirUtilizacao({ ...util, utilizacao: " " })).toMatch(/utilização/);
  });

  it("filtra por situação e busca sem acento", () => {
    expect(filtrarRegras([regra], { busca: "credito", situacao: "ativas" }, cat)).toHaveLength(1);
    expect(filtrarRegras([regra], { busca: "2556", situacao: "todas" }, cat)).toHaveLength(1);
    expect(filtrarRegras([regra], { busca: "", situacao: "inativas" }, cat)).toHaveLength(0);
    expect(filtrarUtilizacoes([util], { busca: "", situacao: "inativas" })).toHaveLength(1);
    expect(filtrarUtilizacoes([util], { busca: "consumo", situacao: "ativas" })).toHaveLength(0);
  });
});
