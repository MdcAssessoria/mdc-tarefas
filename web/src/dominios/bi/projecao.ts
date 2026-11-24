// BI de Gestão › Projeção: estudo da DRE para os anos seguintes (até 5), a partir do realizado do ano-base.
// Cada linha analítica da DRE projeta por um de dois modos:
//   • crescimento: valor do ano anterior × (1 + taxa). Taxa padrão = crescimento da receita (linhas de receita) ou
//     inflação (despesas);
//   • % da receita: taxa × receita bruta do próprio ano. Taxa padrão = participação da linha na receita do ano-base
//     (impostos sobre o faturamento, devoluções, custos e IRPJ/CSLL acompanham a venda).
// Qualquer taxa pode ser trocada linha a linha e ano a ano, e qualquer valor pode ser digitado por cima do cálculo.
// Os subtotais saem da árvore da própria DRE (bi_linhas.soma). "Provisionar" distribui cada ano projetado nos 12 meses
// pela sazonalidade do ano-base e grava no orçamento (bi_orcamento_gravar). Regras puras; testadas em projecao.test.ts.
import type { OrcamentoBanco } from "./lancamentos";
import { acharLinha, lerValor } from "./lancamentos";
import type { LinhaRelatorio } from "./lancamentos";

export const MAX_ANOS = 5;
export const LINHA_RECEITA = "receita_bruta";

export type Modo = "crescimento" | "receita";

/** Linha da DRE como vem de bi_linhas (analíticas e subtotais). */
export interface LinhaDre {
  codigo: string;
  nome: string;
  ordem: number;
  natureza: string | null;
  soma: string[] | null;
}

export interface PremissaLinha {
  modo: Modo;
  /** Taxa em % por ano projetado (índice 0 = ano-base + 1); null = padrão do modo. */
  taxas: (number | null)[];
}

export interface Premissas {
  anos: number;
  /** Crescimento da receita em % ao ano (índice 0 = ano-base + 1). */
  crescimentoReceita: number[];
  /** Inflação em % ao ano, para as despesas que crescem por índice. */
  inflacao: number[];
  linhas: Record<string, PremissaLinha>;
  /** Valor digitado por cima do cálculo (positivo, como no orçamento), por ano projetado. */
  valores: Record<string, (number | null)[]>;
  /** Ajuste do ano-base (positivo); sem ajuste vale o realizado. */
  base: Record<string, number>;
}

export interface LinhaProjetada {
  codigo: string;
  nome: string;
  subtotal: boolean;
  natureza: string | null;
  /** Índice 0 = ano-base; com sinal (receita +, custo e despesa −), como na DRE. */
  valores: number[];
  modo: Modo | null;
  /** Taxa efetiva em % por ano projetado (índice 0 = ano-base + 1). */
  taxas: (number | null)[];
  /** O valor daquele ano foi digitado (não calculado). Índice 0 = ano-base ajustado. */
  manual: boolean[];
}

export interface Projecao {
  anoBase: number;
  anos: number[];
  linhas: LinhaProjetada[];
}

const centavos = (v: number) => Math.round(v * 100) / 100;
const sinal = (natureza: string | null) => (natureza === "P" ? -1 : 1);
export const analiticas = (linhas: LinhaDre[]) =>
  linhas.filter((l) => !l.soma && l.codigo !== "nao_classificado").sort((a, b) => a.ordem - b.ordem);

/** Modo padrão: o que acompanha a venda vai por % da receita; receitas pelo crescimento; despesas pela inflação. */
export function modoPadrao(l: Pick<LinhaDre, "codigo" | "natureza">): Modo {
  return ["devolucoes", "deducoes", "custos", "irpj_csll"].includes(l.codigo) ? "receita" : "crescimento";
}

export function premissasIniciais(linhas: LinhaDre[], anos = 3, crescimento = 5, inflacao = 4.5): Premissas {
  const n = Math.min(Math.max(anos, 1), MAX_ANOS);
  return {
    anos: n,
    crescimentoReceita: Array(MAX_ANOS).fill(crescimento),
    inflacao: Array(MAX_ANOS).fill(inflacao),
    linhas: Object.fromEntries(analiticas(linhas).map((l) => [l.codigo, { modo: modoPadrao(l), taxas: Array(MAX_ANOS).fill(null) }])),
    valores: {},
    base: {},
  };
}

/** Realizado do ano por linha analítica em valor positivo (a DRE vem com sinal: despesa negativa). */
export function baseDoRealizado(linhas: LinhaDre[], realizado: Record<string, number>): Record<string, number> {
  return Object.fromEntries(analiticas(linhas).map((l) => [l.codigo, centavos(sinal(l.natureza) * (realizado[l.codigo] ?? 0))]));
}

