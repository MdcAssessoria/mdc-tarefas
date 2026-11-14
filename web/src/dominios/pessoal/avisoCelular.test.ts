// Testes das partes puras do aviso no celular (avisoCelular.ts).
import { describe, expect, it } from "vitest";
import { HORARIOS, base64UrlParaBytes, situacaoDoAparelho, textoHora } from "./avisoCelular";

const base = { temPush: true, iphone: false, instalado: false, permissao: "default" as const, inscrito: false };

describe("horários do resumo", () => {
  it("vão das 5h às 22h", () => {
    expect(HORARIOS[0]).toBe(5);
    expect(HORARIOS.at(-1)).toBe(22);
    expect(textoHora(7)).toBe("07h");
  });
});

describe("base64UrlParaBytes", () => {
  it("converte base64 de URL sem preenchimento", () => {
    expect(Array.from(base64UrlParaBytes("AQID_-8"))).toEqual([1, 2, 3, 255, 239]);
  });
});

describe("situacaoDoAparelho", () => {
  it("iPhone fora do app instalado precisa instalar antes", () => {
    expect(situacaoDoAparelho({ ...base, iphone: true })).toBe("precisa-instalar");
    expect(situacaoDoAparelho({ ...base, iphone: true, instalado: true })).toBe("desligado");
  });
  it("sem suporte, bloqueado, ligado e desligado", () => {
    expect(situacaoDoAparelho({ ...base, temPush: false })).toBe("sem-suporte");
    expect(situacaoDoAparelho({ ...base, permissao: "denied" })).toBe("bloqueado");
    expect(situacaoDoAparelho({ ...base, permissao: "granted", inscrito: true })).toBe("ligado");
    expect(situacaoDoAparelho({ ...base, permissao: "granted", inscrito: false })).toBe("desligado");
  });
});
