import { describe, expect, it } from "vitest";
import { enderecoSefin } from "./enderecoSefin";

describe("enderecoSefin (retransmissor da NFS-e, 066)", () => {
  it("aceita emissão e consultas na Sefin (teste e produção)", () => {
    expect(enderecoSefin("https://sefin.producaorestrita.nfse.gov.br/SefinNacional/nfse")).not.toBeNull();
    expect(enderecoSefin("https://sefin.nfse.gov.br/SefinNacional/dps/DPS" + "1".repeat(42))).not.toBeNull();
    expect(enderecoSefin("https://sefin.nfse.gov.br/SefinNacional/nfse/" + "2".repeat(50))).not.toBeNull();
  });
  it("recusa outro site, http, porta, usuário, parâmetros e outros caminhos", () => {
    for (const u of [
      "https://exemplo.com/SefinNacional/nfse",
      "http://sefin.nfse.gov.br/SefinNacional/nfse",
      "https://sefin.nfse.gov.br:8443/SefinNacional/nfse",
      "https://x@sefin.nfse.gov.br/SefinNacional/nfse",
      "https://sefin.nfse.gov.br/SefinNacional/nfse?x=1",
      "https://sefin.nfse.gov.br/SefinNacional/eventos",
      "https://sefin.nfse.gov.br.evil.com/SefinNacional/nfse",
      "nada",
      null,
    ])
      expect(enderecoSefin(u)).toBeNull();
  });
});
