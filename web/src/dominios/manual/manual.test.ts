// Testes da leitura e da busca do manual dentro do sistema.
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MANUAL_MD } from "./conteudo";
import {
  buscarNoManual,
  caminhoNoMenu,
  formasDaBusca,
  raiz,
  rotaDoCaminho,
  lerBlocos,
  lerManual,
  marcarPalavras,
  nomeCurto,
  partesDoTexto,
  slug,
} from "./manual";

const EXEMPLO = `## Contratos

O contrato define o que a TEAM Brasil presta.

### Contratos (Contratos → Contratos)

![Lista de contratos](/manual/25-contratos.webp)

**Para que serve:** lista de todos os contratos.

1. Toque em **Novo contrato**.
2. Escolha o cliente.

| Etapa | O que significa |
|---|---|
| Edição | Dados e itens podem mudar |

## Financeiro

### Conciliação bancária (Financeiro → Conciliação bancária)

- Importe o extrato OFX.
- Concilie cada linha.
`;

describe("manual", () => {
  it("separa áreas, telas e blocos", () => {
    const areas = lerManual(EXEMPLO);
    expect(areas.map((a) => a.titulo)).toEqual(["Contratos", "Financeiro"]);
    expect(areas[0].blocos).toEqual([{ tipo: "paragrafo", texto: "O contrato define o que a TEAM Brasil presta." }]);
    const tela = areas[0].telas[0];
    expect(tela.id).toBe("contratos--contratos");
    expect(tela.blocos.map((b) => b.tipo)).toEqual(["imagem", "paragrafo", "lista", "tabela"]);
    expect(tela.blocos[3]).toEqual({
      tipo: "tabela",
      cabecalho: ["Etapa", "O que significa"],
      linhas: [["Edição", "Dados e itens podem mudar"]],
    });
    expect(areas[1].telas[0].blocos[0]).toMatchObject({
      tipo: "lista",
      ordenada: false,
      itens: ["Importe o extrato OFX.", "Concilie cada linha."],
    });
  });

  it("lista numerada continua do número escrito", () => {
    expect(lerBlocos(["2. Confira", "3. Salve"])[0]).toMatchObject({ ordenada: true, inicio: 2, itens: ["Confira", "Salve"] });
  });

  it("negrito, nome curto e caminho no menu", () => {
    expect(partesDoTexto("Toque em **Salvar** agora")).toEqual([
      { texto: "Toque em ", negrito: false },
      { texto: "Salvar", negrito: true },
      { texto: " agora", negrito: false },
    ]);
    expect(partesDoTexto("**Campos com asterisco (*)**: obrigatórios")[0]).toEqual({ texto: "Campos com asterisco (*)", negrito: true });
    expect(nomeCurto("Pessoas e acessos (Administração → Pessoas e acessos)")).toBe("Pessoas e acessos");
    expect(caminhoNoMenu("Pessoas e acessos (Administração → Pessoas e acessos)")).toBe("Administração → Pessoas e acessos");
    expect(caminhoNoMenu("Voltar uma etapa")).toBeNull();
    expect(slug("Fiscal (notas de entrada)")).toBe("fiscal");
    expect(slug("Operação do dia")).toBe("operacao-do-dia");
  });

  it("busca sem acento, com todas as palavras, título primeiro e por área", () => {
    const areas = lerManual(EXEMPLO);
    const r = buscarNoManual(areas, "conciliacao ofx");
    expect(r).toHaveLength(1);
    expect(r[0].tela?.titulo).toMatch(/^Conciliação/);
    expect(r[0].trecho).toContain("OFX");
    expect(buscarNoManual(areas, "contrato")[0].tela?.titulo).toMatch(/^Contratos/);
    expect(buscarNoManual(areas, "contrato", "financeiro")).toEqual([]);
    expect(buscarNoManual(areas, "a")).toEqual([]);
    expect(buscarNoManual(areas, "pagamento inexistente")).toEqual([]);
  });

  it("entende a dúvida escrita do jeito de cada um", () => {
    const areas = lerManual(EXEMPLO);
    // pergunta inteira: "como", "faço", "para", "o" não atrapalham
    expect(buscarNoManual(areas, "Como faço para conciliar o extrato?")[0].tela?.titulo).toMatch(/^Conciliação/);
    // plural e verbo
    expect(buscarNoManual(areas, "contratos")[0].tela?.titulo).toMatch(/^Contratos/);
    expect(buscarNoManual(areas, "extratos")[0].tela?.titulo).toMatch(/^Conciliação/);
    // sinônimo: "planilha" acha também onde o manual fala em Excel
    expect(formasDaBusca("planilha")[0]).toContain("excel");
    expect(formasDaBusca("apagar")[0]).toEqual(expect.arrayContaining(["excluir", "cancelar"]));
    // nada com todas as palavras: devolve as aproximadas, marcadas
    const r = buscarNoManual(areas, "contrato fiador");
    expect(r[0].tela?.titulo).toMatch(/^Contratos/);
    expect(r[0].parcial).toBe(true);
    expect(buscarNoManual(areas, "contrato")[0].parcial).toBeUndefined();
  });

  it("acha o endereço da tela pelo caminho do menu", () => {
    const secoes = [
      { titulo: "Comercial (CRM)", links: [{ href: "/crm", nome: "Funil" }] },
      { titulo: "Administração", links: [{ href: "/administracao/integracao", nome: "Integração TOTVS RM" }] },
    ];
    expect(rotaDoCaminho("Comercial → Funil", secoes)).toBe("/crm");
    expect(rotaDoCaminho("Administração → Integração TOTVS RM", secoes)).toBe("/administracao/integracao");
    expect(rotaDoCaminho("Comercial → Funil → abrir a oportunidade", secoes)).toBe("/crm");
    expect(rotaDoCaminho("Menu → Hoje", secoes)).toBe("/");
    expect(rotaDoCaminho("Clientes → toque no nome", secoes)).toBeNull();
    expect(rotaDoCaminho(null, secoes)).toBeNull();
  });

  it("raiz tira plural e terminação de verbo", () => {
    expect(raiz("contas")).toBe("conta");
    expect(raiz("condicoes")).toBe("condica");
    expect(raiz("aprovar")).toBe("aprov");
    expect(raiz("pdf")).toBe("pdf");
    expect(raiz("nfs-e")).toBe("nfs-e");
  });

  it("marca a palavra inteira, só no começo dela", () => {
    expect(marcarPalavras("Contratos e subcontrato", "contrato")).toEqual([
      { texto: "Contratos", marcado: true },
      { texto: " e subcontrato", marcado: false },
    ]);
  });

  it("marca as palavras encontradas", () => {
    expect(marcarPalavras("Conciliação bancária", "conciliacao")).toEqual([
      { texto: "Conciliação", marcado: true },
      { texto: " bancária", marcado: false },
    ]);
  });

  it("o manual do HUB tem as áreas, as telas e acha as dúvidas comuns", () => {
    const areas = lerManual(MANUAL_MD);
    expect(areas.map((a) => a.id)).toEqual(
      expect.arrayContaining(["primeiro-acesso", "tarefas", "societario", "demonstrativos", "pessoas-e-acessos", "duvidas-frequentes"]),
    );
    expect(new Set(areas.flatMap((a) => a.telas.map((t) => t.id))).size).toBe(areas.flatMap((a) => a.telas).length);
    const imagens = areas.flatMap((a) => [...a.blocos, ...a.telas.flatMap((t) => t.blocos)]).filter((b) => b.tipo === "imagem");
    const faltando = imagens.map((b) => (b.tipo === "imagem" ? b.src : "")).filter((s) => !existsSync(`${process.cwd()}/public${s}`));
    expect(faltando).toEqual([]);
    const primeiro = (q: string) => buscarNoManual(areas, q)[0]?.tela?.titulo ?? "";
    expect(primeiro("como crio a mesma tarefa para varios clientes")).toMatch(/vários clientes/);
    expect(primeiro("esqueci a senha")).toMatch(/Entrar no HUB/);
    expect(primeiro("como dou acesso a uma pessoa")).toMatch(/Dar acesso/);
  });
});
