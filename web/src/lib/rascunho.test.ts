import { beforeEach, describe, expect, it } from "vitest";
import {
  ATRIBUTO_ALTERADO,
  VALIDADE_RASCUNHO_MS,
  apagarRascunho,
  gravarRascunho,
  haAlteracoesNaoSalvas,
  lerRascunho,
  marcarAlterado,
  mesmoConteudo,
} from "./rascunho";
import { CHAVES } from "./armazenamentoLocal";

// imitações simples do armazenamento e da página (os testes rodam fora do navegador)
const guardado = new Map<string, string>();
const marcados: unknown[] = [];
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => guardado.get(k) ?? null,
    setItem: (k: string, v: string) => void guardado.set(k, v),
    removeItem: (k: string) => void guardado.delete(k),
  },
  document: { querySelector: (sel: string) => (sel.includes(ATRIBUTO_ALTERADO) && marcados.length ? marcados[0] : null) },
});

beforeEach(() => {
  guardado.clear();
  marcados.length = 0;
});

describe("rascunho guardado no navegador", () => {
  it("grava, lê e apaga", () => {
    const chave = CHAVES.rascunho("u1", "tarefa:nova");
    gravarRascunho(chave, { titulo: "Conciliar extrato" }, 1000);
    expect(lerRascunho(chave, 2000)).toEqual({ valor: { titulo: "Conciliar extrato" }, em: 1000 });
    apagarRascunho(chave);
    expect(lerRascunho(chave)).toBeNull();
  });

  it("cada pessoa tem o seu rascunho", () => {
    expect(CHAVES.rascunho("u1", "tarefa:nova")).not.toBe(CHAVES.rascunho("u2", "tarefa:nova"));
  });

  it("rascunho vencido é ignorado e apagado", () => {
    const chave = CHAVES.rascunho("u1", "rotina:nova");
    gravarRascunho(chave, { titulo: "x" }, 0);
    expect(lerRascunho(chave, VALIDADE_RASCUNHO_MS + 1)).toBeNull();
    expect(localStorage.getItem(chave)).toBeNull();
  });

  it("conteúdo estragado não quebra a tela", () => {
    localStorage.setItem("hub-mdc:rascunho:u1:x", "{não é json");
    expect(lerRascunho("hub-mdc:rascunho:u1:x")).toBeNull();
  });

  it("compara pelo conteúdo", () => {
    expect(mesmoConteudo({ a: 1 }, { a: 1 })).toBe(true);
    expect(mesmoConteudo({ a: 1 }, { a: 2 })).toBe(false);
  });
});

describe("alterações não salvas", () => {
  it("conta formulário marcado e janela onde a pessoa digitou", () => {
    expect(haAlteracoesNaoSalvas()).toBe(false);
    marcarAlterado("tarefa:nova", true);
    expect(haAlteracoesNaoSalvas()).toBe(true);
    marcarAlterado("tarefa:nova", false);
    expect(haAlteracoesNaoSalvas()).toBe(false);
    marcados.push({}); // janela aberta com algo digitado
    expect(haAlteracoesNaoSalvas()).toBe(true);
    marcados.length = 0; // janela fechada
    expect(haAlteracoesNaoSalvas()).toBe(false);
  });
});
