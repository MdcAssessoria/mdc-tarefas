// Testes das regras da tela Contratos › Ledgra Link: passos de cada empresa e conferência dos campos antes de enviar.
import { describe, expect, it } from "vitest";
import {
  conferirCertificado,
  conferirConta,
  conferirCredencial,
  conferirTermo,
  conferirTitular,
  passosEmpresa,
  proximoPasso,
  tipoCertificadoSugerido,
  type CertificadoLink,
  type NovaConta,
  type NovoTermo,
  type TitularLink,
} from "./ledgraLinkCadastro";

const arquivo = (nome: string) => new File(["x"], nome);
const HOJE = "2026-11-09";

const titular = (p: Partial<TitularLink> = {}): TitularLink => ({
  id: "t1",
  documento: "48140121000165",
  razao_social: "MDC ASSESSORIA LTDA",
  autoriza_cobranca: false,
  autoriza_extrato: false,
  contas: [],
  ...p,
});
const cert = (p: Partial<CertificadoLink> = {}): CertificadoLink => ({
  id: "c1",
  titular_id: "t1",
  tipo: "icp_a1_ecnpj",
  apelido: "e-CNPJ",
  valido_ate: "2027-05-01",
  dias_para_vencer: 170,
  situacao: "ok",
  status: "ativo",
  ...p,
});
const conta = {
  id: "k1", codigo_compe: "033", banco: "Santander", agencia: "1234", conta: "130001234", conta_dv: "5",
  apelido: "Santander MDC", ambiente: "producao" as const, status: "ativa", produtos_ativos: null,
};

describe("passosEmpresa", () => {
  it("empresa recém-cadastrada: o primeiro passo que falta é o termo", () => {
    const p = passosEmpresa(titular(), []);
    expect(p.map((x) => x.feito)).toEqual([false, false, false, false]);
    expect(proximoPasso(p)?.id).toBe("termo");
  });

  it("certificado de outra empresa, vencido ou revogado não conta", () => {
    const certs = [cert({ titular_id: "outra" }), cert({ situacao: "vencido" }), cert({ status: "revogado" })];
    expect(passosEmpresa(titular(), certs)[1]!.feito).toBe(false);
    expect(passosEmpresa(titular(), [cert()])[1]!.feito).toBe(true);
  });

  it("conta sem credencial pede a credencial; com produto ativo a empresa fica pronta", () => {
    const base = titular({ autoriza_cobranca: true, contas: [conta] });
    expect(proximoPasso(passosEmpresa(base, [cert()]))?.id).toBe("credencial");
    const pronta = titular({ autoriza_cobranca: true, contas: [{ ...conta, produtos_ativos: ["cobranca"] }] });
    expect(proximoPasso(passosEmpresa(pronta, [cert()]))).toBeNull();
  });
});

describe("conferências", () => {
  it("titular: CNPJ ou CPF válido, razão social e e-mail opcional", () => {
    expect(conferirTitular({ documento: "48.140.121/0001-65", razao_social: "MDC", email_contato: "" })).toBeNull();
    expect(conferirTitular({ documento: "11111111111111", razao_social: "MDC", email_contato: "" })).toMatch(/inválido/);
    expect(conferirTitular({ documento: "48140121000165", razao_social: " ", email_contato: "" })).toMatch(/razão social/);
    expect(conferirTitular({ documento: "48140121000165", razao_social: "MDC", email_contato: "sem-arroba" })).toMatch(/E-mail/);
  });

  const termo: NovoTermo = {
    escopos: ["cobranca"], assinado_por_nome: "Edvaldo Ribeiro", assinado_por_cpf: "529.982.247-25",
    assinado_em: "2026-11-05", vigente_ate: "", arquivo: arquivo("termo.pdf"),
  };
  it("termo: PDF, escopo, CPF de quem assinou e datas coerentes", () => {
    expect(conferirTermo(termo, HOJE)).toBeNull();
    expect(conferirTermo({ ...termo, arquivo: null }, HOJE)).toMatch(/PDF/);
    expect(conferirTermo({ ...termo, arquivo: arquivo("termo.docx") }, HOJE)).toMatch(/PDF/);
    expect(conferirTermo({ ...termo, escopos: [] }, HOJE)).toMatch(/pelo menos uma/);
    expect(conferirTermo({ ...termo, assinado_por_cpf: "123" }, HOJE)).toMatch(/CPF/);
    expect(conferirTermo({ ...termo, assinado_em: "2026-11-10" }, HOJE)).toMatch(/futuro/);
    expect(conferirTermo({ ...termo, vigente_ate: "2026-11-05" }, HOJE)).toMatch(/validade/);
  });

  const nova: NovaConta = {
    codigo_compe: "033", agencia: "1234", conta: "130001234", conta_dv: "5", apelido: "Santander MDC",
    convenio: "", carteira: "", chave_pix: "", ambiente: "producao",
  };
  it("conta: banco escolhido, agência e conta só com números, apelido", () => {
    expect(conferirConta(nova)).toBeNull();
    expect(conferirConta({ ...nova, codigo_compe: "" })).toMatch(/banco/);
    expect(conferirConta({ ...nova, agencia: "1234-5" })).toMatch(/Agência/);
    expect(conferirConta({ ...nova, conta: "13000123-4" })).toMatch(/Conta/);
    expect(conferirConta({ ...nova, apelido: "" })).toMatch(/apelido/);
  });

  it("certificado: .pfx/.p12, senha e apelido", () => {
    const c = { tipo: "icp_a1_ecnpj" as const, apelido: "e-CNPJ MDC", senha: "x", arquivo: arquivo("mdc.pfx") };
    expect(conferirCertificado(c)).toBeNull();
    expect(conferirCertificado({ ...c, arquivo: arquivo("mdc.cer") })).toMatch(/\.pfx/);
    expect(conferirCertificado({ ...c, senha: "" })).toMatch(/senha/);
  });

  it("credencial: conta, Client ID e Client Secret", () => {
    const k = { conta_id: "k1", produto: "cobranca" as const, client_id: "abc123", client_secret: "s", certificado_id: "" };
    expect(conferirCredencial(k)).toBeNull();
    expect(conferirCredencial({ ...k, conta_id: "" })).toMatch(/conta/);
    expect(conferirCredencial({ ...k, client_secret: "" })).toMatch(/Secret/);
  });

  it("sugere e-CNPJ para empresa e e-CPF para pessoa", () => {
    expect(tipoCertificadoSugerido("48140121000165")).toBe("icp_a1_ecnpj");
    expect(tipoCertificadoSugerido("52998224725")).toBe("icp_a1_ecpf");
  });
});
