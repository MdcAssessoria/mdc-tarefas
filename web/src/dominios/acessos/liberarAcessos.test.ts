// Testes da lista de quem recebe senha provisória de uma vez.
import { describe, expect, it } from "vitest";
import { candidatosAcesso } from "./liberarAcessos";

const pessoa = (user_id: string, nome: string, email: string | null, papel = "analista", ativo = true) => ({
  user_id,
  nome,
  email,
  papel,
  ativo,
});

describe("candidatosAcesso", () => {
  const contas = new Map([
    ["a", { confirmado: true, ultimo_acesso: "2026-11-10T12:00:00Z" }],
    ["b", { confirmado: false, ultimo_acesso: null }],
    ["c", { confirmado: true, ultimo_acesso: null }],
  ]);
  const equipe = [
    pessoa("eu", "Edvaldo", "edvaldo@x.com", "admin"),
    pessoa("a", "Ana", "ana@x.com"),
    pessoa("b", "Bruno", "bruno@x.com"),
    pessoa("c", "Carla", "Carla@X.com"),
    pessoa("d", "Diego", null),
    pessoa("e", "Elisa", "elisa@x.com", "analista", false),
    pessoa("t", "Painel", "painel@x.com", "tv"),
  ];
  const convites = [
    { email: "zeca@x.com", nome: "Zeca" },
    { email: "tv@x.com", nome: "Painel TV" },
    { email: "bruno@x.com", nome: "Bruno de novo" },
  ];
  const lista = candidatosAcesso(equipe, contas, convites, "eu");

  it("traz primeiro quem não tem acesso, marcado, em ordem de nome", () => {
    expect(lista.filter((c) => c.pendente).map((c) => c.nome)).toEqual(["Bruno de novo", "Carla", "Zeca"]);
  });
  it("quem já entrou vem desmarcado", () => {
    expect(lista.find((c) => c.nome === "Ana")).toMatchObject({ pendente: false });
  });
  it("deixa de fora a própria pessoa, o Painel TV, inativos, quem não tem e-mail e e-mail repetido", () => {
    expect(lista.map((c) => c.email).sort()).toEqual(["ana@x.com", "bruno@x.com", "carla@x.com", "zeca@x.com"]);
  });
});
