import { describe, expect, it } from "vitest";
import { juntarCertificados } from "./certificados";
import type { CertificadoHub, CertificadoLink } from "./certificados";

const hoje = "2026-11-03";
const hub: CertificadoHub[] = [
  {
    origem: "demonstrativos",
    cliente_id: null,
    titular: "MDC ASSESSORIA LTDA",
    documento: "48.140.121/0001-65",
    emissor: "AC X",
    icp_brasil: true,
    valido_de: null,
    valido_ate: "2026-11-23T02:59:59Z", // 22/11 23:59 em São Paulo
    enviado_em: "2025-11-23T10:00:00Z",
  },
  {
    origem: "notas",
    cliente_id: "c1",
    titular: "GREENCORE INDUSTRIA LTDA",
    documento: "12345678000195",
    emissor: null,
    icp_brasil: true,
    valido_de: null,
    valido_ate: null,
    enviado_em: "2025-11-01T10:00:00Z",
  },
];
const link = (o: Partial<CertificadoLink>): CertificadoLink => ({
  id: "l1",
  titular_documento: "48140121000165",
  titular_razao_social: "MDC ASSESSORIA LTDA",
  tipo: "icp_a1_ecnpj",
  apelido: "Santander",
  emissor_cn: "AC Y",
  valido_ate: "2026-11-01T15:00:00Z",
  status: "ativo",
  ...o,
});

describe("painel de certificados dos dois cofres", () => {
  it("junta HUB e Ledgra Link, ordena pelo vencimento e deixa sem data por último", () => {
    const l = juntarCertificados(hub, [link({})], "America/Sao_Paulo", hoje);
    expect(l.map((x) => x.cofre)).toEqual(["ledgra_link", "hub", "hub"]);
    expect(l[0].dias).toBe(-2);
    expect(l[1].vence_em).toBe("2026-11-22");
    expect(l[1].dias).toBe(19);
    expect(l[2].vence_em).toBe("");
    expect(l[2].dias).toBeNull();
  });

  it("documento só com dígitos e uso em linguagem simples", () => {
    const l = juntarCertificados(hub, [link({})], "America/Sao_Paulo", hoje);
    expect(l.find((x) => x.cofre === "hub" && x.cliente_id === null)?.documento).toBe("48140121000165");
    expect(l[0].uso).toBe("Bancos (e-CNPJ) · Santander");
  });

  it("certificado revogado ou substituído no Ledgra Link não aparece", () => {
    const l = juntarCertificados(
      [],
      [link({ id: "a", status: "revogado" }), link({ id: "b", status: "substituido" }), link({ id: "c" })],
      "America/Sao_Paulo",
      hoje,
    );
    expect(l.map((x) => x.chave)).toEqual(["link-c"]);
  });
});
