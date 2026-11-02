// Testes de dominios/acessos/permissoes.ts (pode() da tela).
import { describe, expect, it } from "vitest";
import { podeNoApp } from "./permissoes";

const apps = [
  { slug: "estoque", papel: "gerir" as const },
  { slug: "entradas", papel: "operar" as const },
  { slug: "financeiro", papel: "ver" as const },
  { slug: "comercial", papel: null },
];

describe("podeNoApp", () => {
  it("administrador pode tudo, mesmo sem a ferramenta liberada", () => {
    expect(podeNoApp("admin", [], "financeiro", "gerir")).toBe(true);
  });
  it("respeita o nível: ver < operar < gerir", () => {
    expect(podeNoApp("membro", apps, "entradas")).toBe(true);
    expect(podeNoApp("membro", apps, "entradas", "operar")).toBe(true);
    expect(podeNoApp("membro", apps, "entradas", "gerir")).toBe(false);
    expect(podeNoApp("gestor", apps, "estoque", "gerir")).toBe(true);
  });
  it("ferramenta sem nível ou não liberada não passa", () => {
    expect(podeNoApp("membro", apps, "comercial")).toBe(false);
    expect(podeNoApp("membro", apps, "licencas")).toBe(false);
  });
  it("financeiro é conferido pelo nome (gerir no Estoque não libera o que o banco exige do Financeiro)", () => {
    expect(podeNoApp("membro", apps, "financeiro", "gerir")).toBe(false);
    expect(podeNoApp("membro", apps, "financeiro", "ver")).toBe(true);
  });
});
