// Testes do mapa de navegação: qual módulo fica ativo em cada rota e quais abas cada pessoa vê.
import { describe, expect, it } from "vitest";
import { agruparLinks, filtrarLinks, linkAtivo, moduloDaRota, NAV, podeModulo, temGrupos } from "./navegacao";
import type { LinkModulo } from "./navegacao";

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
    expect(moduloDaRota("/financeiro/extratos")).toBe("financeiro");
    expect(moduloDaRota("/licencas")).toBe("licencas");
    expect(moduloDaRota("/licencas/inadimplentes")).toBe("licencas");
    expect(moduloDaRota("/estoque/posicao")).toBe("estoque");
    expect(moduloDaRota("/saidas")).toBe("saidas");
  });

  it("módulos de gestão separados têm rota própria", () => {
    expect(moduloDaRota("/plano-contas/categorias")).toBe("plano_contas");
    expect(moduloDaRota("/centros-custo")).toBe("centros_custo");
    expect(moduloDaRota("/relatorios")).toBe("relatorios");
    expect(moduloDaRota("/cadastros/pessoas")).toBe("cadastros");
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
    expect(soVer.map((l) => l.href)).toEqual(["/demonstrativos", "/demonstrativos/importacoes", "/demonstrativos/riscos"]);
  });
});

describe("Licenças", () => {
  it("todas as abas aparecem para quem vê a ferramenta (as ações é que exigem operar/gerir)", () => {
    const abas = filtrarLinks("licencas", { pode: (_app, minimo = "ver") => minimo === "ver", podeEditarCadastros: false });
    expect(abas.map((l) => l.href)).toEqual([
      "/licencas",
      "/licencas/cobrancas",
      "/licencas/inadimplentes",
      "/licencas/contratos",
      "/licencas/faturamento",
      "/licencas/produtos",
    ]);
describe("linkAtivo", () => {
  it("a aba inicial do módulo só fica ativa na própria rota", () => {
    expect(linkAtivo("/financeiro", "/financeiro", "financeiro")).toBe(true);
    expect(linkAtivo("/financeiro/bancos", "/financeiro", "financeiro")).toBe(false);
  });
  it("as outras abas ficam ativas também nas subpáginas, sem confundir prefixos", () => {
    expect(linkAtivo("/financeiro/bancos", "/financeiro/bancos", "financeiro")).toBe(true);
    expect(linkAtivo("/financeiro/notas/123", "/financeiro/notas", "financeiro")).toBe(true);
    expect(linkAtivo("/financeiro/pagarx", "/financeiro/pagar", "financeiro")).toBe(false);
  });
});

describe("agruparLinks", () => {
  const l = (href: string, grupo?: string): LinkModulo => ({ href, nome: href.slice(1), grupo });

  it("módulo sem grupos fica igual (uma aba por link)", () => {
    const links = NAV.tarefas.links;
    expect(agruparLinks(links)).toEqual(links.map((link) => ({ tipo: "link", link })));
    expect(temGrupos("tarefas")).toBe(false);
  });

  it("Financeiro: abas curtas, com Bancos (contas, transferências, extratos) num menu", () => {
    const e = agruparLinks(NAV.financeiro.links, NAV.financeiro.grupos);
    expect(e.map((x) => (x.tipo === "link" ? x.link.nome : `${x.nome} ▾`))).toEqual([
      "Início",
      "A pagar",
      "A receber",
      "Entradas e saídas",
      "Bancos ▾",
      "Estoque",
    ]);
    const bancos = e[4];
    expect(bancos.tipo === "grupo" && bancos.links.map((x) => x.href)).toEqual([
      "/financeiro/bancos",
      "/financeiro/transferencias",
      "/financeiro/extratos",
    ]);
    expect(temGrupos("financeiro")).toBe(true);
  });

  it("grupo com uma aba só vira aba solta com o nome do grupo; grupo reservado sem abas some", () => {
    const e = agruparLinks([l("/inicio"), l("/notas", "Notas fiscais")], ["Reservado", "Notas fiscais"]);
    expect(e).toEqual([
      { tipo: "link", link: l("/inicio") },
      { tipo: "link", link: { ...l("/notas", "Notas fiscais"), nome: "Notas fiscais" } },
    ]);
  });

  it("grupo cujas abas a pessoa não pode ver some; grupo fora da ordem vai para o fim", () => {
    expect(agruparLinks([l("/a"), l("/b", "X"), l("/c", "Y"), l("/d", "Y")], ["Y"]).map((x) => (x.tipo === "link" ? x.link.nome : x.nome))).toEqual([
      "a",
      "Y",
      "X",
    ]);
    expect(agruparLinks([l("/a")], ["Y"])).toEqual([{ tipo: "link", link: l("/a") }]);
  });
});

describe("podeModulo", () => {
  const so = (...apps: string[]) => (app: string) => apps.includes(app);
  it("módulo com ferramenta própria exige ela", () => {
    expect(podeModulo("plano_contas", so("plano_contas"))).toBe(true);
    expect(podeModulo("plano_contas", so("financeiro"))).toBe(false);
  });
  it("cadastro comum de fornecedores e clientes abre com qualquer módulo de gestão", () => {
    expect(podeModulo("cadastros", so("financeiro"))).toBe(true);
    expect(podeModulo("cadastros", so("saidas"))).toBe(true);
    expect(podeModulo("cadastros", so("tarefas"))).toBe(false);
  });
});
