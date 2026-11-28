import { describe, expect, it } from "vitest";
import { lerRespostaAcesso, mostraAcessoDireto, problemaResponsavel, textoLicencaLedgra } from "./acessoLedgra";

describe("acesso direto aos módulos do Ledgra", () => {
  it("só em licença ativa do Ledgra que não seja full", () => {
    expect(mostraAcessoDireto({ sistema: "ledgra", situacao: "ativo", modalidade: "pacote" })).toBe(true);
    expect(mostraAcessoDireto({ sistema: "ledgra", situacao: "ativo", modalidade: "gratuita" })).toBe(true);
    expect(mostraAcessoDireto({ sistema: "ledgra", situacao: "ativo", modalidade: "full" })).toBe(false);
    expect(mostraAcessoDireto({ sistema: "exato", situacao: "ativo", modalidade: "pacote" })).toBe(false);
    expect(mostraAcessoDireto({ sistema: "ledgra", situacao: "encerrado", modalidade: "pacote" })).toBe(false);
  });

  it("confere nome e e-mail do responsável", () => {
    expect(problemaResponsavel("Maria", "maria@cliente.com.br")).toBeNull();
    expect(problemaResponsavel(" ", "maria@cliente.com.br")).toMatch(/nome/);
    expect(problemaResponsavel("Maria", "maria@")).toMatch(/e-mail/);
  });

  it("lê a resposta: senha só quando veio, entrada só do ledgra.com.br", () => {
    const r = lerRespostaAcesso({
      email: "maria@cliente.com.br",
      usuario_novo: true,
      senha_provisoria: "Ab12-Cd34",
      entrada: "https://www.ledgra.com.br/modulos",
      licenca: "ativa",
    });
    expect(r).toEqual({
      email: "maria@cliente.com.br",
      usuarioNovo: true,
      senha: "Ab12-Cd34",
      entrada: "https://www.ledgra.com.br/modulos",
      licenca: "ativa",
    });
    const s = lerRespostaAcesso({ usuario_novo: false, entrada: "https://golpe.com/ledgra.com.br" });
    expect(s.senha).toBeNull();
    expect(s.entrada).toBe("https://ledgra.com.br/modulos");
    expect(s.licenca).toBe("verificando");
  });

  it("explica a situação da licença em português", () => {
    expect(textoLicencaLedgra("ativa")).toMatch(/liberados/);
    expect(textoLicencaLedgra("verificando")).toMatch(/próxima rotina/);
  });
});
