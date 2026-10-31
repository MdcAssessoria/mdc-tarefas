// Garante que os textos montados a partir de IDENTIDADE_MDC são os mesmos que estavam fixos nos rodapés.
import { describe, expect, it } from "vitest";
import { IDENTIDADE_MDC, LINHA_EMPRESA, linhaResponsavel } from "./identidade";

describe("identidade da MDC", () => {
  it("monta as linhas dos rodapés exatamente como antes", () => {
    expect(LINHA_EMPRESA).toBe("MDC Assessoria Ltda · CNPJ 48.140.121/0001-65 · Bragança Paulista/SP");
    expect(linhaResponsavel()).toBe(
      "Edvaldo Ribeiro de Carvalho · Contador CRC 1SP346098-O/0 · edvaldo@mdcassessoria.com · (11) 98859-8041",
    );
    expect(linhaResponsavel("  ·  ")).toBe(
      "Edvaldo Ribeiro de Carvalho  ·  Contador CRC 1SP346098-O/0  ·  edvaldo@mdcassessoria.com  ·  (11) 98859-8041",
    );
    expect(
      `  ·  CNPJ ${IDENTIDADE_MDC.cnpj}  ·  ${IDENTIDADE_MDC.cidadeUf}  ·  ${IDENTIDADE_MDC.site}  ·  ${IDENTIDADE_MDC.instagram}`,
    ).toBe("  ·  CNPJ 48.140.121/0001-65  ·  Bragança Paulista/SP  ·  mdcassessoria.com  ·  @mdcassessoria_");
  });
});
