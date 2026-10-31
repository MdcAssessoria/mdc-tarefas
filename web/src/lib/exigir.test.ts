// Testes de lib/exigir.ts.
import { describe, expect, it } from "vitest";
import { exigir } from "./exigir";

describe("exigir", () => {
  it("devolve data quando não há erro", () => {
    expect(exigir({ data: [1, 2], error: null })).toEqual([1, 2]);
    expect(exigir({ data: null, error: null })).toBeNull();
  });
  it("lança a mensagem traduzida quando há erro", () => {
    expect(() => exigir({ data: null, error: { message: "permission denied for table x" } })).toThrow(
      "Você não tem permissão para esta ação. Fale com o administrador da equipe.",
    );
  });
});
