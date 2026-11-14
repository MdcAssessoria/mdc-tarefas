import { describe, expect, it } from "vitest";
import { ehArquivoDoSite, ehFalhaDeCarregamento, podeRecarregarSozinho, saiuVersaoNova } from "./atualizacao";

describe("ehFalhaDeCarregamento", () => {
  it("reconhece as mensagens dos navegadores quando um arquivo do site some depois da publicação", () => {
    const e = new Error("Loading chunk 482 failed.");
    e.name = "ChunkLoadError";
    expect(ehFalhaDeCarregamento(e)).toBe(true);
    expect(ehFalhaDeCarregamento(new TypeError("Failed to fetch dynamically imported module: https://x/_next/a.js"))).toBe(true);
    expect(ehFalhaDeCarregamento(new TypeError("Importing a module script failed."))).toBe(true);
    expect(ehFalhaDeCarregamento("error loading dynamically imported module")).toBe(true);
  });

  it("não confunde com outros erros", () => {
    expect(ehFalhaDeCarregamento(new Error("Você não tem permissão"))).toBe(false);
    expect(ehFalhaDeCarregamento(new TypeError("Failed to fetch"))).toBe(false);
    expect(ehFalhaDeCarregamento(null)).toBe(false);
    expect(ehFalhaDeCarregamento(42)).toBe(false);
  });
});

describe("ehArquivoDoSite", () => {
  it("só os arquivos do Next contam", () => {
    expect(ehArquivoDoSite("https://hub.mdcassessoria.com/hub-mdc/_next/static/chunks/abc.js")).toBe(true);
    expect(ehArquivoDoSite("https://bulqqdgfrrpqquqvjjfa.supabase.co/storage/x.png")).toBe(false);
    expect(ehArquivoDoSite(null)).toBe(false);
  });
});

describe("podeRecarregarSozinho", () => {
  it("recarrega se nunca recarregou ou se já passou mais de um minuto", () => {
    expect(podeRecarregarSozinho(null, 1_000_000)).toBe(true);
    expect(podeRecarregarSozinho(1_000_000 - 61_000, 1_000_000)).toBe(true);
  });
  it("não recarrega em loop", () => {
    expect(podeRecarregarSozinho(1_000_000 - 5_000, 1_000_000)).toBe(false);
  });
});

describe("saiuVersaoNova", () => {
  it("compara a versão da aba com a publicada", () => {
    expect(saiuVersaoNova("abc", "def")).toBe(true);
    expect(saiuVersaoNova("abc", "abc")).toBe(false);
    expect(saiuVersaoNova("abc", null)).toBe(false);
    expect(saiuVersaoNova("", "def")).toBe(false);
  });
});
