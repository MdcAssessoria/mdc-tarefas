import { describe, expect, it } from "vitest";
import { consultarCnpj, lerRespostaCnpj, resumoCnpj } from "./consultaCnpj";

const resposta = {
  cnpj: "11222333000181",
  razao_social: "EMPRESA EXEMPLO LTDA",
  nome_fantasia: "",
  descricao_situacao_cadastral: "ATIVA",
  data_inicio_atividade: "2015-06-01",
  cnae_fiscal: 6920601,
  cnae_fiscal_descricao: "Atividades de contabilidade",
  descricao_tipo_logradouro: "RUA",
  logradouro: "DAS FLORES",
  numero: "100",
  complemento: "",
  bairro: "CENTRO",
  municipio: "BRAGANCA PAULISTA",
  uf: "sp",
  cep: "12900000",
  ddd_telefone_1: "1144445555",
  email: "CONTATO@EXEMPLO.COM.BR",
  capital_social: 50000,
  opcao_pelo_simples: true,
  qsa: [
    { nome_socio: "FULANO DE TAL", qualificacao_socio: "Sócio-Administrador", data_entrada_sociedade: "2015-06-01" },
    { nome_socio: "" },
  ],
};

describe("lerRespostaCnpj", () => {
  it("monta os dados no formato do HUB", () => {
    const d = lerRespostaCnpj(resposta);
    expect(d.cnpj).toBe("11.222.333/0001-81");
    expect(d.razaoSocial).toBe("EMPRESA EXEMPLO LTDA");
    expect(d.nomeFantasia).toBeNull();
    expect(d.uf).toBe("SP");
    expect(d.endereco).toBe("RUA DAS FLORES, 100, CENTRO");
    expect(d.cep).toBe("12900-000");
    expect(d.telefone).toBe("(11) 4444-5555");
    expect(d.email).toBe("contato@exemplo.com.br");
    expect(d.cnae).toBe("6920601 · Atividades de contabilidade");
    expect(d.capitalSocial).toBe(50000);
    expect(d.socios).toEqual([{ nome: "FULANO DE TAL", qualificacao: "Sócio-Administrador", entrada: "2015-06-01" }]);
  });

  it("aguenta campos faltando", () => {
    const d = lerRespostaCnpj({ razao_social: "X" });
    expect(d.endereco).toBeNull();
    expect(d.socios).toEqual([]);
    expect(d.capitalSocial).toBeNull();
  });
});

describe("resumoCnpj", () => {
  it("resume endereço, CNAE, capital e sócios", () => {
    const t = resumoCnpj(lerRespostaCnpj(resposta), "02/11/2026");
    expect(t).toContain("consulta em 02/11/2026");
    expect(t).toContain("BRAGANCA PAULISTA/SP");
    expect(t).toContain("Sócios: FULANO DE TAL (Sócio-Administrador)");
  });
});

describe("consultarCnpj", () => {
  it("recusa CNPJ inválido sem consultar", async () => {
    await expect(consultarCnpj("123")).rejects.toThrow("CNPJ inválido");
  });
});
