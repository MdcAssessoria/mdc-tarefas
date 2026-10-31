// Visão por período fixo do calendário (mês, trimestre, semestre, ano) escolhida pelo usuário no topo da análise.
// Diz quais anos e períodos têm balancete, monta o período escolhido (DRE e DFC somadas, balanço do último mês,
// índices refeitos pelas regras de periodos.ts), a completude em linguagem simples e o mesmo período do ano anterior.
// Balancete acumulado (vários meses num arquivo só, ex.: jan–dez enviado de uma vez) é usado direto no período
// que o contém; mês, trimestre e semestre cobertos só por ele ficam indisponíveis com a explicação.
import { TIPOS_PERIODO, agregar } from "./periodos";
import type { Agregado, TipoPeriodo } from "./periodos";
import type { Indices } from "./balancete/indices";
import type { Resumo } from "./balancete/resumo";
import type { Demonstracoes } from "./calculosDemonstracoes";

/** Mínimo que a seleção precisa de um balancete gravado. */
export interface RegPeriodo {
  competencia: string; // YYYY-MM-01
  resumo: Resumo;
  indices: Indices;
  demonstracoes?: Demonstracoes | null;
  periodo_inicio?: string | null;
}

/** A visão usa os mesmos ids de periodos.ts (assim a preferência já salva no navegador continua valendo). */
export type Visao = TipoPeriodo;
export const VISOES: { id: Visao; nome: string }[] = [
  { id: "mensal", nome: "Mês" },
  { id: "trimestral", nome: "Trimestre" },
  { id: "semestral", nome: "Semestre" },
  { id: "anual", nome: "Ano" },
];

