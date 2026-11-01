import { describe, expect, it } from "vitest";
import {
  dividirParcelas,
  documentoValido,
  fimDoMes,
  formatarDocumento,
  intervaloDoPeriodo,
  numeroBr,
  saldoDoTitulo,
  situacaoDoTitulo,
  somarMesesData,
} from "./regras";

describe("CPF e CNPJ", () => {
  it("aceita documentos com dígitos certos, com ou sem máscara", () => {
    expect(documentoValido("48.140.121/0001-65")).toBe(true);
    expect(documentoValido("11222333000181")).toBe(true);
    expect(documentoValido("529.982.247-25")).toBe(true);
  });
  it("recusa dígito errado, repetidos e tamanho errado", () => {
    expect(documentoValido("48.140.121/0001-66")).toBe(false);
    expect(documentoValido("111.111.111-11")).toBe(false);
    expect(documentoValido("123")).toBe(false);
  });
  it("formata", () => {
    expect(formatarDocumento("48140121000165")).toBe("48.140.121/0001-65");
    expect(formatarDocumento("52998224725")).toBe("529.982.247-25");
  });
});

describe("valores digitados", () => {
  it("lê o formato brasileiro", () => {
    expect(numeroBr("1.234,56")).toBe(1234.56);
    expect(numeroBr("R$ 10,5")).toBe(10.5);
    expect(numeroBr("")).toBe(0);
    expect(numeroBr("abc")).toBeNaN();
  });
  it("ponto sem vírgula é milhar (auditoria A-1: '1.250' virava R$ 1,25)", () => {
    expect(numeroBr("1.250")).toBe(1250);
    expect(numeroBr("1.000")).toBe(1000);
    expect(numeroBr("12.345.678")).toBe(12345678);
    expect(numeroBr("-1.500")).toBe(-1500);
    expect(numeroBr("1250.5")).toBe(1250.5);
    expect(numeroBr("0.35")).toBe(0.35);
    expect(numeroBr("0.500")).toBe(0.5); // auditoria N-1: kg/litro colado com ponto
    expect(numeroBr("0.250")).toBe(0.25);
    expect(numeroBr("-0.750")).toBe(-0.75);
    expect(numeroBr("2,5")).toBe(2.5);
  });
});

describe("período", () => {
  const hoje = "2026-11-01";
  it("este mês e mês passado com datas completas (antes saía '2026-11', data inválida)", () => {
    expect(intervaloDoPeriodo("mes", hoje)).toEqual({ de: "2026-11-01", ate: "2026-11-30" });
    expect(intervaloDoPeriodo("anterior", hoje)).toEqual({ de: "2026-10-01", ate: "2026-10-31" });
    expect(intervaloDoPeriodo("anterior", "2026-01-15")).toEqual({ de: "2025-12-01", ate: "2025-12-31" });
    expect(intervaloDoPeriodo("proximo", "2028-01-10")).toEqual({ de: "2028-02-01", ate: "2028-02-29" });
  });
  it("tudo não limita; escolher usa as datas", () => {
    expect(intervaloDoPeriodo("tudo", hoje)).toEqual({});
    expect(intervaloDoPeriodo("escolher", hoje, "2026-01-01", "")).toEqual({ de: "2026-01-01", ate: undefined });
  });
  it("fim do mês", () => {
    expect(fimDoMes("2026-02")).toBe("2026-02-28");
    expect(fimDoMes("2026-12-05")).toBe("2026-12-31");
  });
});

describe("parcelas", () => {
  it("divide e põe os centavos na última (igual ao banco)", () => {
    const p = dividirParcelas(1000, 3, "2026-01-31");
    expect(p.map((x) => x.valor)).toEqual([333.33, 333.33, 333.34]);
    expect(p.map((x) => x.vencimento)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(p.reduce((a, x) => a + x.valor, 0)).toBeCloseTo(1000, 2);
  });
  it("mesmo dia no mês seguinte", () => {
    expect(somarMesesData("2026-11-10", 2)).toBe("2027-01-10");
  });
});

describe("situação do título", () => {
  const hoje = "2026-11-01";
  const t = { situacao: "aberto" as const, vencimento: "2026-11-05", valor: 100, valor_pago: 0 };
  it("a vencer, vence hoje, vencido, pago em parte", () => {
    expect(situacaoDoTitulo(t, hoje)).toBe("a_vencer");
    expect(situacaoDoTitulo({ ...t, vencimento: hoje }, hoje)).toBe("vence_hoje");
    expect(situacaoDoTitulo({ ...t, vencimento: "2026-10-31" }, hoje)).toBe("vencido");
    expect(situacaoDoTitulo({ ...t, valor_pago: 30 }, hoje)).toBe("parcial");
    expect(situacaoDoTitulo({ ...t, valor_pago: 30, vencimento: "2026-10-01" }, hoje)).toBe("vencido");
  });
  it("saldo", () => {
    expect(saldoDoTitulo({ ...t, valor_pago: 30.1 })).toBe(69.9);
    expect(saldoDoTitulo({ ...t, situacao: "cancelado" })).toBe(0);
  });
});
