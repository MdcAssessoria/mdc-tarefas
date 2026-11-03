import { describe, expect, it } from "vitest";
import { emissaoValida, mensagemBoletoPix } from "./ledgraLink";
import type { SituacaoEmissao } from "./ledgraLink";

describe("mensagem do boleto/Pix para o WhatsApp", () => {
  const base = {
    cliente: "Greencore Indústria",
    escritorio: "MDC Assessoria",
    cobranca: { competencia: "2026-11-01", valor: 350 },
    vencimento: "2026-11-10",
    linha_digitavel: "03399.12345 67890.123456 78901.234567 8 12340000035000",
    pix_copia_cola: "00020126580014br.gov.bcb.pix",
  };

  it("começa com a saudação da hora", () => {
    expect(mensagemBoletoPix({ ...base, hora: 9 }).startsWith("Bom dia!")).toBe(true);
    expect(mensagemBoletoPix({ ...base, hora: 15 }).startsWith("Boa tarde!")).toBe(true);
    expect(mensagemBoletoPix({ ...base, hora: 21 }).startsWith("Boa noite!")).toBe(true);
  });

  it("traz valor, vencimento, Pix e linha digitável", () => {
    const m = mensagemBoletoPix({ ...base, hora: 10 });
    expect(m).toMatch(/R\$\s350,00/);
    expect(m).toContain("10/11/2026");
    expect(m).toContain(base.pix_copia_cola);
    expect(m).toContain(base.linha_digitavel);
  });

  it("só Pix: não mostra linha digitável", () => {
    const m = mensagemBoletoPix({ ...base, hora: 10, linha_digitavel: null });
    expect(m).not.toContain("Linha digitável");
    expect(m).toContain("Pix copia e cola");
  });
});

describe("emissão válida", () => {
  const e = (situacao: SituacaoEmissao) => ({
    lic_cobranca_id: "x",
    tipo: "boleto_hibrido" as const,
    situacao,
    linha_digitavel: null,
    pix_copia_cola: null,
    emitida_em: "",
  });
  it("registrada vale; recusada ou cancelada pede nova emissão", () => {
    expect(emissaoValida(e("registrada"))).toBe(true);
    expect(emissaoValida(e("rejeitada"))).toBe(false);
    expect(emissaoValida(e("cancelada"))).toBe(false);
    expect(emissaoValida(undefined)).toBe(false);
  });
});
