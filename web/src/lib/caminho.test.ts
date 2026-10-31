// Testes de caracterização de lib/caminho.ts (prefixo /hub-mdc nos endereços montados à mão).
import { describe, expect, it } from "vitest";
import { BASE, caminho, enderecoHub } from "./caminho";

describe("caminho", () => {
  it("prefixa rotas internas uma única vez", () => {
    expect(BASE).toBe("/hub-mdc");
    expect(caminho("/tarefas")).toBe("/hub-mdc/tarefas");
    expect(caminho("/")).toBe("/hub-mdc/");
    expect(caminho("/hub-mdc")).toBe("/hub-mdc");
    expect(caminho("/hub-mdc/config")).toBe("/hub-mdc/config");
    expect(caminho("/hub-mdcx")).toBe("/hub-mdc/hub-mdcx");
  });
  it("não mexe em URLs externas, âncoras nem caminhos relativos", () => {
    expect(caminho("https://mdcassessoria.com")).toBe("https://mdcassessoria.com");
    expect(caminho("//cdn.exemplo.com/a.js")).toBe("//cdn.exemplo.com/a.js");
    expect(caminho("#topo")).toBe("#topo");
    expect(caminho("relativo")).toBe("relativo");
  });
  it("enderecoHub sem window (servidor) devolve só o caminho", () => {
    expect(enderecoHub()).toBe("/hub-mdc/");
    expect(enderecoHub("/portal")).toBe("/hub-mdc/portal");
  });
});
