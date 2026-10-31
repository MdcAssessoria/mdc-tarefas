// Testes de lib/texto.ts e lib/clientes.ts.
import { describe, expect, it } from "vitest";
import { nomeCliente } from "./clientes";
import { semAcento } from "./texto";

describe("semAcento", () => {
  it("tira acentos e mantém o resto", () => {
    expect(semAcento("Patrimônio Líquido (-) Ação")).toBe("Patrimonio Liquido (-) Acao");
    expect(semAcento(null)).toBe("");
    expect(semAcento(123)).toBe("123");
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
