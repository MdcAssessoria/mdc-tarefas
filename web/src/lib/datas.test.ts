// Testes de caracterização de lib/datas.ts: registram o comportamento atual antes da refatoração.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  diasAte,
  fmtCompetencia,
  fmtData,
  fmtDataHora,
  hojeISO,
  mesAnteriorISO,
  mesAtualISO,
  primeiroDiaDoProximoMes,
  rotuloPrazo,
  somarDias,
  somarMeses,
} from "./datas";

afterEach(() => vi.useRealTimers());

describe("hojeISO", () => {
  it("usa o fuso da organização, não o UTC (22h30 em Brasília ainda é o mesmo dia)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-31T01:30:00Z"));
    expect(hojeISO()).toBe("2026-10-30");
    expect(hojeISO("America/Sao_Paulo")).toBe("2026-10-30");
    expect(hojeISO("UTC")).toBe("2026-10-31");
  });
});

describe("diasAte", () => {
  it("conta dias corridos a partir de hoje no fuso", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-31T01:30:00Z")); // 30/10 em Brasília
    expect(diasAte(null)).toBeNull();
    expect(diasAte("2026-10-30")).toBe(0);
    expect(diasAte("2026-11-02")).toBe(3);
    expect(diasAte("2026-10-25")).toBe(-5);
  });
});

describe("fmtData e fmtCompetencia", () => {
  it("convertem AAAA-MM-DD para o formato brasileiro", () => {
    expect(fmtData(null)).toBe("—");
    expect(fmtData("2026-03-05")).toBe("05/03/2026");
    expect(fmtData("2026-03-05T10:00:00Z")).toBe("05/03/2026");
    expect(fmtCompetencia(null)).toBe("");
    expect(fmtCompetencia("2026-09-01")).toBe("09/2026");
    expect(fmtCompetencia("2026-09")).toBe("09/2026");
  });
});

describe("rotuloPrazo", () => {
  it("descreve o prazo em palavras", () => {
    expect(rotuloPrazo(null)).toBe("Sem prazo");
    expect(rotuloPrazo(-3)).toBe("Atrasada 3 dias");
    expect(rotuloPrazo(-1)).toBe("Atrasada 1 dia");
    expect(rotuloPrazo(0)).toBe("Vence hoje");
    expect(rotuloPrazo(1)).toBe("Amanhã");
    expect(rotuloPrazo(10)).toBe("Em 10 dias");
  });
});

describe("fmtDataHora", () => {
  it("mostra data e hora curtas em pt-BR (no fuso do navegador)", () => {
    expect(fmtDataHora("2026-10-30T15:45:00Z")).toMatch(/^\d{2}\/\d{2}\/\d{4},? \d{2}:\d{2}$/);
  });
});

describe("mesAnteriorISO (competência padrão de 'Gerar tarefas')", () => {
  const em = (iso: string) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
  };
  it("dia 31 seguido de mês mais curto continua no mês anterior (antes virava o mês atual)", () => {
    em("2026-05-31T15:00:00Z");
    expect(mesAnteriorISO()).toBe("2026-04");
    em("2026-03-31T15:00:00Z");
    expect(mesAnteriorISO()).toBe("2026-02");
  });
  it("vira o ano em janeiro", () => {
    em("2026-01-15T15:00:00Z");
    expect(mesAnteriorISO()).toBe("2025-12");
  });
  it("usa o fuso da organização (00h30 UTC de 01/06 ainda é 31/05 em Brasília)", () => {
    em("2026-06-01T00:30:00Z");
    expect(mesAnteriorISO("America/Sao_Paulo")).toBe("2026-04");
    expect(mesAnteriorISO("UTC")).toBe("2026-05");
  });
});

describe("somarMeses, somarDias e primeiroDiaDoProximoMes", () => {
  it("trabalham só com texto AAAA-MM(-DD), sem fuso", () => {
    expect(somarMeses("2026-01", -1)).toBe("2025-12");
    expect(somarMeses("2026-11", 3)).toBe("2027-02");
    expect(somarDias("2026-02-27", 2)).toBe("2026-03-01");
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
    expect(primeiroDiaDoProximoMes("2026-12-31")).toBe("2027-01-01");
  });
  it("mesAtualISO no fuso", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T01:00:00Z"));
    expect(mesAtualISO()).toBe("2026-10");
  });
});
