// Testes de caracterização de lib/periodos.ts (janelas trimestre/semestre/ano e agregação dos meses).
import { describe, expect, it } from "vitest";
import { MATRIZ_BALANCETE } from "./__testes__/balanceteExemplo";
import { calcularIndices, classificar, lerBalancete, resumir } from "./balancete";
import { agregar, janela, serieAgrupada } from "./periodos";

describe("janela", () => {
  it("mensal", () => {
    expect(janela("2026-09-01", "mensal")).toEqual({ inicio: "2026-09", fim: "2026-09", esperados: 1, parcial: false, rotulo: "set/2026" });
  });
  it("trimestre completo e parcial", () => {
    expect(janela("2026-09-01", "trimestral")).toEqual({
      inicio: "2026-07",
      fim: "2026-09",
      esperados: 3,
      parcial: false,
      rotulo: "3º trimestre/2026 (jul–set)",
    });
    expect(janela("2026-08-01", "trimestral")).toEqual({
      inicio: "2026-07",
      fim: "2026-08",
      esperados: 2,
      parcial: true,
      rotulo: "3º trimestre/2026 (jul–ago)",
    });
  });
  it("semestre e ano", () => {
    expect(janela("2026-07-01", "semestral").rotulo).toBe("2º semestre/2026 (jul)");
    expect(janela("2026-10-01", "anual")).toEqual({
      inicio: "2026-01",
      fim: "2026-10",
      esperados: 10,
      parcial: true,
      rotulo: "2026 (jan–out)",
    });
  });
});

function registro(competencia: string, fator = 1) {
  const linhas = classificar(lerBalancete(MATRIZ_BALANCETE).linhas);
  for (const l of linhas) {
    l.debitos *= fator;
    l.creditos *= fator;
  }
  const resumo = resumir(linhas);
  return { competencia, resumo, indices: calcularIndices(resumo) };
}

describe("agregar", () => {
  it("mensal devolve o próprio mês", () => {
    const set = registro("2026-09-01");
    const a = agregar(set, [set], "mensal");
    expect(a.meses).toEqual(["2026-09-01"]);
    expect(a.dre).toBe(set.resumo.mes);
    expect(a.indices).toBe(set.indices);
    expect(a.completo).toBe(true);
    expect(a.dfc).toBeNull();
  });
  it("trimestral soma a DRE dos meses da janela e refaz as margens", () => {
    const jul = registro("2026-07-01"),
      ago = registro("2026-08-01", 2),
      set = registro("2026-09-01");
    const a = agregar(set, [set, jul, ago, registro("2026-06-01")], "trimestral");
    expect(a.meses).toEqual(["2026-07-01", "2026-08-01", "2026-09-01"]);
    expect(a.completo).toBe(true);
    expect(a.rotulo).toBe("3º trimestre/2026 (jul–set)");
    expect(a.dre.receita_bruta).toBe(24000);
    expect(a.dre.lucro_liquido).toBe(8800);
    expect(a.indices.margem_liquida).toBeCloseTo(8800 / 22800);
  });
});

describe("serieAgrupada", () => {
  it("agrupa por trimestre com rótulo curto", () => {
    const s = serieAgrupada([registro("2026-07-01"), registro("2026-08-01"), registro("2026-10-01")], "trimestral", "2026-12-01");
    expect(s.map((x) => [x.rotulo, x.dre.receita_bruta, x.fco])).toEqual([
      ["3T/26", 12000, null],
      ["4T/26", 6000, null],
    ]);
  });
});
