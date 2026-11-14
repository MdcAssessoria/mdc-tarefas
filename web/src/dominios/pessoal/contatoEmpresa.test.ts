// Testes das regras do cartão "Você tem empresa?" (contatoEmpresa.ts).
import { describe, expect, it } from "vitest";
import { mascaraTelefone, receitaParaContato, telefoneValido } from "./contatoEmpresa";

describe("mascaraTelefone", () => {
  it("formata fixo e celular enquanto digita", () => {
    expect(mascaraTelefone("11")).toBe("(11");
    expect(mascaraTelefone("1133334444")).toBe("(11) 3333-4444");
    expect(mascaraTelefone("11988887777")).toBe("(11) 98888-7777");
    expect(mascaraTelefone("(11) 98888-77779")).toBe("(11) 98888-7777");
  });
  it("vazio é válido (telefone é opcional); incompleto não", () => {
    expect(telefoneValido("")).toBe(true);
    expect(telefoneValido("(11) 9888")).toBe(false);
    expect(telefoneValido("(11) 98888-7777")).toBe(true);
  });
});

describe("receitaParaContato", () => {
  it("leva os dados da empresa e nunca os sócios", () => {
    const r = receitaParaContato({
      cnpj: "11.122.233/0001-83",
      razaoSocial: "Padaria Souza Ltda",
      nomeFantasia: "Padaria Souza",
      situacao: "ATIVA",
      abertura: "2024-01-02",
      naturezaJuridica: null,
      porte: "ME",
      cnae: "1091101",
      endereco: "Rua A, 1",
      municipio: "Bragança Paulista",
      uf: "SP",
      cep: null,
      telefone: null,
      email: null,
      capitalSocial: null,
      simples: true,
      mei: false,
      socios: [{ nome: "Fulano", qualificacao: null, entrada: null }],
    });
    expect(r.nome_fantasia).toBe("Padaria Souza");
    expect(JSON.stringify(r)).not.toContain("Fulano");
  });
});
