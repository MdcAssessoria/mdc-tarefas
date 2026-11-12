import { describe, expect, it } from "vitest";
import { precisaTrocarSenha, problemaSenhaProvisoria } from "./senhaProvisoria";

describe("senha provisória", () => {
  it("só pede a troca com a marca trocar_senha verdadeira", () => {
    expect(precisaTrocarSenha({ user: { app_metadata: { trocar_senha: true } } })).toBe(true);
    expect(precisaTrocarSenha({ user: { app_metadata: { trocar_senha: "true" } } })).toBe(false);
    expect(precisaTrocarSenha({ user: { app_metadata: { provider: "email" } } })).toBe(false);
    expect(precisaTrocarSenha(null)).toBe(false);
    expect(precisaTrocarSenha(undefined)).toBe(false);
  });
});

describe("senha provisória digitada pelo administrador", () => {
  it("aceita vazio (o HUB gera) e senhas de 8 a 72 caracteres", () => {
    expect(problemaSenhaProvisoria("")).toBeNull();
    expect(problemaSenhaProvisoria("Mdc@2026")).toBeNull();
    expect(problemaSenhaProvisoria("curta")).toMatch(/pelo menos 8/);
    expect(problemaSenhaProvisoria("x".repeat(73))).toMatch(/no máximo 72/);
    expect(problemaSenhaProvisoria(" Mdc@2026")).toMatch(/espaço/);
  });
});
