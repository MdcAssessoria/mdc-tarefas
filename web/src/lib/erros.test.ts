// Testes de caracterização de lib/erros.ts (tradução das mensagens de erro para português).
import { describe, expect, it } from "vitest";
import { ErroApp, MENSAGEM_GENERICA, traduzirErro } from "./erros";

describe("traduzirErro", () => {
  it("aceita string, objeto com message ou qualquer outra coisa", () => {
    expect(traduzirErro("Failed to fetch")).toBe("Sem conexão com o servidor. Verifique sua internet e tente novamente.");
    expect(traduzirErro({ message: "Invalid login credentials" })).toBe("E-mail ou senha incorretos.");
    expect(traduzirErro(new Error("JWT expired"))).toBe("Sua sessão expirou. Entre novamente.");
    expect(traduzirErro(null)).toBe("Ocorreu um erro inesperado. Tente novamente.");
    expect(traduzirErro(42)).toBe("Ocorreu um erro inesperado. Tente novamente.");
    expect(traduzirErro({ message: "" })).toBe("Ocorreu um erro inesperado. Tente novamente.");
  });
  it("substitui o número capturado ($1)", () => {
    expect(traduzirErro("Password should be at least 8 characters")).toBe("A senha precisa ter pelo menos 8 caracteres.");
    expect(traduzirErro("For security purposes, you can only request this after 42 seconds.")).toBe(
      "Por segurança, aguarde 42 segundos antes de tentar de novo.",
    );
  });
  it("traduz erros do Postgres", () => {
    expect(traduzirErro('new row violates row-level security policy for table "x"')).toBe(
      "Você não tem permissão para esta ação. Fale com o administrador da equipe.",
    );
    expect(traduzirErro("duplicate key value violates unique constraint")).toBe("Este registro já existe.");
    expect(traduzirErro('null value in column "nome" violates not-null constraint')).toBe("Preencha todos os campos obrigatórios.");
  });
  it("a primeira regra que casa vence (rate limit de e-mail antes do genérico)", () => {
    expect(traduzirErro("email rate limit exceeded")).toBe(
      "Muitos e-mails enviados em pouco tempo. Aguarde alguns minutos e tente de novo.",
    );
    expect(traduzirErro("Too many requests")).toBe("Muitas tentativas seguidas. Aguarde um pouco e tente novamente.");
  });
  it("mensagens do próprio site passam direto (texto, new Error, ErroApp)", () => {
    expect(traduzirErro("Cliente sem CNPJ.")).toBe("Cliente sem CNPJ.");
    expect(traduzirErro(new Error("Escolha o arquivo do balancete."))).toBe("Escolha o arquivo do balancete.");
    expect(traduzirErro(new ErroApp("Certificado vencido."))).toBe("Certificado vencido.");
  });
  it("raise exception das funções do HUB (P0001) passa direto", () => {
    expect(traduzirErro({ code: "P0001", message: "O título já foi pago; estorne o pagamento antes." })).toBe(
      "O título já foi pago; estorne o pagamento antes.",
    );
  });
  it("Postgres, PostgREST e erros de programação desconhecidos viram mensagem genérica", () => {
    expect(traduzirErro({ code: "42883", message: "function app.xyz(uuid) does not exist" })).toBe(MENSAGEM_GENERICA);
    expect(traduzirErro({ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" })).toBe(MENSAGEM_GENERICA);
    expect(traduzirErro(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe(MENSAGEM_GENERICA);
    expect(traduzirErro({ message: "something odd happened" })).toBe(MENSAGEM_GENERICA);
    expect(MENSAGEM_GENERICA).toBe("Não foi possível concluir. Tente de novo; se continuar, avise a equipe MDC.");
  });
  it("sem internet (Failed to fetch como TypeError do navegador)", () => {
    expect(traduzirErro(new TypeError("Failed to fetch"))).toBe("Sem conexão com o servidor. Verifique sua internet e tente novamente.");
    expect(traduzirErro({ code: "", message: "TypeError: NetworkError when attempting to fetch resource." })).toBe(
      "Sem conexão com o servidor. Verifique sua internet e tente novamente.",
    );
  });
});
