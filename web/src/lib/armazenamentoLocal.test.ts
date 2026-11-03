// Testes de lib/armazenamentoLocal.ts (sem navegador: o valor fica na memória).
import { describe, expect, it } from "vitest";
import { CHAVES, gravarLocal, lerComAntiga, lerLocal } from "./armazenamentoLocal";

describe("armazenamento local", () => {
  it("sem localStorage, lê o que foi gravado nesta página e não lança erro", () => {
    expect(lerLocal("teste:inexistente")).toBeNull();
    gravarLocal("teste:chave", "quadro");
    expect(lerLocal("teste:chave")).toBe("quadro");
  });
  it("as chaves antigas continuam as mesmas (mudar apagaria preferências salvas)", () => {
    expect(CHAVES.organizacao).toBe("mdc-tarefas:org");
    expect(CHAVES.filtrosTarefas("abc")).toBe("mdc-tarefas:filtros:abc");
    expect(CHAVES.menuGestao).toBe("hub-mdc:menu-gestao");
  });
  it("chave renomeada: lê a antiga enquanto a nova não tem valor, depois só a nova", () => {
    gravarLocal("teste:antiga", "empresa-1");
    expect(lerComAntiga("teste:nova", "teste:antiga")).toBe("empresa-1");
    expect(lerComAntiga("teste:nova")).toBeNull();
    gravarLocal("teste:nova", "empresa-2");
    expect(lerComAntiga("teste:nova", "teste:antiga")).toBe("empresa-2");
  });
});