/** Calcula o estudo: ano-base (realizado ou ajustado) + anos projetados, com os subtotais da DRE. */
export function projetar(linhas: LinhaDre[], anoBase: number, realizado: Record<string, number>, p: Premissas): Projecao {
  const n = Math.min(Math.max(p.anos, 1), MAX_ANOS);
  const anas = analiticas(linhas);
  const base = baseDoRealizado(linhas, realizado);
  const val: Record<string, number[]> = {};
  const taxas: Record<string, (number | null)[]> = {};
  const manual: Record<string, boolean[]> = {};
  for (const l of anas) {
    const ajustado = p.base[l.codigo];
    val[l.codigo] = [centavos(ajustado ?? base[l.codigo] ?? 0)];
    manual[l.codigo] = [ajustado != null];
    taxas[l.codigo] = [];
  }
  const receita = (ano: number) => val[LINHA_RECEITA]?.[ano] ?? 0;
  const receitaBase = receita(0);
  const ordem = [...anas].sort((a, b) => Number(modo(a) === "receita") - Number(modo(b) === "receita"));
  function modo(l: LinhaDre): Modo {
    // a receita bruta é a referência das outras: sempre por crescimento
    if (l.codigo === LINHA_RECEITA) return "crescimento";
    return p.linhas[l.codigo]?.modo ?? modoPadrao(l);
  }
  for (let y = 1; y <= n; y++) {
    // primeiro o que não depende da receita do ano (inclusive a própria receita), depois o que vai por % da receita
    for (const l of ordem) {
      const m = modo(l);
      const propria = p.linhas[l.codigo]?.taxas?.[y - 1];
      let taxa: number;
      let v: number;
      if (m === "receita") {
        taxa = propria ?? (receitaBase ? (val[l.codigo][0] / receitaBase) * 100 : 0);
        v = (receita(y) * taxa) / 100;
      } else {
        taxa = propria ?? (l.natureza === "R" ? (p.crescimentoReceita[y - 1] ?? 0) : (p.inflacao[y - 1] ?? 0));
        v = val[l.codigo][y - 1] * (1 + taxa / 100);
      }
      const digitado = p.valores[l.codigo]?.[y - 1];
      val[l.codigo][y] = centavos(digitado ?? v);
      manual[l.codigo][y] = digitado != null;
      taxas[l.codigo][y - 1] = Math.round(taxa * 100) / 100;
    }
  }
  // com sinal + subtotais pela árvore da DRE
  const comSinal: Record<string, number[]> = {};
  for (const l of anas) comSinal[l.codigo] = val[l.codigo].map((v) => centavos(sinal(l.natureza) * v));
  const porCodigo = new Map(linhas.map((l) => [l.codigo, l]));
  const subtotal = (cod: string, seen = new Set<string>()): number[] => {
    if (comSinal[cod]) return comSinal[cod];
    const l = porCodigo.get(cod);
    if (!l?.soma || seen.has(cod)) return Array(n + 1).fill(0);
    seen.add(cod);
    const r = Array(n + 1).fill(0);
    for (const f of l.soma) subtotal(f, seen).forEach((v, i) => (r[i] += v));
    return (comSinal[cod] = r.map(centavos));
  };
  const visiveis = [...linhas].filter((l) => l.codigo !== "nao_classificado").sort((a, b) => a.ordem - b.ordem);
  return {
    anoBase,
    anos: Array.from({ length: n + 1 }, (_, i) => anoBase + i),
    linhas: visiveis.map((l) => ({
      codigo: l.codigo,
      nome: l.nome,
      subtotal: !!l.soma,
      natureza: l.natureza,
      valores: subtotal(l.codigo),
      modo: l.soma ? null : modo(l),
      taxas: l.soma ? [] : taxas[l.codigo],
      manual: l.soma ? [] : manual[l.codigo],
    })),
  };
}

/** Distribui o valor do ano nos 12 meses pelos pesos (sazonalidade do ano-base); sem pesos, partes iguais. Fecha no centavo. */
export function distribuirMensal(anual: number, pesos: number[]): number[] {
  const p = pesos.map((x) => Math.abs(Number(x) || 0));
  const soma = p.reduce((a, b) => a + b, 0);
  const fr = soma > 0 ? p.map((x) => x / soma) : Array(12).fill(1 / 12);
  const meses = fr.map((f) => Math.round(anual * f * 100) / 100);
  const dif = Math.round((anual - meses.reduce((a, b) => a + b, 0)) * 100) / 100;
  // o ajuste do arredondamento vai para o mês de maior peso
  const i = fr.indexOf(Math.max(...fr));
  meses[i] = Math.round((meses[i] + dif) * 100) / 100;
  return meses;
}

