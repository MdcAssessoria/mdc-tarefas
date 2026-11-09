// Testes do modelo do termo de autorização do Ledgra Link: dados preenchidos, brancos para preencher à mão e o PDF.
import { describe, expect, it } from "vitest";
import { gerarContratoPdf } from "@/dominios/comercial/contratoPdf";
import { conferirModeloTermo, dataPorExtenso, textoTermo, type DadosTermo } from "./termoLedgraLink";

const base: DadosTermo = {
  empresa: { razao_social: "Exrh Ltda", documento: "33509782000148" },
  representante: { nome: "Fulana de Tal", cpf: "52998224725" },
  escopos: ["cobranca", "pix"],
  contas: [{ codigo_compe: "033", agencia: "1234", conta: "130001234", conta_dv: "5" }],
  data: "2026-11-09",
  vigente_ate: "",
};

describe("termo de autorização do Ledgra Link", () => {
  it("data por extenso e em branco quando não há data", () => {
    expect(dataPorExtenso("2026-11-09")).toBe("9 de novembro de 2026");
    expect(dataPorExtenso("")).toMatch(/^____ de/);
  });

  it("preenche empresa, representante, contas e marca só os itens escolhidos", () => {
    const t = textoTermo(base);
    expect(t).toContain("**EXRH LTDA**, inscrita no CNPJ 33.509.782/0001-48");
    expect(t).toContain("**Fulana de Tal**, CPF 529.982.247-25");
    expect(t).toContain("Banco 033 (Santander) · Agência 1234 · Conta 130001234-5");
    expect(t).toMatch(/\( X \) \*\*Emitir boletos/);
    expect(t).toMatch(/\( X \) \*\*Receber por Pix/);
    expect(t).toMatch(/\( {4}\) \*\*Pagar contas/);
    expect(t).toContain("prazo indeterminado");
    expect(t).toContain("Bragança Paulista, 9 de novembro de 2026.");
  });

  it("sem conta, representante e data sai com linhas em branco; com validade, cita a data", () => {
    const t = textoTermo({ ...base, representante: { nome: "", cpf: "" }, contas: [], data: "", vigente_ate: "2027-12-31" });
    expect(t).toContain("representada por **______________________________**, CPF ______");
    expect(t.match(/- Banco ____/g)).toHaveLength(2);
    expect(t).toContain("até 31 de dezembro de 2027");
    expect(t).toContain("Bragança Paulista, ____ de");
  });

  it("cargo do representante entra no texto", () => {
    const t = textoTermo({ ...base, representante: { ...base.representante, cargo: "sócia administradora" } });
    expect(t).toContain("representada por seu(sua) sócia administradora, **Fulana de Tal**");
  });

  it("só libera o modelo com representante, CPF, item marcado e contas completas", () => {
    expect(conferirModeloTermo(base)).toBeNull();
    expect(conferirModeloTermo({ ...base, representante: { nome: "", cpf: "52998224725" } })).toMatch(/nome/);
    expect(conferirModeloTermo({ ...base, representante: { nome: "Fulana", cpf: "123" } })).toMatch(/CPF/);
    expect(conferirModeloTermo({ ...base, escopos: [] })).toMatch(/Marque/);
    expect(conferirModeloTermo({ ...base, contas: [] })).toMatch(/pelo menos uma conta/);
    const duas = [base.contas[0]!, { codigo_compe: "341", agencia: "12-3", conta: "1", conta_dv: null }];
    expect(conferirModeloTermo({ ...base, contas: duas })).toMatch(/Agência da 2ª conta/);
  });

  it("gera o PDF no papel timbrado com as partes AUTORIZANTE e AUTORIZADA", async () => {
    const bytes = await gerarContratoPdf({
      texto: textoTermo(base),
      numero: "",
      cabecalho: "Termo de autorização · Ledgra Link",
      rotulos: { parte: "AUTORIZANTE", mdc: "AUTORIZADA" },
      contratante: { nome: "EXRH LTDA", documento: "33509782000148", representante: "Fulana de Tal" },
    });
    expect(bytes.byteLength).toBeGreaterThan(2000);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });
});
