// Testa as regras da entrada do MDC - Pessoal: nome sugerido da família, cadastro e módulos liberados.
import { describe, expect, it } from "vitest";
import { moduloNoPessoal, problemaCadastro, problemaNomeFamilia, rotaNoPessoal, sugerirNomeFamilia } from "./entrada";

const ok = { nome: "Ana Souza", email: "ana@exemplo.com", senha: "segredo123", confirma: "segredo123" };

describe("MDC - Pessoal: entrada", () => {
  it("sugere o nome da família pelo último sobrenome", () => {
    expect(sugerirNomeFamilia("maria da silva SOUZA")).toBe("Família Souza");
    expect(sugerirNomeFamilia("Pedro")).toBe("Família Pedro");
    expect(sugerirNomeFamilia("  ")).toBe("");
  });
  it("confere o cadastro na ordem em que a pessoa preenche", () => {
    expect(problemaCadastro(ok)).toBeNull();
    expect(problemaCadastro({ ...ok, nome: "A" })).toBe("Digite o seu nome.");
    expect(problemaCadastro({ ...ok, email: "ana@" })).toBe("Confira o e-mail digitado.");
    expect(problemaCadastro({ ...ok, senha: "", confirma: "" })).toBe("Crie uma senha.");
    expect(problemaCadastro({ ...ok, senha: "curta", confirma: "curta" })).toMatch(/pelo menos 8/);
    expect(problemaCadastro({ ...ok, confirma: "outra1234" })).toBe("As duas senhas não conferem.");
  });
  it("nome da família entre 3 e 80 letras", () => {
    expect(problemaNomeFamilia("Ab")).toMatch(/pelo menos 3/);
    expect(problemaNomeFamilia("Família Souza")).toBeNull();
    expect(problemaNomeFamilia("x".repeat(81))).toMatch(/80/);
  });
  it("só Início, Tarefas, Finanças e Família; sem certificado digital", () => {
    expect(moduloNoPessoal("financeiro")).toBe(true);
    expect(moduloNoPessoal("societario")).toBe(false);
    expect(rotaNoPessoal("/financeiro/pagar")).toBe(true);
    expect(rotaNoPessoal("/financeiro/certificado")).toBe(false);
  });
});
