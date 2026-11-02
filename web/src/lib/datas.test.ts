// Testes de caracterização de lib/datas.ts: registram o comportamento atual antes da refatoração.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  diaNoFuso,
  diasAte,
  hojeISO,
  horaNoFuso,
  inicioDoDiaUtc,
  mesAnteriorISO,
  mesAtualISO,
  primeiroDiaDoProximoMes,
  rotuloPrazo,
  saudacao,
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

describe("fuso da organização", () => {
  it("diaNoFuso: 01h30 UTC ainda é o dia anterior em São Paulo", () => {
    expect(diaNoFuso("2026-11-01T01:30:00Z")).toBe("2026-10-31");
    expect(diaNoFuso("2026-11-01T03:00:00Z", "America/Sao_Paulo")).toBe("2026-11-01");
    expect(diaNoFuso("2026-11-01T01:30:00Z", "UTC")).toBe("2026-11-01");
  });
  it("horaNoFuso", () => {
    expect(horaNoFuso("America/Sao_Paulo", new Date("2026-11-01T12:30:00Z"))).toBe(9);
    expect(horaNoFuso("America/Manaus", new Date("2026-11-01T12:30:00Z"))).toBe(8);
    expect(horaNoFuso("UTC", new Date("2026-11-01T00:10:00Z"))).toBe(0);
  });
  it("inicioDoDiaUtc: meia-noite do dia no fuso, em UTC", () => {
    expect(inicioDoDiaUtc("2026-11-02")).toBe("2026-11-02T03:00:00.000Z");
    expect(inicioDoDiaUtc("2026-11-02", "America/Manaus")).toBe("2026-11-02T04:00:00.000Z");
    expect(inicioDoDiaUtc("2026-11-02", "UTC")).toBe("2026-11-02T00:00:00.000Z");
    // com horário de verão (Nova York muda em 01/11/2026)
    expect(inicioDoDiaUtc("2026-07-01", "America/New_York")).toBe("2026-07-01T04:00:00.000Z");
    expect(inicioDoDiaUtc("2026-12-01", "America/New_York")).toBe("2026-12-01T05:00:00.000Z");
  });
});

describe("saudacao (regra única do HUB)", () => {
  it("5h às 11h59 bom dia; 12h às 17h59 boa tarde; senão boa noite", () => {
    expect([0, 4, 5, 11, 12, 17, 18, 23].map(saudacao)).toEqual([
      "Boa noite",
      "Boa noite",
      "Bom dia",
      "Bom dia",
      "Boa tarde",
      "Boa tarde",
      "Boa noite",
      "Boa noite",
    ]);
  });
});