/**
 * Linhas para o orçamento (bi_orcamento_gravar): cada ano projetado, linha a linha e mês a mês, em valor positivo.
 * Mês zerado vai em branco (apaga a meta que houver). Não grava o ano-base.
 */
export function paraOrcamento(proj: Projecao, cnpj: string, sazonalidade: Record<string, number[]>): OrcamentoBanco[] {
  const out: OrcamentoBanco[] = [];
  for (const l of proj.linhas.filter((x) => !x.subtotal)) {
    proj.anos.slice(1).forEach((ano, k) => {
      const anual = Math.abs(l.valores[k + 1]);
      distribuirMensal(anual, sazonalidade[l.codigo] ?? []).forEach((v, m) =>
        out.push({
          cnpj,
          relatorio: "dre",
          linha: l.codigo,
          competencia: `${ano}-${String(m + 1).padStart(2, "0")}-01`,
          valor: v === 0 ? null : v,
        }),
      );
    });
  }
  return out;
}

/** Variação % entre dois valores (null quando o anterior é zero). */
export const variacao = (antes: number, depois: number) => (antes ? Math.round(((depois - antes) / Math.abs(antes)) * 10000) / 100 : null);

// ---------------------------------------------------------------- planilha-modelo
const so = (v: unknown) => String(v ?? "").trim();
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Acha a linha de cabeçalho (o modelo do HUB tem título nas primeiras linhas). */
export function acharCabecalho(matriz: unknown[][], precisa: string): number {
  const alvo = semAcento(precisa);
  const i = matriz.slice(0, 12).findIndex((r) => (r ?? []).some((c) => semAcento(so(c)) === alvo));
  return i;
}

export const ABA_PROJECAO = "Projeção";
export const ABA_PREMISSAS = "Premissas";
export const PREMISSA_CRESCIMENTO = "Crescimento da receita (%)";
export const PREMISSA_INFLACAO = "Inflação (%)";

/** O que veio da planilha: valores digitados por ano, ajustes do ano-base e premissas gerais. */
export interface PlanilhaProjecao {
  valores: Record<string, (number | null)[]>;
  base: Record<string, number>;
  crescimentoReceita: (number | null)[];
  inflacao: (number | null)[];
  anos: number;
  erros: string[];
}

/**
 * Lê o modelo (abas "Projeção" e "Premissas"). Na aba Projeção, cada coluna de ano (ex.: 2027) é valor positivo;
 * célula preenchida vira valor digitado, em branco volta ao cálculo. A coluna "<ano-base> (base)" ajusta o ano-base
 * quando difere do realizado. Linhas de subtotal são ignoradas (o HUB calcula).
 */
