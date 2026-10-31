// Testes da visão por período do calendário (selecaoPeriodo.ts): trimestre completo e incompleto, ano com 12 meses,
// balancete acumulado do ano inteiro e dois anos com comparação ao mesmo período do ano anterior.
import { describe, expect, it } from "vitest";
import { MATRIZ_BALANCETE } from "@/dominios/demonstrativos/__testes__/balanceteExemplo";
import { calcularIndices } from "@/dominios/demonstrativos/balancete/indices";
import { classificar } from "@/dominios/demonstrativos/balancete/classificacao";
import { lerBalancete } from "@/dominios/demonstrativos/balancete/leitura";
import { resumir } from "@/dominios/demonstrativos/balancete/resumo";
import {
  anosDisponiveis,
  escolhaPadrao,
  listarMeses,
  mesesDoPeriodo,
  mesmoPeriodoAnoAnterior,
  normalizar,
  opcoesDoAno,
  selecionar,
  serieDaVisao,
  trocarVisao,
  visoesDoAno,
} from "./selecaoPeriodo";

// o balancete de exemplo tem receita bruta de 6.000 e lucro líquido de 2.200 no mês (fator multiplica o movimento)
function registro(competencia: string, fator = 1, periodo_inicio: string | null = null) {
  const linhas = classificar(lerBalancete(MATRIZ_BALANCETE).linhas);
  for (const l of linhas) {
    l.debitos *= fator;
    l.creditos *= fator;
  }
  const resumo = resumir(linhas);
  return { competencia, resumo, indices: calcularIndices(resumo), periodo_inicio: periodo_inicio ?? competencia };
}
const meses = (ano: number, de: number, ate: number) =>
  Array.from({ length: ate - de + 1 }, (_, k) => registro(`${ano}-${String(de + k).padStart(2, "0")}-01`));

describe("mesesDoPeriodo e textos", () => {
  it("períodos fixos do calendário", () => {
    expect(mesesDoPeriodo({ ano: 2024, visao: "trimestral", numero: 1 })).toEqual(["2024-01", "2024-02", "2024-03"]);
    expect(mesesDoPeriodo({ ano: 2024, visao: "semestral", numero: 1 })).toHaveLength(6);
    expect(mesesDoPeriodo({ ano: 2024, visao: "anual", numero: 1 })).toHaveLength(12);
    expect(mesesDoPeriodo({ ano: 2024, visao: "mensal", numero: 3 })).toEqual(["2024-03"]);
  });
  it("lista meses em linguagem simples", () => {
    expect(listarMeses(["2024-03"])).toBe("mar/2024");
    expect(listarMeses(["2024-02", "2024-03"])).toBe("fev e mar/2024");
    expect(listarMeses(["2024-01", "2024-02", "2024-03", "2024-04", "2024-05"])).toBe("5 meses");
  });
});

describe("trimestre", () => {
  it("completo: soma a DRE dos três meses e usa o balanço de março", () => {
    const h = [registro("2024-01-01"), registro("2024-02-01", 2), registro("2024-03-01"), registro("2024-04-01")];
    const s = selecionar(h, { ano: 2024, visao: "trimestral", numero: 1 })!;
    expect(s.rotulo).toBe("1º trimestre de 2024");
    expect(s.fonte).toBe("mensal");
    expect(s.completo).toBe(true);
    expect(s.completude).toBe("3 de 3 meses importados");
    expect(s.registros.map((r) => r.competencia)).toEqual(["2024-01-01", "2024-02-01", "2024-03-01"]);
    expect(s.base.competencia).toBe("2024-03-01");
    expect(s.ag.dre.receita_bruta).toBe(24000);
    expect(s.ag.dre.lucro_liquido).toBe(8800);
    expect(s.ag.indices.margem_liquida).toBeCloseTo(8800 / 22800);
  });
  it("incompleto: diz o mês que falta e soma só o que existe", () => {
    const h = [registro("2024-01-01"), registro("2024-02-01")];
    const s = selecionar(h, { ano: 2024, visao: "trimestral", numero: 1 })!;
    expect(s.completo).toBe(false);
    expect(s.faltam).toEqual(["2024-03"]);
    expect(s.completude).toBe("2 de 3 meses importados · falta mar/2024");
    expect(s.base.competencia).toBe("2024-02-01");
    expect(s.ag.dre.receita_bruta).toBe(12000);
    expect(s.ag.completo).toBe(false);
  });
  it("sem dado: opção desabilitada com o porquê e seleção nula", () => {
    const h = [registro("2024-01-01")];
    const ops = opcoesDoAno(h, 2024, "trimestral");
    expect(ops.map((o) => o.disponivel)).toEqual([true, false, false, false]);
    expect(ops[1].motivo).toBe("nenhum balancete importado neste período");
    expect(selecionar(h, { ano: 2024, visao: "trimestral", numero: 2 })).toBeNull();
  });
});

