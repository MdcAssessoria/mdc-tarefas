// Testes dos formatadores de lib/formato (datas, moeda e números).
import { describe, expect, it } from "vitest";
import { fmtCompetencia, fmtData, fmtDataHora, fmtDataLocal, mesAno, mesExtenso } from "./datas";
import { brl } from "./moeda";
import { fmtIndice, fmtNumero, fmtPercentual } from "./numero";

const NBSP = " ";

describe("datas", () => {
  it("fmtData usa o dia escrito, sem converter fuso", () => {
    expect(fmtData("2026-03-05")).toBe("05/03/2026");
    expect(fmtData("2026-03-05T23:59:00-03:00")).toBe("05/03/2026");
    expect(fmtData(null)).toBe("—");
    expect(fmtData("")).toBe("—");
  });
  it("fmtCompetencia", () => {
    expect(fmtCompetencia("2026-09-01")).toBe("09/2026");
    expect(fmtCompetencia("2026-09")).toBe("09/2026");
    expect(fmtCompetencia(null)).toBe("");
  });
  it("mesAno e mesExtenso", () => {
    expect(mesAno("2026-09-01")).toBe("set/26");
    expect(mesAno("2026-01")).toBe("jan/26");
    expect(mesExtenso("2026-09-01")).toBe("setembro de 2026");
  });
  it("fmtDataLocal e fmtDataHora devolvem o formato brasileiro", () => {
    expect(fmtDataLocal("2026-03-05T15:00:00Z")).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(fmtDataLocal(null)).toBe("—");
    expect(fmtDataHora("2026-10-30T15:45:00Z")).toMatch(/^\d{2}\/\d{2}\/\d{4},? \d{2}:\d{2}$/);
  });
});

describe("brl", () => {
  it("com centavos por padrão", () => {
    expect(brl(1234.5)).toBe(`R$${NBSP}1.234,50`);
    expect(brl(-10)).toBe(`-R$${NBSP}10,00`);
    expect(brl(0)).toBe(`R$${NBSP}0,00`);
  });
  it("sem centavos (visual dos demonstrativos)", () => {
    expect(brl(1234.56, { centavos: false })).toBe(`R$${NBSP}1.235`);
    expect(brl(-1500, { centavos: false })).toBe(`-R$${NBSP}1.500`);
  });
  it("vazio vira travessão", () => {
    expect(brl(null)).toBe("—");
    expect(brl(undefined, { centavos: false })).toBe("—");
  });
});

describe("números", () => {
  it("fmtNumero", () => {
    expect(fmtNumero(1234.5)).toBe("1.234,50");
    expect(fmtNumero(1.005, 1)).toBe("1,0");
    expect(fmtNumero(3, 0)).toBe("3");
  });
  it("fmtPercentual", () => {
    expect(fmtPercentual(0.1234)).toBe("12,3%");
    expect(fmtPercentual(0.5)).toBe("50%");
    expect(fmtPercentual(null)).toBe("—");
    expect(fmtPercentual(NaN)).toBe("—");
  });
  it("fmtIndice por formato", () => {
    expect(fmtIndice(1.234, "x")).toBe("1,23");
    expect(fmtIndice(0.1234, "%")).toBe("12,3%");
    expect(fmtIndice(45.6, "dias")).toBe("46 dias");
    expect(fmtIndice(-1500, "R$")).toBe(`-R$${NBSP}1.500`);
    expect(fmtIndice(null, "x")).toBe("—");
    expect(fmtIndice(Infinity, "x")).toBe("—");
  });
});
