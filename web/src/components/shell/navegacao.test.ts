// Testes do mapa de navegação: qual módulo fica ativo em cada rota e quais abas cada pessoa vê.
import { describe, expect, it } from "vitest";
import { filtrarLinks, moduloDaRota } from "./navegacao";

describe("moduloDaRota", () => {
  it("usa o primeiro trecho da rota", () => {
    expect(moduloDaRota("/")).toBe("hub");
    expect(moduloDaRota("/hub/acessos")).toBe("hub");
    expect(moduloDaRota("/tarefas/relatorio")).toBe("tarefas");
    expect(moduloDaRota("/societario/abc")).toBe("societario");
    expect(moduloDaRota("/demonstrativos/importar")).toBe("demonstrativos");
    expect(moduloDaRota("/atendimento/portal")).toBe("atendimento");
    expect(moduloDaRota("/vencimentos")).toBe("vencimentos");
    expect(moduloDaRota("/comercial/leads")).toBe("comercial");
  });

  it("Configurações e importação de clientes ficam em Tarefas (como era o padrão do AppShell)", () => {
    expect(moduloDaRota("/config")).toBe("tarefas");
    expect(moduloDaRota("/clientes/importar")).toBe("tarefas");
  });
});

describe("filtrarLinks", () => {
  it("esconde abas de gestor e as que exigem nível maior", () => {
    const semGestao = filtrarLinks("tarefas", { pode: () => true, podeEditarCadastros: false });
    expect(semGestao.map((l) => l.href)).not.toContain("/config");
    const soVer = filtrarLinks("demonstrativos", { pode: (_app, minimo = "ver") => minimo === "ver", podeEditarCadastros: true });
    expect(soVer.map((l) => l.href)).toEqual(["/demonstrativos", "/demonstrativos/riscos"]);
  });
});
