import { describe, expect, it } from "vitest";
import { diasDesde, linkWhatsapp, mesmosValores, nomeRegime, numero, retornoAtrasado, rotuloDias } from "./rotulos";

describe("rótulos do CRM", () => {
  it("monta o link do WhatsApp com DDI 55 só quando falta", () => {
    expect(linkWhatsapp("(11) 99999-0000")).toBe("https://wa.me/5511999990000");
    expect(linkWhatsapp("5511999990000")).toBe("https://wa.me/5511999990000");
    expect(linkWhatsapp("")).toBeNull();
    expect(linkWhatsapp(null)).toBeNull();
    expect(linkWhatsapp("123")).toBeNull();
  });

  it("retorno atrasado só para oportunidade em aberto com data antes de hoje", () => {
    expect(retornoAtrasado({ etapa: "contato", proximo_contato: "2026-11-01" }, "2026-11-02")).toBe(true);
    expect(retornoAtrasado({ etapa: "contato", proximo_contato: "2026-11-02" }, "2026-11-02")).toBe(false);
    expect(retornoAtrasado({ etapa: "ganho", proximo_contato: "2026-10-01" }, "2026-11-02")).toBe(false);
    expect(retornoAtrasado({ etapa: "novo", proximo_contato: null }, "2026-11-02")).toBe(false);
  });

  it("conta dias e escreve o rótulo", () => {
    const agora = Date.parse("2026-11-10T12:00:00Z");
    expect(diasDesde("2026-11-10T08:00:00Z", agora)).toBe(0);
    expect(diasDesde("2026-11-01T12:00:00Z", agora)).toBe(9);
    expect(diasDesde("2026-12-01T12:00:00Z", agora)).toBe(0);
    expect(rotuloDias(0)).toBe("hoje");
    expect(rotuloDias(1)).toBe("1 dia");
    expect(rotuloDias(9)).toBe("9 dias");
  });

  it("lê regime e número vindos do Simulador", () => {
    expect(nomeRegime("SIMPLES")).toBe("Simples");
    expect(nomeRegime(undefined)).toBe("—");
    expect(nomeRegime("outro")).toBe("outro");
    expect(numero("1500")).toBe(1500);
    expect(numero(" ")).toBeNull();
    expect(numero("abc")).toBeNull();
    expect(numero(12.5)).toBe(12.5);
  });

  it("compara valores do contrato sem depender da ordem das chaves", () => {
    expect(mesmosValores({ a: 1, b: [1, 2], c: { x: null } }, { c: { x: null }, b: [1, 2], a: 1 })).toBe(true);
    expect(mesmosValores({ a: 1, b: [1, 2] }, { a: 1, b: [2, 1] })).toBe(false);
    expect(mesmosValores({ a: 1 }, { a: 2 })).toBe(false);
  });
});