/** Escolha do usuário: ano, visão e qual período (1–12 meses, 1–4 trimestres, 1–2 semestres, 1 ano). */
export interface Escolha {
  ano: number;
  visao: Visao;
  numero: number;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_LONGOS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const tamanho = (v: Visao) => TIPOS_PERIODO.find((t) => t.id === v)!.meses;
const ym = (c: string) => c.slice(0, 7);
const anoDe = (c: string) => Number(c.slice(0, 4));
const mesDe = (c: string) => Number(c.slice(5, 7));
const doisDig = (n: number) => String(n).padStart(2, "0");

/** Quantos períodos a visão tem no ano (12, 4, 2 ou 1). */
export const quantosPeriodos = (v: Visao) => 12 / tamanho(v);

/** Meses (YYYY-MM) do período escolhido, em ordem. */
export function mesesDoPeriodo(e: Escolha): string[] {
  const t = tamanho(e.visao);
  const ini = (e.numero - 1) * t + 1;
  return Array.from({ length: t }, (_, k) => `${e.ano}-${doisDig(ini + k)}`);
}

/** Período da visão que contém o mês da competência. */
export function numeroDoMes(visao: Visao, competencia: string): number {
  return Math.floor((mesDe(competencia) - 1) / tamanho(visao)) + 1;
}

/** Nome de um período para listas: "março", "1º trimestre", "2º semestre", "ano inteiro". */
export function nomeOpcao(visao: Visao, numero: number): string {
  if (visao === "mensal") return MESES_LONGOS[numero - 1];
  if (visao === "anual") return "ano inteiro";
  return `${numero}º ${visao === "trimestral" ? "trimestre" : "semestre"}`;
}

/** Rótulo completo: "março de 2024", "1º trimestre de 2024", "1º semestre de 2024", "ano de 2024". */
export function rotuloEscolha(e: Escolha): string {
  if (e.visao === "anual") return `ano de ${e.ano}`;
  return `${nomeOpcao(e.visao, e.numero)} de ${e.ano}`;
}

/** Rótulo curto de mês: "mar/2024". */
const mesCurto = (m: string) => `${MESES[mesDe(m) - 1]}/${m.slice(0, 4)}`;

/** Lista de meses em texto simples: "mar/2024"; "fev e mar/2024"; "jan, fev e mar/2024"; "7 meses". */
export function listarMeses(meses: string[]): string {
  if (!meses.length) return "";
  if (meses.length > 4) return `${meses.length} meses`;
  const mesmoAno = meses.every((m) => m.slice(0, 4) === meses[0].slice(0, 4));
  if (!mesmoAno) return meses.map(mesCurto).join(", ");
  const nomes = meses.map((m) => MESES[mesDe(m) - 1]);
  const ultimo = nomes.pop()!;
  return `${nomes.length ? nomes.join(", ") + " e " : ""}${ultimo}/${meses[0].slice(0, 4)}`;
}

// ---------------------------------------------------------------- balancete mensal × acumulado

/** Primeiro mês (YYYY-MM) coberto pelo balancete; acumulado que começa no ano anterior é cortado em janeiro. */
function inicioCoberto(b: RegPeriodo): string {
  const ini = ym(b.periodo_inicio ?? b.demonstracoes?.periodo.inicio ?? b.competencia);
  const jan = `${b.competencia.slice(0, 4)}-01`;
  return ini < jan ? jan : ini > ym(b.competencia) ? ym(b.competencia) : ini;
}

/** Meses (YYYY-MM) que o balancete cobre. */
export function mesesCobertos(b: RegPeriodo): string[] {
  const ano = anoDe(b.competencia);
  const de = mesDe(inicioCoberto(b)),
    ate = mesDe(b.competencia);
  return Array.from({ length: ate - de + 1 }, (_, k) => `${ano}-${doisDig(de + k)}`);
}

/** Balancete de vários meses num arquivo só (ex.: jan a dez enviado de uma vez). */
export function ehAcumulado(b: RegPeriodo): boolean {
  return mesesCobertos(b).length > 1 || (b.demonstracoes?.periodo.dias ?? 31) > 31;
}

/** Visão de um balancete acumulado: o menor período do calendário que contém todos os meses dele. */
function visaoDoAcumulado(b: RegPeriodo): Escolha {
  const meses = mesesCobertos(b);
  for (const v of ["trimestral", "semestral"] as Visao[]) {
    const n = numeroDoMes(v, meses[0] + "-01");
    if (n === numeroDoMes(v, meses[meses.length - 1] + "-01")) return { ano: anoDe(b.competencia), visao: v, numero: n };
  }
  return { ano: anoDe(b.competencia), visao: "anual", numero: 1 };
}

const mesma = (a: Escolha, b: Escolha) => a.ano === b.ano && a.visao === b.visao && a.numero === b.numero;

// ---------------------------------------------------------------- opções do seletor

export interface Opcao {
  numero: number;
  nome: string;
  disponivel: boolean;
  motivo: string | null; // por que está desabilitada, em linguagem simples
}

const MOTIVO_ACUMULADO = "este cliente enviou o balancete do ano inteiro de uma vez, então não dá para separar por mês";

/** Anos com algum balancete, do mais recente para o mais antigo. */
export function anosDisponiveis(historico: RegPeriodo[]): number[] {
  return [...new Set(historico.map((b) => anoDe(b.competencia)))].sort((a, b) => b - a);
}

/** Opções de "Qual período" para o ano e a visão, com as sem dado desabilitadas e o porquê. */
export function opcoesDoAno(historico: RegPeriodo[], ano: number, visao: Visao): Opcao[] {
  const doAno = historico.filter((b) => anoDe(b.competencia) === ano);
  const mensais = new Set(doAno.filter((b) => !ehAcumulado(b)).map((b) => ym(b.competencia)));
  const acumulados = doAno.filter(ehAcumulado);
  const cobertosPorAcumulado = new Set(acumulados.flatMap(mesesCobertos));
  return Array.from({ length: quantosPeriodos(visao) }, (_, k) => {
    const e = { ano, visao, numero: k + 1 };
    const meses = mesesDoPeriodo(e);
    const temMensal = meses.some((m) => mensais.has(m));
    const temAcumulado = acumulados.some((b) => mesma(visaoDoAcumulado(b), e));
    const disponivel = temMensal || temAcumulado;
    const motivo = disponivel
      ? null
      : meses.some((m) => cobertosPorAcumulado.has(m))
        ? MOTIVO_ACUMULADO
        : `nenhum balancete importado ${visao === "mensal" ? "deste mês" : "neste período"}`;
    return { numero: k + 1, nome: nomeOpcao(visao, k + 1), disponivel, motivo };
  });
}

/** Visões do ano: disponível quando ao menos um período dela tem dado; senão diz o porquê. */
export function visoesDoAno(
  historico: RegPeriodo[],
  ano: number,
): { id: Visao; nome: string; disponivel: boolean; motivo: string | null }[] {
  return VISOES.map((v) => {
    const ops = opcoesDoAno(historico, ano, v.id);
    const disponivel = ops.some((o) => o.disponivel);
    const motivo = disponivel ? null : (ops.find((o) => o.motivo)?.motivo ?? "sem balancete neste ano");
    return { ...v, disponivel, motivo };
  });
}

/**
 * Deixa a escolha válida: ano com dado, visão disponível e período com dado. Quando o período pedido não tem dado,
 * fica com o último disponível até ele (ou o último do ano). Sem nenhum balancete devolve null.
 */
export function normalizar(historico: RegPeriodo[], e: Escolha): Escolha | null {
  const anos = anosDisponiveis(historico);
  if (!anos.length) return null;
  const ano = anos.includes(e.ano) ? e.ano : anos[0];
  const visoes = visoesDoAno(historico, ano);
  const visao = visoes.find((v) => v.id === e.visao)?.disponivel ? e.visao : visoes.find((v) => v.disponivel)!.id;
  const ops = opcoesDoAno(historico, ano, visao).filter((o) => o.disponivel);
  const alvo = visao === e.visao && ano === e.ano ? e.numero : quantosPeriodos(visao);
  const numero = [...ops].reverse().find((o) => o.numero <= alvo)?.numero ?? ops[ops.length - 1].numero;
  return { ano, visao, numero };
}

/** Escolha inicial: o período (na visão preferida) que contém a competência de referência ou o último balancete. */
export function escolhaPadrao(historico: RegPeriodo[], visaoPreferida: Visao, competencia?: string): Escolha | null {
  if (!historico.length) return null;
  const ref =
    historico.find((b) => b.competencia === competencia) ??
    [...historico].sort((a, b) => a.competencia.localeCompare(b.competencia)).at(-1)!;
  const e = ehAcumulado(ref)
    ? visaoDoAcumulado(ref)
    : { ano: anoDe(ref.competencia), visao: visaoPreferida, numero: numeroDoMes(visaoPreferida, ref.competencia) };
  return normalizar(historico, e);
}

/** Ao trocar a visão, fica no período da nova visão que contém o último mês do período atual. */
export function trocarVisao(historico: RegPeriodo[], atual: Escolha, visao: Visao): Escolha | null {
  const ultimo = mesesDoPeriodo(atual).at(-1)! + "-01";
  return normalizar(historico, { ano: atual.ano, visao, numero: numeroDoMes(visao, ultimo) });
}

// ---------------------------------------------------------------- o período montado

export interface Selecao<T extends RegPeriodo> {
  escolha: Escolha;
  rotulo: string; // "1º trimestre de 2024"
  fonte: "mensal" | "acumulado";
  meses: string[]; // meses do período (YYYY-MM)
  importados: string[]; // meses cobertos por balancete
  faltam: string[]; // meses sem balancete
  completo: boolean;
  completude: string; // "3 de 3 meses importados" · "2 de 3 meses importados · falta mar/2024"
  registros: T[]; // balancetes usados, em ordem
  base: T; // último balancete do período (o balanço é o dele)
  inicio: string; // YYYY-MM-DD: abertura do balanço
  fim: string; // YYYY-MM-DD: fechamento do balanço
  ag: Agregado;
}

/** Monta o período escolhido. Devolve null quando ele não tem nenhum balancete. */
export function selecionar<T extends RegPeriodo>(historico: T[], e: Escolha): Selecao<T> | null {
  const meses = mesesDoPeriodo(e);
  const doAno = historico.filter((b) => anoDe(b.competencia) === e.ano);
  const acumulado = doAno
    .filter((b) => ehAcumulado(b) && mesma(visaoDoAcumulado(b), e))
    .sort((a, b) => a.competencia.localeCompare(b.competencia))
    .at(-1);
  const mensais = doAno
    .filter((b) => !ehAcumulado(b) && meses.includes(ym(b.competencia)))
    .sort((a, b) => a.competencia.localeCompare(b.competencia));
  // o acumulado vale quando cobre ao menos tantos meses quanto os mensais do período
  const usarAcumulado = !!acumulado && mesesCobertos(acumulado).length >= mensais.length;
  if (!usarAcumulado && !mensais.length) return null;

  const registros = usarAcumulado ? [acumulado!] : mensais;
  const base = registros[registros.length - 1];
  const importados = usarAcumulado ? mesesCobertos(acumulado!) : mensais.map((b) => ym(b.competencia));
  const faltam = meses.filter((m) => !importados.includes(m));
  const ag: Agregado = usarAcumulado ? { ...agregar(base, [base], "mensal"), tipo: e.visao } : agregar(base, mensais, e.visao);
  const rotulo = rotuloEscolha(e);
  ag.rotulo = rotulo;
  ag.completo = !faltam.length;

  let completude: string;
  if (usarAcumulado)
    completude =
      `Balancete acumulado de ${listarMeses([importados[0]]).replace(/\/\d+$/, "")} a ${mesCurto(importados.at(-1)!)}, enviado de uma vez` +
      (faltam.length ? ` · falta${faltam.length > 1 ? "m" : ""} ${listarMeses(faltam)}` : "");
  else if (e.visao === "mensal") completude = "Balancete do mês importado";
  else
    completude =
      `${importados.length} de ${meses.length} meses importados` +
      (faltam.length ? ` · falta${faltam.length > 1 ? "m" : ""} ${listarMeses(faltam)}` : "");

  const primeiro = registros[0];
  const inicio = usarAcumulado
    ? (base.demonstracoes?.periodo.inicio ?? `${importados[0]}-01`)
    : (primeiro.demonstracoes?.periodo.inicio ?? `${ym(primeiro.competencia)}-01`);
  const fim = base.demonstracoes?.periodo.fim ?? `${ym(base.competencia)}-28`;

  return {
    escolha: e,
    rotulo,
    fonte: usarAcumulado ? "acumulado" : "mensal",
    meses,
    importados,
    faltam,
    completo: !faltam.length,
    completude,
    registros,
    base,
    inicio,
    fim,
    ag,
  };
}

/** Mesmo período do ano anterior, quando existe balancete dele. */
export function mesmoPeriodoAnoAnterior<T extends RegPeriodo>(historico: T[], e: Escolha): Selecao<T> | null {
  return selecionar(historico, { ...e, ano: e.ano - 1 });
}

/**
 * Série para os gráficos de evolução na visão escolhida, até o fim do período: soma por mês, trimestre, semestre ou
 * ano. Na visão anual o ano que tem balancete acumulado entra com ele; nas outras, só os balancetes mensais.
 */
export function serieDaVisao<T extends RegPeriodo>(historico: T[], e: Escolha, max = 12) {
  const ate = mesesDoPeriodo(e).at(-1)! + "-01";
  const anos = anosDisponiveis(historico)
    .filter((a) => a <= e.ano)
    .sort((a, b) => a - b);
  const pontos: { rotulo: string; sel: Selecao<T> }[] = [];
  for (const ano of anos)
    for (let n = 1; n <= quantosPeriodos(e.visao); n++) {
      const esc = { ano, visao: e.visao, numero: n };
      if (mesesDoPeriodo(esc)[0] + "-01" > ate) break;
      const sel = selecionar(historico, esc);
      if (!sel) continue;
      const curto = String(ano).slice(2);
      const rotulo =
        e.visao === "mensal"
          ? `${MESES[n - 1]}/${curto}`
          : e.visao === "anual"
            ? String(ano)
            : `${n}${e.visao === "trimestral" ? "T" : "S"}/${curto}`;
      pontos.push({ rotulo, sel });
    }
  return pontos.slice(-max).map(({ rotulo, sel }) => ({
    rotulo,
    dre: sel.ag.dre,
    fco: sel.ag.dfc?.fco ?? null,
    disponivel: sel.ag.resumo.disponivel,
  }));
}
