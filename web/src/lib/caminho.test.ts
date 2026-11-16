// Testes de caracterização de lib/caminho.ts (prefixo /hub-mdc nos endereços montados à mão).
import { describe, expect, it } from "vitest";
import { BASE, ENDERECO_OFICIAL, caminho, enderecoHub, origemPublica } from "./caminho";

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
  it("enderecoHub sem window (servidor) devolve o endereço oficial completo", () => {
    expect(enderecoHub()).toBe("https://hub.mdcassessoria.com/hub-mdc/");
    expect(enderecoHub("/portal")).toBe("https://hub.mdcassessoria.com/hub-mdc/portal");
  });
});

describe("origemPublica (links enviados a outras pessoas)", () => {
  it("usa o endereço oficial mesmo quando o HUB foi aberto pela Vercel", () => {
    expect(origemPublica("https://mdc-tarefas.vercel.app")).toBe(ENDERECO_OFICIAL);
    expect(origemPublica("https://hub.mdcassessoria.com")).toBe("https://hub.mdcassessoria.com");
  });
  it("no computador de desenvolvimento fica o endereço local", () => {
    expect(origemPublica("http://localhost:3000")).toBe("http://localhost:3000");
    expect(origemPublica("http://127.0.0.1:3100")).toBe("http://127.0.0.1:3100");
  });
});