export function lerPlanilhaProjecao(
  abas: Record<string, unknown[][]>,
  linhas: LinhaDre[],
  anoBase: number,
  realizado: Record<string, number>,
): PlanilhaProjecao {
  const erros: string[] = [];
  const nomeAba = (alvo: string) => Object.keys(abas).find((a) => semAcento(a) === semAcento(alvo));
  const abaProj = nomeAba(ABA_PROJECAO) ?? Object.keys(abas)[0];
  const m = abaProj ? (abas[abaProj] ?? []) : [];
  const h = acharCabecalho(m, "Linha");
  const res: PlanilhaProjecao = { valores: {}, base: {}, crescimentoReceita: [], inflacao: [], anos: 0, erros };
  if (h < 0) {
    erros.push('Não achei a coluna "Linha". Use a planilha do botão Baixar modelo.');
    return res;
  }
  const cab = (m[h] ?? []).map((c) => so(c));
  const colBase = cab.findIndex((c) => semAcento(c).startsWith(`${anoBase} (base`));
  const colAnos: { ano: number; col: number }[] = [];
  cab.forEach((c, col) => {
    const ano = Number(c);
    if (/^\d{4}$/.test(c) && ano > anoBase && ano <= anoBase + MAX_ANOS) colAnos.push({ ano, col });
  });
  if (!colAnos.length) erros.push(`Não achei colunas de ano depois de ${anoBase} (ex.: ${anoBase + 1}).`);
  res.anos = colAnos.length ? Math.max(...colAnos.map((a) => a.ano)) - anoBase : 0;
  const colLinha = cab.findIndex((c) => semAcento(c) === "linha");
  const colCodigo = cab.findIndex((c) => semAcento(c) === "codigo");
  const rel: LinhaRelatorio[] = linhas.map((l) => ({ relatorio: "dre", codigo: l.codigo, nome: l.nome, natureza: l.natureza }));
  const anas = new Set(analiticas(linhas).map((l) => l.codigo));
  const subt = new Set(linhas.filter((l) => l.soma).map((l) => l.codigo));
  const base = baseDoRealizado(linhas, realizado);
  m.slice(h + 1).forEach((r, i) => {
    if (!r || r.every((v) => so(v) === "")) return;
    const texto = so(r[colCodigo]) || so(r[colLinha]);
    const cod = (colCodigo >= 0 && anas.has(so(r[colCodigo])) ? so(r[colCodigo]) : null) ?? acharLinha(so(r[colLinha]), rel, "dre");
    if (cod && subt.has(cod)) return;
    if (!cod || !anas.has(cod)) {
      if (texto) erros.push(`Linha ${h + i + 2}: "${texto}" não é uma linha da DRE`);
      return;
    }
    if (colBase >= 0) {
      const v = lerValor(r[colBase]);
      if (Number.isNaN(v)) erros.push(`Linha ${h + i + 2}: valor do ano-base inválido`);
      else if (v !== null && Math.abs(Math.abs(v) - (base[cod] ?? 0)) >= 0.01) res.base[cod] = Math.abs(v);
    }
    const arr: (number | null)[] = Array(MAX_ANOS).fill(null);
    for (const { ano, col } of colAnos) {
      const v = lerValor(r[col]);
      if (Number.isNaN(v)) erros.push(`Linha ${h + i + 2}, ${ano}: valor inválido`);
      else arr[ano - anoBase - 1] = v === null ? null : Math.abs(v);
    }
    res.valores[cod] = arr;
  });
  const abaPrem = nomeAba(ABA_PREMISSAS);
  if (abaPrem) {
    const pm = abas[abaPrem] ?? [];
    const hp = acharCabecalho(pm, "Premissa");
    if (hp >= 0) {
      const cabp = (pm[hp] ?? []).map((c) => so(c));
      const cols = cabp.map((c, col) => ({ ano: Number(c), col })).filter((x) => x.ano > anoBase && x.ano <= anoBase + MAX_ANOS);
      for (const r of pm.slice(hp + 1)) {
        const nome = semAcento(so(r?.[0]));
        const alvo = nome.startsWith("crescimento") ? res.crescimentoReceita : nome.startsWith("inflacao") ? res.inflacao : null;
        if (!alvo) continue;
        for (const { ano, col } of cols) {
          const v = lerValor(r[col]);
          if (Number.isNaN(v)) erros.push(`Premissas, ${so(r?.[0])} ${ano}: valor inválido`);
          else alvo[ano - anoBase - 1] = v;
        }
      }
    }
  }
  return res;
}

/**
 * Aplica o que veio da planilha sobre as premissas atuais. Valor de ano igual ao que o HUB já calcula volta ao cálculo
 * (não vira digitado); só o que difere fica como digitado. Ano a ano, receita bruta primeiro, porque o resto depende
 * dela. O que a planilha não traz fica como está.
 */
export function aplicarPlanilha(
  p: Premissas,
  lido: PlanilhaProjecao,
  linhas: LinhaDre[],
  anoBase: number,
  realizado: Record<string, number>,
): Premissas {
  const juntar = (atual: number[], novo: (number | null)[]) => atual.map((v, i) => novo[i] ?? v);
  const valores: Record<string, (number | null)[]> = Object.fromEntries(
    Object.entries(p.valores).map(([k, v]) => [k, [...v]]),
  );
  const novo: Premissas = {
    ...p,
    anos: lido.anos ? Math.min(Math.max(lido.anos, 1), MAX_ANOS) : p.anos,
    crescimentoReceita: juntar(p.crescimentoReceita, lido.crescimentoReceita),
    inflacao: juntar(p.inflacao, lido.inflacao),
    base: { ...lido.base },
    valores,
  };
  const codigos = Object.keys(lido.valores).sort((a, b) => Number(b === LINHA_RECEITA) - Number(a === LINHA_RECEITA));
  for (let y = 1; y <= novo.anos; y++) {
    for (const cod of codigos) {
      const fv = lido.valores[cod]?.[y - 1];
      const arr = (valores[cod] ??= Array(MAX_ANOS).fill(null));
      if (fv == null) {
        arr[y - 1] = null;
        continue;
      }
      arr[y - 1] = null;
      const calc = projetar(linhas, anoBase, realizado, novo).linhas.find((l) => l.codigo === cod)?.valores[y] ?? 0;
      if (Math.abs(Math.abs(calc) - fv) >= 0.01) arr[y - 1] = fv;
    }
  }
  return novo;
}
