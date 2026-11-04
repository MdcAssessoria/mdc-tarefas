// Testes da situação da fatura mostrada no Portal do Cliente (050).
import { describe, expect, it } from "vitest";
import { situacaoFaturaPortal } from "./faturas";

const base = { paga: false, vencimento: "2026-11-10", boleto: null };

describe("situacaoFaturaPortal", () => {
  it("paga pelo Financeiro ou pelo boleto", () => {
    expect(situacaoFaturaPortal({ ...base, paga: true }, "2026-12-01")).toBe("paga");
    expect(
      situacaoFaturaPortal({ ...base, boleto: { banco: "itau", linha_digitavel: null, pix_copia_cola: null, vencimento: "2026-11-10", valor: 1, situacao: "paga" } }, "2026-12-01"),
    ).toBe("paga");
  });
  it("vencida, vence hoje e a vencer", () => {
    expect(situacaoFaturaPortal(base, "2026-11-11")).toBe("vencida");
    expect(situacaoFaturaPortal(base, "2026-11-10")).toBe("vence_hoje");
    expect(situacaoFaturaPortal(base, "2026-11-04")).toBe("aberta");
  });
  it("boleto emitido com vencimento novo (fatura já vencida) vale o do boleto", () => {
    const b = { banco: "itau", linha_digitavel: "1", pix_copia_cola: null, vencimento: "2026-11-14", valor: 1, situacao: "registrada" };
    expect(situacaoFaturaPortal({ ...base, boleto: b }, "2026-11-12")).toBe("aberta");
  });
});
