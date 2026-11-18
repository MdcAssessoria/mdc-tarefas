// Testes da nova tarefa para vários clientes (lote.ts).
import { describe, expect, it } from "vitest";
import type { Cliente } from "@/dominios/clientes/tipos";
import { RESPONSAVEL_DA_CARTEIRA, filtrarClientes, jaTem, linhasDoLote, nomesCurtos, responsavelDoCliente, resumoLote } from "./lote";

const c = (id: string, razao: string, extra: Partial<Cliente> = {}): Cliente => ({
  id,
  org_id: "o",
  razao_social: razao,
  nome_fantasia: null,
  cnpj: null,
  regime: "simples",
  ativo: true,
  ...extra,
});
const clientes = [
  c("1", "Padaria São João Ltda", { cnpj: "12.345.678/0001-90", grupos: ["Varejo"] }),
  c("2", "Fênix Indústria", { regime: "real", codigo_dominio: "421" }),
  c("3", "CTZ Tour", { regime: "presumido", grupos: ["Transporte", "Varejo"] }),
  c("4", "Antiga Ltda", { ativo: false }),
];

describe("filtrarClientes", () => {
  it("só ativos e sem acento", () => {
    expect(filtrarClientes(clientes, { busca: "", regime: "", grupo: "" }).map((x) => x.id)).toEqual(["1", "2", "3"]);
    expect(filtrarClientes(clientes, { busca: "fenix", regime: "", grupo: "" }).map((x) => x.id)).toEqual(["2"]);
    expect(filtrarClientes(clientes, { busca: "sao joao", regime: "", grupo: "" }).map((x) => x.id)).toEqual(["1"]);
  });
  it("por CNPJ, código do Domínio, regime e grupo", () => {
    expect(filtrarClientes(clientes, { busca: "345678", regime: "", grupo: "" }).map((x) => x.id)).toEqual(["1"]);
    expect(filtrarClientes(clientes, { busca: "421", regime: "", grupo: "" }).map((x) => x.id)).toEqual(["2"]);
    expect(filtrarClientes(clientes, { busca: "", regime: "real", grupo: "" }).map((x) => x.id)).toEqual(["2"]);
    expect(filtrarClientes(clientes, { busca: "", regime: "", grupo: "Varejo" }).map((x) => x.id)).toEqual(["1", "3"]);
  });
});

describe("responsável", () => {
  const carteira = [{ cliente_id: "1", setor_id: "dp", user_id: "ana" }];
  it("o escolhido vale para todos", () => {
    expect(responsavelDoCliente("2", "joao", "dp", carteira)).toBe("joao");
    expect(responsavelDoCliente("2", "", "dp", carteira)).toBeNull();
  });
  it("o da carteira de cada cliente no setor", () => {
    expect(responsavelDoCliente("1", RESPONSAVEL_DA_CARTEIRA, "dp", carteira)).toBe("ana");
    expect(responsavelDoCliente("1", RESPONSAVEL_DA_CARTEIRA, "fiscal", carteira)).toBeNull();
    expect(responsavelDoCliente("2", RESPONSAVEL_DA_CARTEIRA, "dp", carteira)).toBeNull();
  });
});

describe("linhas e repetidos", () => {
  it("uma linha por cliente, sem repetir", () => {
    const l = linhasDoLote({ titulo: "Folha", org_id: "o" }, ["1", "2", "1"], (id) => (id === "1" ? "ana" : null));
    expect(l).toEqual([
      { titulo: "Folha", org_id: "o", cliente_id: "1", responsavel_id: "ana" },
      { titulo: "Folha", org_id: "o", cliente_id: "2", responsavel_id: null },
    ]);
  });
  it("já tem: mesmo título (sem diferenciar maiúscula/acento) e mesma competência", () => {
    const ex = [
      { cliente_id: "1", titulo: "Fechamento da folha", competencia: "2026-11-01" },
      { cliente_id: "2", titulo: "Fechamento da folha", competencia: "2026-10-01" },
      { cliente_id: null, titulo: "Fechamento da folha", competencia: "2026-11-01" },
    ];
    expect([...jaTem(ex, " FECHAMENTO DA FOLHA ", "2026-11-01")]).toEqual(["1"]);
  });
  it("frases", () => {
    expect(resumoLote(1, 0)).toBe("Tarefa criada para 1 cliente.");
    expect(resumoLote(12, 2)).toBe("Tarefa criada para 12 clientes (2 já tinham essa tarefa e ficaram de fora).");
    expect(nomesCurtos(clientes, ["1", "2", "3"], 2)).toBe("Padaria São João Ltda, Fênix Indústria e mais 1");
  });
});
