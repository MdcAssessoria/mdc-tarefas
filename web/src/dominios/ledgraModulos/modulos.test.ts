import { describe, expect, it } from "vitest";
import { enderecoValido, MODULOS_LEDGRA } from "./modulos";

describe("Módulos do Ledgra", () => {
  it("tem os quatro módulos", () => {
    expect(MODULOS_LEDGRA.map((m) => m.chave)).toEqual([
      "xml",
      "auditor",
      "legislacao",
      "varredura",
      "raiox",
      "entrega",
      "integracoes",
      "cofre",
    ]);
  });
  it("só abre a página de entrada do Ledgra", () => {
    expect(enderecoValido("https://ledgra.com.br/entrar-hub#access_token=a.b.c")).toBe(true);
    expect(enderecoValido("https://ledgra.com.br/entrar-hub")).toBe(false);
    expect(enderecoValido("https://outro.com/entrar-hub#x")).toBe(false);
    expect(enderecoValido("http://ledgra.com.br/entrar-hub#x")).toBe(false);
    expect(enderecoValido(null)).toBe(false);
  });
});
