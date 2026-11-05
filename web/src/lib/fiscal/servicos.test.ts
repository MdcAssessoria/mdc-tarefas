import { describe, expect, it } from "vitest";
import {
  buscarLc116,
  codigoNacional,
  codigoNacionalValido,
  descricaoLc116,
  formatarCodigoNacional,
  formatarNbs,
  nbsDigitos,
  subitemDoCodigo,
} from "./servicos";

describe("códigos de serviço (LC 116 e NFS-e nacional)", () => {
  it("monta o código nacional a partir do subitem", () => {
    expect(codigoNacional("17.19")).toBe("17.19.01");
    expect(codigoNacional("1.07", "2")).toBe("01.07.02");
  });
  it("formata e desmonta o código nacional", () => {
    expect(formatarCodigoNacional("171901")).toBe("17.19.01");
    expect(formatarCodigoNacional("17.19")).toBeNull();
    expect(subitemDoCodigo("01.07.01")).toBe("1.07");
    expect(subitemDoCodigo("17.19.01")).toBe("17.19");
  });
  it("confere se o subitem existe na LC 116 (17.07 foi vetado)", () => {
    expect(descricaoLc116("17.19")).toMatch(/Contabilidade/);
    expect(codigoNacionalValido("17.19.01")).toBe(true);
    expect(codigoNacionalValido("17.07.01")).toBe(false);
    expect(codigoNacionalValido("99.99.99")).toBe(false);
  });
  it("busca pelo número ou pela descrição, sem acento", () => {
    expect(buscarLc116("17.19")[0][0]).toBe("17.19");
    expect(buscarLc116("1719")[0][0]).toBe("17.19");
    expect(buscarLc116("contabil").map(([c]) => c)).toContain("17.19");
    expect(buscarLc116("analise sistemas")[0][0]).toBe("1.01");
  });
  it("converte o NBS", () => {
    expect(nbsDigitos("1.1302.10.00")).toBe("113021000");
    expect(nbsDigitos("1.1302")).toBeNull();
    expect(formatarNbs("113021000")).toBe("1.1302.10.00");
  });
});
