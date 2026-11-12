import { describe, expect, it } from "vitest";
import { precisaTrocarSenha } from "./senhaProvisoria";

describe("senha provisória", () => {
  it("só pede a troca com a marca trocar_senha verdadeira", () => {
    expect(precisaTrocarSenha({ user: { app_metadata: { trocar_senha: true } } })).toBe(true);
    expect(precisaTrocarSenha({ user: { app_metadata: { trocar_senha: "true" } } })).toBe(false);
    expect(precisaTrocarSenha({ user: { app_metadata: { provider: "email" } } })).toBe(false);
    expect(precisaTrocarSenha(null)).toBe(false);
    expect(precisaTrocarSenha(undefined)).toBe(false);
  });
});
