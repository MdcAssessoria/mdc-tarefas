// Testes da carteira de pedidos do BI (117).
import { describe, expect, it } from "vitest";
import { carteiraPorMes, faixasPrevisao, filtrarPedidos, resumirCarteira, situacao, volumePorCliente } from "./carteira";
import type { PedidoCarteira } from "./carteira";

const base: PedidoCarteira = {
  cliente_id: "c1",
  empresa: "Clara",
  codigo_pedido: "1",
  numero: "100",
  numero_cliente: null,
  cliente_doc: "11222333000181",
  cliente_nome: "Metalúrgica Alfa",
  etapa: "10",
  etapa_nome: "Pedido de venda",
  inclusao: "2026-11-02",
  previsao: "2026-11-30",
  faturado: false,
  faturamento: null,
  valor: "1000",
  quantidade: 10,
  itens: 1,
};
const hoje = "2026-11-24";
const ps: PedidoCarteira[] = [
  base,
  { ...base, codigo_pedido: "2", numero: "101", previsao: "2026-11-10", valor: 500 }, // atrasado
  { ...base, codigo_pedido: "3", numero: "102", faturado: true, faturamento: "2026-11-15", valor: 2000 }, // atendido
  { ...base, codigo_pedido: "4", numero: "103", inclusao: "2026-09-01", previsao: "2027-01-15", valor: 300, cliente_doc: "99888777000166", cliente_nome: "Beta Ltda" },
  { ...base, codigo_pedido: "5", numero: "104", inclusao: "2026-09-01", previsao: null, valor: 100, cliente_doc: null, cliente_nome: null },
];

describe("situação e resumo", () => {
  it("atendido, atrasado e em carteira", () => {
    expect(ps.map((p) => situacao(p, hoje))).toEqual(["carteira", "atrasado", "atendido", "carteira", "carteira"]);
  });
  it("resumo do período de novembro", () => {
    const r = resumirCarteira(ps, "2026-11-01", "2026-11-30", hoje);
    expect(r.periodo).toEqual({ qtd: 3, valor: 3500 });
    expect(r.atendidos).toEqual({ qtd: 1, valor: 2000 });
    expect(r.pctAtendido).toBeCloseTo(2000 / 3500, 6);
    expect(r.carteira).toEqual({ qtd: 4, valor: 1900 });
    expect(r.atrasados).toEqual({ qtd: 1, valor: 500 });
    expect(r.faturadoNoPeriodo).toEqual({ qtd: 1, valor: 2000 });
  });
  it("sem pedidos no período, sem percentual", () => {
    expect(resumirCarteira(ps, "2025-01-01", "2025-01-31", hoje).pctAtendido).toBeNull();
  });
});

describe("previsão de entrega", () => {
  it("faixas da carteira", () => {
    const f = Object.fromEntries(faixasPrevisao(ps, hoje).map((x) => [x.id, x.valor]));
    expect(f).toEqual({ atrasado: 500, semana: 1000, mes: 0, proximo: 0, depois: 300, sem: 100 });
  });
  it("por mês de previsão", () => {
    expect(carteiraPorMes(ps)).toEqual([
      { mes: "2026-11", qtd: 2, valor: 1500 },
      { mes: "2027-01", qtd: 1, valor: 300 },
    ]);
  });
});

describe("volume por cliente e busca", () => {
  it("agrupa pelo documento e ordena pelo volume", () => {
    const v = volumePorCliente(ps, "2026-11-01", "2026-11-30", hoje);
    expect(v[0]).toMatchObject({ cliente: "Metalúrgica Alfa", pedidosPeriodo: 3, valorPeriodo: 3500, atendidoPeriodo: 2000, carteira: 1500, atrasado: 500, proximaPrevisao: "2026-11-30" });
    expect(v.map((x) => x.cliente)).toEqual(["Metalúrgica Alfa", "Beta Ltda", "Cliente sem cadastro"]);
  });
  it("busca por cliente sem acento, número e CNPJ", () => {
    expect(filtrarPedidos(ps, "metalurgica").length).toBe(3);
    expect(filtrarPedidos(ps, "103").map((p) => p.codigo_pedido)).toEqual(["4"]);
    expect(filtrarPedidos(ps, "99.888.777").map((p) => p.codigo_pedido)).toEqual(["4"]);
  });
});
