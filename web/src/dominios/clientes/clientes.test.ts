// Testes das funções puras de clientes: nome para mostrar, grupos para filtros e leitura do "Colar lista".
import { describe, expect, it } from "vitest";
import { gruposDosClientes } from "./grupos";
import { lerListaColada } from "./listaColada";
import { nomeCliente } from "./nome";

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

describe("nomeCliente", () => {
  it("usa o nome fantasia quando existe", () => {
    expect(nomeCliente({ nome_fantasia: "Greencore", razao_social: "GREENCORE LTDA" })).toBe("Greencore");
    expect(nomeCliente({ nome_fantasia: "", razao_social: "GREENCORE LTDA" })).toBe("GREENCORE LTDA");
    expect(nomeCliente({ nome_fantasia: null, razao_social: "GREENCORE LTDA" })).toBe("GREENCORE LTDA");
  });
  it("sem cliente devolve o texto informado", () => {
    expect(nomeCliente(undefined)).toBe("");
    expect(nomeCliente(null, "Interna")).toBe("Interna");
  });
});
