// Testes dos atalhos de busca da ficha do lead (buscaInternet.ts).
import { describe, expect, it } from "vitest";
import { linksDeBusca } from "./buscaInternet";

describe("linksDeBusca", () => {
  it("monta Google, Instagram e LinkedIn com o nome e a cidade", () => {
    const l = linksDeBusca("Padaria Souza", "Bragança Paulista", "SP");
    expect(l.map((x) => x.nome)).toEqual(["Procurar no Google", "Procurar no Instagram", "Procurar no LinkedIn"]);
    expect(decodeURIComponent(l[0].url)).toContain("Padaria Souza Bragança Paulista SP");
    expect(decodeURIComponent(l[1].url)).toContain("site:instagram.com");
    expect(l[2].url).toContain("linkedin.com/search/results/companies");
  });
  it("sem nome não mostra atalho", () => {
    expect(linksDeBusca("  ")).toEqual([]);
  });
});
