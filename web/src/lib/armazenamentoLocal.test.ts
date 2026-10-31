// Testes de lib/armazenamentoLocal.ts (sem navegador: o valor fica na memória).
import { describe, expect, it } from "vitest";
import { CHAVES, gravarLocal, lerLocal } from "./armazenamentoLocal";

describe("armazenamento local", () => {
  it("sem localStorage, lê o que foi gravado nesta página e não lança erro", () => {
    expect(lerLocal("teste:inexistente")).toBeNull();
    gravarLocal("teste:chave", "quadro");
    expect(lerLocal("teste:chave")).toBe("quadro");
  });
  it("as chaves antigas continuam as mesmas (mudar apagaria preferências salvas)", () => {
    expect(CHAVES.organizacao).toBe("mdc-tarefas:org");
    expect(CHAVES.filtrosTarefas("abc")).toBe("mdc-tarefas:filtros:abc");
  });
});
