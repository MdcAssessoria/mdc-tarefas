// Testes das regras dos pacotes de licença (091).
import { describe, expect, it } from "vitest";
import { herancaDoPacote, modulosParaPacote, pacotesDoSistema, resumoPacote, textoExcedente, textoUsuariosPacote } from "./pacotes";
import type { Plano, Produto } from "./tipos";

const brl = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;
const pacote = (x: Partial<Plano>): Plano => ({
  id: "p1",
  org_id: "o",
  nome: "EXato R&S",
  descricao: "",
  preco: 300,
  ativo: true,
  produtos: ["a", "b"],
  sistema: "exato",
  usuarios_incluidos: 3,
  valor_usuario_adicional: 40,
  excedente: "cobrar",
  ...x,
});
const modulo = (x: Partial<Produto>) => ({ id: "a", sistema: "exato", ativo: true, ...x }) as Produto;

describe("resumoPacote", () => {
  const base = { precosModulos: [200, 150], preco: 300, usuarios_incluidos: 3, valor_usuario_adicional: 40, excedente: "cobrar" as const };

  it("soma os avulsos e calcula o desconto do pacote", () => {
    const r = resumoPacote(base, 3);
    expect(r.avulsos).toBe(350);
    expect(r.desconto).toBe(14.3);
    expect(r.mensalidade).toBe(300);
    expect(r.adicionais).toBe(0);
  });

  it("cobra os usuários a mais no exemplo", () => {
    const r = resumoPacote(base, 5);
    expect(r.adicionais).toBe(2);
    expect(r.mensalidade).toBe(380);
    expect(r.bloqueia).toBe(false);
  });

  it("com bloquear não cobra e avisa que o sistema barra", () => {
    const r = resumoPacote({ ...base, excedente: "bloquear" }, 5);
    expect(r.mensalidade).toBe(300);
    expect(r.bloqueia).toBe(true);
  });

  it("sem limite nunca tem adicional", () => {
    const r = resumoPacote({ ...base, usuarios_incluidos: null }, 50);
    expect(r.adicionais).toBe(0);
    expect(r.mensalidade).toBe(300);
  });

  it("pacote mais caro que os avulsos não tem desconto", () => {
    expect(resumoPacote({ ...base, preco: 400 }, 1).desconto).toBe(0);
  });
});

describe("textos do pacote", () => {
  it("usuários", () => {
    expect(textoUsuariosPacote(null)).toBe("Sem limite de usuários");
    expect(textoUsuariosPacote(1)).toBe("Até 1 usuário");
    expect(textoUsuariosPacote(15)).toBe("Até 15 usuários");
  });
  it("excedente", () => {
    expect(textoExcedente("bloquear", 40, brl)).toContain("não deixa");
    expect(textoExcedente("cobrar", 40, brl)).toBe("Usuário a mais: R$ 40,00 por mês");
    expect(textoExcedente("cobrar", 0, brl)).toContain("sem valor");
  });
});

describe("filtros e herança", () => {
  it("pacotes e módulos do sistema", () => {
    const l = [pacote({}), pacote({ id: "p2", sistema: "ledgra" }), pacote({ id: "p3", ativo: false })];
    expect(pacotesDoSistema(l, "exato").map((p) => p.id)).toEqual(["p1"]);
    expect(pacotesDoSistema(l, "exato", "p3").map((p) => p.id)).toEqual(["p1", "p3"]);
    const m = [modulo({}), modulo({ id: "b", ativo: false }), modulo({ id: "c", sistema: "ledgra" })];
    expect(modulosParaPacote(m, "exato", []).map((p) => p.id)).toEqual(["a"]);
    expect(modulosParaPacote(m, "exato", ["b"]).map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("a licença herda usuários, adicional e excedente do pacote", () => {
    expect(herancaDoPacote(pacote({}))).toEqual({ temLimite: true, usuarios: "3", adicional: 40, excedente: "cobrar" });
    expect(herancaDoPacote(pacote({ usuarios_incluidos: null, excedente: "bloquear" }))).toEqual({
      temLimite: false,
      usuarios: "",
      adicional: 40,
      excedente: "bloquear",
    });
  });
});
