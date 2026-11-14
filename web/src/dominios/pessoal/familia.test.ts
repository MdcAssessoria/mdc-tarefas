// Testes das regras da tela Família (familia.ts).
import { describe, expect, it } from "vitest";
import { linkConvite, mensagemConvite, permissaoDoMembro, situacaoConvite, whatsappDe } from "./familia";
import type { ConviteFamilia } from "./familia";

const base: ConviteFamilia = {
  id: "c1",
  nome: "Bia",
  permissao: "lancar",
  criado_em: "2026-11-10T10:00:00Z",
  expira_em: "2026-11-17T10:00:00Z",
  usado_em: null,
  cancelado_em: null,
};

describe("permissaoDoMembro", () => {
  it("administrador é o responsável, mesmo sem acesso registrado", () => {
    expect(permissaoDoMembro("admin", null)).toBe("responsavel");
  });
  it("operar ou gerir nas Finanças = pode lançar; ver ou nada = só consulta", () => {
    expect(permissaoDoMembro("analista", "operar")).toBe("lancar");
    expect(permissaoDoMembro("analista", "gerir")).toBe("lancar");
    expect(permissaoDoMembro("analista", "ver")).toBe("consultar");
    expect(permissaoDoMembro("analista", undefined)).toBe("consultar");
  });
});

describe("situacaoConvite", () => {
  it("aguardando antes de vencer e vencido depois", () => {
    expect(situacaoConvite(base, "2026-11-12T00:00:00Z")).toBe("aguardando");
    expect(situacaoConvite(base, "2026-11-17T10:00:00Z")).toBe("vencido");
  });
  it("aceito vale mais que cancelado e vencido", () => {
    expect(situacaoConvite({ ...base, usado_em: "2026-11-11T00:00:00Z", cancelado_em: "x" }, "2027-01-01")).toBe("aceito");
    expect(situacaoConvite({ ...base, cancelado_em: "2026-11-11T00:00:00Z" }, "2026-11-12")).toBe("cancelado");
  });
});

describe("convite", () => {
  it("link leva o código para a entrada do app", () => {
    expect(linkConvite("https://hub.mdcassessoria.com", "/hub-mdc", "AB2C-DE3F")).toBe(
      "https://hub.mdcassessoria.com/hub-mdc/pessoal?convite=AB2C-DE3F",
    );
  });
  it("mensagem cita a família, o link e o código; WhatsApp codifica o texto", () => {
    const m = mensagemConvite("Família Souza", "https://x/pessoal?convite=AB2C-DE3F", "AB2C-DE3F");
    expect(m).toContain("Família Souza");
    expect(m).toContain("https://x/pessoal?convite=AB2C-DE3F");
    expect(m).toContain("7 dias");
    expect(whatsappDe(m).startsWith("https://wa.me/?text=")).toBe(true);
  });
});
