// Testes das funções puras de clientes: grupos para filtros e leitura do "Colar lista".
import { describe, expect, it } from "vitest";
import { gruposDosClientes } from "./grupos";
import { lerListaColada } from "./listaColada";

describe("gruposDosClientes", () => {
  it("junta, tira repetidos e ordena", () => {
    expect(gruposDosClientes([{ grupos: ["Piloto HUB", "Greencore"] }, {}, { grupos: ["Greencore", "Atibaia"] }])).toEqual([
      "Atibaia",
      "Greencore",
      "Piloto HUB",
    ]);
  });
});

describe("lerListaColada", () => {
  it("lê ponto e vírgula e tabulação, ignora cabeçalho e linha vazia, reconhece o regime pelo nome", () => {
    const texto = "Razão social;CNPJ;Regime;Fantasia\nEmpresa A Ltda;11.111.111/0001-11;simples;A\n\nEmpresa B\t\tregime inexistente\t";
    expect(lerListaColada(texto, "org1")).toEqual([
      { org_id: "org1", razao_social: "Empresa A Ltda", cnpj: "11.111.111/0001-11", regime: "simples", nome_fantasia: "A" },
      { org_id: "org1", razao_social: "Empresa B", cnpj: null, regime: null, nome_fantasia: null },
    ]);
  });
});