describe("ano com 12 meses", () => {
  it("soma os 12 meses e fica completo; balanço é o de dezembro", () => {
    const h = meses(2024, 1, 12);
    const s = selecionar(h, { ano: 2024, visao: "anual", numero: 1 })!;
    expect(s.completo).toBe(true);
    expect(s.completude).toBe("12 de 12 meses importados");
    expect(s.ag.dre.receita_bruta).toBe(72000);
    expect(s.base.competencia).toBe("2024-12-01");
    expect(s.ag.resumo.disponivel).toBe(h[11].resumo.disponivel);
    expect(visoesDoAno(h, 2024).every((v) => v.disponivel)).toBe(true);
  });
  it("trocar a visão fica no período que contém o último mês", () => {
    const h = meses(2024, 1, 12);
    expect(trocarVisao(h, { ano: 2024, visao: "mensal", numero: 5 }, "trimestral")).toEqual({ ano: 2024, visao: "trimestral", numero: 2 });
    expect(trocarVisao(h, { ano: 2024, visao: "trimestral", numero: 2 }, "mensal")).toEqual({ ano: 2024, visao: "mensal", numero: 6 });
  });
});

describe("balancete acumulado do ano inteiro", () => {
  const acumulado = registro("2025-12-01", 12, "2025-01-01");
  it("na visão Ano usa o próprio balancete", () => {
    const s = selecionar([acumulado], { ano: 2025, visao: "anual", numero: 1 })!;
    expect(s.fonte).toBe("acumulado");
    expect(s.completo).toBe(true);
    expect(s.completude).toBe("Balancete acumulado de jan a dez/2025, enviado de uma vez");
    expect(s.ag.dre.receita_bruta).toBe(72000);
    expect(s.ag.indices).toBe(acumulado.indices);
    expect(s.inicio).toBe("2025-01-01");
  });
  it("mês, trimestre e semestre ficam indisponíveis com a explicação", () => {
    const v = visoesDoAno([acumulado], 2025);
    expect(v.map((x) => [x.id, x.disponivel])).toEqual([
      ["mensal", false],
      ["trimestral", false],
      ["semestral", false],
      ["anual", true],
    ]);
    expect(v[0].motivo).toMatch(/balancete do ano inteiro de uma vez/);
    expect(selecionar([acumulado], { ano: 2025, visao: "mensal", numero: 3 })).toBeNull();
  });
  it("a escolha padrão e a normalização vão para a visão Ano", () => {
    expect(escolhaPadrao([acumulado], "mensal")).toEqual({ ano: 2025, visao: "anual", numero: 1 });
    expect(normalizar([acumulado], { ano: 2025, visao: "trimestral", numero: 4 })).toEqual({ ano: 2025, visao: "anual", numero: 1 });
  });
});

describe("dois anos", () => {
  const h = [...meses(2023, 1, 12), ...meses(2024, 1, 3).map((r, k) => (k === 1 ? registro(r.competencia, 2) : r))];
  it("lista os anos e compara com o mesmo período do ano anterior", () => {
    expect(anosDisponiveis(h)).toEqual([2024, 2023]);
    const e = { ano: 2024, visao: "trimestral" as const, numero: 1 };
    const atual = selecionar(h, e)!;
    const anterior = mesmoPeriodoAnoAnterior(h, e)!;
    expect(anterior.rotulo).toBe("1º trimestre de 2023");
    expect(anterior.ag.dre.receita_bruta).toBe(18000);
    expect(atual.ag.dre.receita_bruta).toBe(24000);
    expect(mesmoPeriodoAnoAnterior(h, { ...e, ano: 2023 })).toBeNull();
  });
  it("escolha padrão é o último período com dado; série vai até o fim do período", () => {
    expect(escolhaPadrao(h, "trimestral")).toEqual({ ano: 2024, visao: "trimestral", numero: 1 });
    expect(escolhaPadrao(h, "mensal", "2023-07-01")).toEqual({ ano: 2023, visao: "mensal", numero: 7 });
    const s = serieDaVisao(h, { ano: 2024, visao: "trimestral", numero: 1 });
    expect(s.map((x) => x.rotulo)).toEqual(["1T/23", "2T/23", "3T/23", "4T/23", "1T/24"]);
    expect(s.at(-1)!.dre.receita_bruta).toBe(24000);
  });
  it("ano que não existe volta para o mais recente", () => {
    expect(normalizar(h, { ano: 2030, visao: "mensal", numero: 1 })).toEqual({ ano: 2024, visao: "mensal", numero: 3 });
  });
});
