// Testes do texto do histórico de Pessoas e acessos.
import { describe, expect, it } from "vitest";
import { descrever } from "./auditoria";
import type { Auditoria } from "./tipos";

const nomeMembro = (id: string | null) => ({ u1: "Ana", u2: "Bruno" })[id ?? ""] ?? "—";
const apps = [{ slug: "tarefas", nome: "Tarefas" }];
const perfis = [{ id: "p1", nome: "Contábil", apps: {} }];
const reg = (r: Partial<Auditoria>): Auditoria => ({ id: 1, user_id: "u1", acao: "", alvo: null, antes: null, depois: null, em: "", ...r });

describe("descrever", () => {
  it("liberação e retirada de ferramenta", () => {
    expect(descrever(reg({ acao: "acesso", alvo: "tarefas:u2", depois: "operar" }), apps, perfis, nomeMembro)).toBe(
      "liberou Tarefas (operar) para Bruno",
    );
    expect(descrever(reg({ acao: "acesso", alvo: "tarefas:u2" }), apps, perfis, nomeMembro)).toBe("retirou Tarefas de Bruno");
  });
  it("perfil, transferência e ação desconhecida", () => {
    expect(descrever(reg({ acao: "vincular_perfil", alvo: "u2", depois: "p1" }), apps, perfis, nomeMembro)).toBe(
      "colocou Bruno em Contábil",
    );
    expect(descrever(reg({ acao: "vincular_perfil", alvo: "u2" }), apps, perfis, nomeMembro)).toBe("colocou Bruno em acesso manual");
    expect(descrever(reg({ acao: "transferir_trabalho", alvo: "u1", depois: { tarefas: 3, para: "u2" } }), apps, perfis, nomeMembro)).toBe(
      "transferiu 3 tarefa(s) de Ana para Bruno",
    );
    expect(descrever(reg({ acao: "outra", alvo: "x" }), apps, perfis, nomeMembro)).toBe("outra x");
  });
});
