// Testes de lib/documento.ts (CPF e CNPJ).
import { describe, expect, it } from "vitest";
import { cnpjValido, cpfValido, documentoValido, formatarDocumento, soDigitos } from "./documento";

describe("documento", () => {
  it("soDigitos aceita qualquer valor", () => {
    expect(soDigitos("11.222.333/0001-81")).toBe("11222333000181");
    expect(soDigitos(12345)).toBe("12345");
    expect(soDigitos(null)).toBe("");
  });
  it("CNPJ: dígitos verificadores, com e sem pontuação", () => {
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("48140121000165")).toBe(true);
    expect(cnpjValido("11222333000182")).toBe(false);
    expect(cnpjValido("11111111111111")).toBe(false);
    expect(cnpjValido("1122233300018")).toBe(false);
  });
  it("CPF: dígitos verificadores", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("52998224726")).toBe(false);
    expect(cpfValido("00000000000")).toBe(false);
  });
  it("documentoValido aceita CPF ou CNPJ", () => {
    expect(documentoValido("529.982.247-25")).toBe(true);
    expect(documentoValido("11.222.333/0001-81")).toBe(true);
    expect(documentoValido("123")).toBe(false);
  });
  it("formata CPF e CNPJ; outro tamanho volta como veio", () => {
    expect(formatarDocumento("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatarDocumento("52998224725")).toBe("529.982.247-25");
    expect(formatarDocumento("123")).toBe("123");
    expect(formatarDocumento(null)).toBe("");
  });
});
