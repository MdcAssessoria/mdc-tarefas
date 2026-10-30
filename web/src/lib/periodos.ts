// Agregação dos balancetes mensais em trimestre, semestre ou ano (DRE e DFC somadas,
// balanço do último mês contra a abertura do primeiro, índices refeitos sobre o período).
import type { Dre, Indices, Resumo } from "./balancete";
import { cruzar, saude, somarDfc, somarDre } from "./demonstracoes";
import type { Balanco, Cruzamento, Demonstracoes, Dfc, Saude } from "./demonstracoes";

export type TipoPeriodo = "mensal" | "trimestral" | "semestral" | "anual";
export const TIPOS_PERIODO: { id: TipoPeriodo; nome: string; meses: number }[] = [
  { id: "mensal", nome: "Mensal", meses: 1 },
  { id: "trimestral", nome: "Trimestral", meses: 3 },
  { id: "semestral", nome: "Semestral", meses: 6 },
  { id: "anual", nome: "Anual", meses: 12 },
];

interface RegMinimo {
  competencia: string;
  resumo: Resumo;
  indices: Indices;
  demonstracoes?: Demonstracoes | null;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const ym = (c: string) => c.slice(0, 7);

/** Janela do período que termina na competência escolhida. */
export function janela(competencia: string, tipo: TipoPeriodo) {
  const ano = Number(competencia.slice(0, 4));
  const mes = Number(competencia.slice(5, 7));
  const tam = TIPOS_PERIODO.find((t) => t.id === tipo)!.meses;
  const iniMes = Math.floor((mes - 1) / tam) * tam + 1;
  const fimMes = iniMes + tam - 1;
  const inicio = `${ano}-${String(iniMes).padStart(2, "0")}`;
  const esperados = mes - iniMes + 1;
  const parcial = mes < fimMes;
  const intervalo = iniMes === mes ? MESES[mes - 1] : `${MESES[iniMes - 1]}–${MESES[mes - 1]}`;
  const rotulo =
    tipo === "mensal" ? `${MESES[mes - 1]}/${ano}`
    : tipo === "trimestral" ? `${Math.ceil(mes / 3)}º trimestre/${ano} (${intervalo})`
    : tipo === "semestral" ? `${Math.ceil(mes / 6)}º semestre/${ano} (${intervalo})`
    : `${ano} (${intervalo})`;
  return { inicio, fim: ym(competencia), esperados, parcial, rotulo };
}

export interface Agregado {
  tipo: TipoPeriodo;
  rotulo: string;
  meses: string[];
  completo: boolean; // todos os meses da janela importados
  parcial: boolean; // a janela ainda não terminou (ex.: trimestre até agosto)
  dre: Dre;
  dfc: Dfc | null;
  resumo: Resumo;
  indices: Indices;
  saude: Saude | null;
  cruzamento: Cruzamento | null;
  balanco: Balanco | null;
}

const div = (a: number, b: number) => (b ? a / b : null);

/** Junta os meses do período (só funciona com balancetes mensais). */
export function agregar<T extends RegMinimo>(atual: T, historico: T[], tipo: TipoPeriodo): Agregado {
  const j = janela(atual.competencia, tipo);
  const meses = historico
    .filter((b) => ym(b.competencia) >= j.inicio && ym(b.competencia) <= j.fim)
    .sort((a, b) => a.competencia.localeCompare(b.competencia));
  if (!meses.some((b) => b.competencia === atual.competencia)) meses.push(atual);
  const dre = tipo === "mensal" ? atual.resumo.mes : somarDre(meses.map((b) => b.resumo.mes));
  const dfcs = meses.map((b) => b.demonstracoes?.dfc).filter((x): x is Dfc => !!x);
  const dfc = tipo === "mensal" ? (atual.demonstracoes?.dfc ?? null) : dfcs.length === meses.length ? somarDfc(dfcs) : null;
  const resumo: Resumo = { ...atual.resumo, mes: dre };

  // índices: balanço do fim do período; margens e carga sobre a DRE do período; prazos ponderados pelos meses
  const i = atual.indices;
  const media = (k: keyof Indices) => {
    const v = meses.map((b) => b.indices[k] as number | null | undefined).filter((x): x is number => x != null && Number.isFinite(x));
    return v.length ? Math.round(v.reduce((a, x) => a + x, 0) / v.length) : null;
  };
  const indices: Indices =
    tipo === "mensal"
      ? i
      : {
          ...i,
          margem_bruta: div(dre.lucro_bruto, dre.receita_liquida),
          margem_operacional: div(dre.resultado_operacional, dre.receita_liquida),
          margem_liquida: div(dre.lucro_liquido, dre.receita_liquida),
          roe: resumo.pl + resumo.resultado_exercicio > 0 ? div(dre.lucro_liquido, resumo.pl + resumo.resultado_exercicio) : null,
          carga_tributaria: div(dre.deducoes + dre.ir_csll, dre.receita_bruta),
          pmr: media("pmr"),
          pmp: media("pmp"),
          pme: media("pme"),
          pmv: media("pmv"),
          ciclo_operacional: media("ciclo_operacional"),
          ciclo_financeiro: media("ciclo_financeiro"),
        };

  // balanço: abertura do primeiro mês × fechamento do último
  let balanco: Balanco | null = atual.demonstracoes?.balanco ?? null;
  const primeiro = meses[0]?.demonstracoes?.balanco;
  if (tipo !== "mensal" && balanco && primeiro) {
    const abertura = (lado: "ativo" | "passivo") => new Map(primeiro[lado].map((l) => [l.classificacao + "|" + l.rotulo, l.anterior]));
    const aA = abertura("ativo"), aP = abertura("passivo");
    balanco = {
      ativo: balanco.ativo.map((l) => ({ ...l, anterior: aA.get(l.classificacao + "|" + l.rotulo) ?? 0 })),
      passivo: balanco.passivo.map((l) => ({ ...l, anterior: aP.get(l.classificacao + "|" + l.rotulo) ?? 0 })),
      total_ativo: { atual: balanco.total_ativo.atual, anterior: primeiro.total_ativo.anterior },
      total_passivo: { atual: balanco.total_passivo.atual, anterior: primeiro.total_passivo.anterior },
    };
  }

  return {
    tipo,
    rotulo: j.rotulo,
    meses: meses.map((b) => b.competencia),
    completo: meses.length === j.esperados,
    parcial: j.parcial,
    dre,
    dfc,
    resumo,
    indices,
    saude: dfc ? saude(resumo, indices, dfc) : (atual.demonstracoes?.saude ?? null),
    cruzamento: dfc ? cruzar(dre, dfc) : null,
    balanco,
  };
}

/** Série histórica agrupada por período (para os gráficos de evolução). */
export function serieAgrupada<T extends RegMinimo>(historico: T[], tipo: TipoPeriodo, ate: string, max = 12) {
  const tam = TIPOS_PERIODO.find((t) => t.id === tipo)!.meses;
  const grupos = new Map<string, T[]>();
  for (const b of [...historico].filter((x) => x.competencia <= ate).sort((a, c) => a.competencia.localeCompare(c.competencia))) {
    const ano = b.competencia.slice(0, 4), mes = Number(b.competencia.slice(5, 7));
    const n = Math.floor((mes - 1) / tam) + 1;
    const chave = tipo === "mensal" ? `${MESES[mes - 1]}/${ano.slice(2)}` : tipo === "anual" ? ano : `${n}${tipo === "trimestral" ? "T" : "S"}/${ano.slice(2)}`;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave)!.push(b);
  }
  return [...grupos.entries()].slice(-max).map(([rotulo, bs]) => {
    const dfcs = bs.map((b) => b.demonstracoes?.dfc).filter((x): x is Dfc => !!x);
    return {
      rotulo,
      dre: somarDre(bs.map((b) => b.resumo.mes)),
      fco: dfcs.length === bs.length ? dfcs.reduce((a, d) => a + d.fco, 0) : null,
      disponivel: bs[bs.length - 1].resumo.disponivel,
    };
  });
}
