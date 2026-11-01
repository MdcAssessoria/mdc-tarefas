// Contas dos relatórios gerenciais (funções puras, testadas em relatorios.test.ts). Todos são "de caixa": usam os
// pagamentos e recebimentos registrados (fin_baixas não estornadas) e, no previsto, os vencimentos das contas.
//   - resultadoDeCaixa: DRE gerencial de caixa (receitas e despesas por grupo e categoria, juros e descontos à parte)
//   - fluxoPorMes: realizado x previsto por mês
//   - pagosERecebidos: lista de pagamentos e recebimentos do período
//   - porCentroDeCusto: receitas, despesas e resultado por centro de custo
import { somarMeses } from "@/lib/datas";
import type { Baixa, Categoria, Titulo } from "./tipos";

const r2 = (v: number) => Math.round(v * 100) / 100;

export type BaixaRel = Pick<Baixa, "id" | "titulo_id" | "conta_id" | "data" | "valor" | "juros" | "multa" | "desconto" | "total" | "estornada">;
export type TituloRel = Pick<Titulo, "id" | "tipo" | "categoria_id" | "centro_id" | "pessoa_id" | "descricao" | "vencimento" | "valor" | "situacao">;
export type CategoriaRel = Pick<Categoria, "id" | "nome" | "grupo" | "tipo">;

const totalDaBaixa = (b: BaixaRel) => Number(b.total ?? Number(b.valor) + Number(b.juros) + Number(b.multa) - Number(b.desconto));
const validas = (baixas: BaixaRel[], titulos: Map<string, TituloRel>) =>
  baixas.filter((b) => !b.estornada && titulos.has(b.titulo_id)).map((b) => ({ b, t: titulos.get(b.titulo_id)! }));

// ------------------------------------------------------------------ resultado de caixa (DRE gerencial)

export interface CategoriaDoGrupo {
  id: string;
  nome: string;
  valor: number;
}
export interface GrupoResultado {
  grupo: string;
  valor: number;
  categorias: CategoriaDoGrupo[];
}
export interface ResultadoDeCaixa {
  receitas: GrupoResultado[];
  despesas: GrupoResultado[];
  totalReceitas: number;
  totalDespesas: number;
  jurosRecebidos: number;
  jurosPagos: number;
  descontosObtidos: number;
  descontosConcedidos: number;
  /** Juros recebidos − juros pagos + descontos obtidos − descontos concedidos. */
  financeiro: number;
  /** Receitas − despesas + financeiro (= o que entrou menos o que saiu pelas contas). */
  resultado: number;
}

function agrupar(itens: { id: string; nome: string; grupo: string; valor: number }[]): GrupoResultado[] {
  const grupos = new Map<string, Map<string, CategoriaDoGrupo>>();
  for (const i of itens) {
    const g = grupos.get(i.grupo) ?? new Map<string, CategoriaDoGrupo>();
    const c = g.get(i.id) ?? { id: i.id, nome: i.nome, valor: 0 };
    c.valor = r2(c.valor + i.valor);
    g.set(i.id, c);
    grupos.set(i.grupo, g);
  }
  return [...grupos.entries()]
    .map(([grupo, cats]) => {
      const categorias = [...cats.values()].sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome));
      return { grupo, valor: r2(categorias.reduce((a, c) => a + c.valor, 0)), categorias };
    })
    .sort((a, b) => b.valor - a.valor || a.grupo.localeCompare(b.grupo));
}

/** DRE gerencial de caixa do período: o valor de cada baixa vai para a categoria do título (agrupada pelo grupo dela). */
export function resultadoDeCaixa(baixas: BaixaRel[], titulos: Map<string, TituloRel>, categorias: Map<string, CategoriaRel>): ResultadoDeCaixa {
  const rec: { id: string; nome: string; grupo: string; valor: number }[] = [];
  const desp: typeof rec = [];
  let jurosRecebidos = 0,
    jurosPagos = 0,
    descontosObtidos = 0,
    descontosConcedidos = 0;
  for (const { b, t } of validas(baixas, titulos)) {
    const cat = categorias.get(t.categoria_id);
    const item = { id: t.categoria_id, nome: cat?.nome ?? "Sem categoria", grupo: cat?.grupo || "Sem grupo", valor: Number(b.valor) };
    const encargos = Number(b.juros) + Number(b.multa);
    if (t.tipo === "receber") {
      rec.push(item);
      jurosRecebidos += encargos;
      descontosConcedidos += Number(b.desconto);
    } else {
      desp.push(item);
      jurosPagos += encargos;
      descontosObtidos += Number(b.desconto);
    }
  }
  const receitas = agrupar(rec);
  const despesas = agrupar(desp);
  const totalReceitas = r2(receitas.reduce((a, g) => a + g.valor, 0));
  const totalDespesas = r2(despesas.reduce((a, g) => a + g.valor, 0));
  const financeiro = r2(jurosRecebidos - jurosPagos + descontosObtidos - descontosConcedidos);
  return {
    receitas,
    despesas,
    totalReceitas,
    totalDespesas,
    jurosRecebidos: r2(jurosRecebidos),
    jurosPagos: r2(jurosPagos),
    descontosObtidos: r2(descontosObtidos),
    descontosConcedidos: r2(descontosConcedidos),
    financeiro,
    resultado: r2(totalReceitas - totalDespesas + financeiro),
  };
}

/** Linhas do resultado de caixa para a tela e a exportação (nível 0 = total, 1 = grupo, 2 = categoria). */
export interface LinhaResultado {
  chave: string;
  nome: string;
  valor: number;
  nivel: 0 | 1 | 2;
  /** Parte do total de receitas (receitas) ou de despesas (despesas), de 0 a 1. */
  parte?: number;
}

export function linhasDoResultado(r: ResultadoDeCaixa): LinhaResultado[] {
  const bloco = (titulo: string, sinal: 1 | -1, grupos: GrupoResultado[], total: number, chave: string): LinhaResultado[] => [
    { chave, nome: titulo, valor: sinal * total, nivel: 0 },
    ...grupos.flatMap((g) => [
      { chave: `${chave}:${g.grupo}`, nome: g.grupo, valor: sinal * g.valor, nivel: 1 as const, parte: total ? g.valor / total : 0 },
      ...g.categorias.map((c) => ({
        chave: `${chave}:${g.grupo}:${c.id}`,
        nome: c.nome,
        valor: sinal * c.valor,
        nivel: 2 as const,
        parte: total ? c.valor / total : 0,
      })),
    ]),
  ];
  const fin: LinhaResultado[] = [
    { chave: "fin", nome: "Resultado financeiro (juros, multas e descontos)", valor: r.financeiro, nivel: 0 },
    { chave: "fin:jr", nome: "Juros e multas recebidos", valor: r.jurosRecebidos, nivel: 2 },
    { chave: "fin:jp", nome: "Juros e multas pagos", valor: -r.jurosPagos, nivel: 2 },
    { chave: "fin:do", nome: "Descontos obtidos", valor: r.descontosObtidos, nivel: 2 },
    { chave: "fin:dc", nome: "Descontos concedidos", valor: -r.descontosConcedidos, nivel: 2 },
  ].filter((l) => l.nivel === 0 || l.valor !== 0) as LinhaResultado[];
  return [
    ...bloco("Receitas (dinheiro que entrou)", 1, r.receitas, r.totalReceitas, "rec"),
    ...bloco("Despesas (dinheiro que saiu)", -1, r.despesas, r.totalDespesas, "desp"),
    ...fin,
    { chave: "res", nome: r.resultado >= 0 ? "Sobrou no período" : "Faltou no período", valor: r.resultado, nivel: 0 },
  ];
}

// ------------------------------------------------------------------ fluxo realizado x previsto

export interface MesFluxo {
  mes: string;
  /** Contas a receber com vencimento no mês (valor, sem as canceladas). */
  previstoEntrar: number;
  entrou: number;
  previstoSair: number;
  saiu: number;
  /** entrou − saiu */
  resultado: number;
}

/** Meses (AAAA-MM) de `de` até `ate`, inclusive. */
export function mesesEntre(de: string, ate: string): string[] {
  const saida: string[] = [];
  for (let m = de.slice(0, 7); m <= ate.slice(0, 7) && saida.length < 240; m = somarMeses(m, 1)) saida.push(m);
  return saida;
}

/**
 * Realizado (baixas pelo total que passou no banco) e previsto (vencimentos das contas no mês) mês a mês. Sem datas
 * (período "Tudo"), usa do primeiro ao último mês com movimento.
 */
export function fluxoPorMes(
  baixas: BaixaRel[],
  titulosDasBaixas: Map<string, TituloRel>,
  titulosDoPeriodo: TituloRel[],
  intervalo: { de?: string; ate?: string },
): MesFluxo[] {
  const pares = validas(baixas, titulosDasBaixas);
  const datas = [...pares.map((p) => p.b.data), ...titulosDoPeriodo.filter((t) => t.situacao !== "cancelado").map((t) => t.vencimento)].sort();
  const de = intervalo.de ?? datas[0];
  const ate = intervalo.ate ?? datas.at(-1);
  if (!de || !ate) return [];
  const meses = mesesEntre(de, ate).map((mes) => ({ mes, previstoEntrar: 0, entrou: 0, previstoSair: 0, saiu: 0, resultado: 0 }));
  const idx = new Map(meses.map((m, i) => [m.mes, i]));
  for (const { b, t } of pares) {
    const m = meses[idx.get(b.data.slice(0, 7)) ?? -1];
    if (!m) continue;
    if (t.tipo === "receber") m.entrou = r2(m.entrou + totalDaBaixa(b));
    else m.saiu = r2(m.saiu + totalDaBaixa(b));
  }
  for (const t of titulosDoPeriodo) {
    if (t.situacao === "cancelado") continue;
    const m = meses[idx.get(t.vencimento.slice(0, 7)) ?? -1];
    if (!m) continue;
    if (t.tipo === "receber") m.previstoEntrar = r2(m.previstoEntrar + Number(t.valor));
    else m.previstoSair = r2(m.previstoSair + Number(t.valor));
  }
  for (const m of meses) m.resultado = r2(m.entrou - m.saiu);
  return meses;
}

// ------------------------------------------------------------------ pagos e recebidos

export interface LinhaPagoRecebido {
  id: number;
  data: string;
  tipo: Titulo["tipo"];
  descricao: string;
  pessoaId: string | null;
  categoriaId: string;
  contaId: string;
  valor: number;
  encargos: number;
  desconto: number;
  /** O que passou no banco: positivo se entrou, negativo se saiu. */
  total: number;
}

/** Pagamentos e recebimentos do período, em ordem de data, com o total assinado (entrou +, saiu −). */
export function pagosERecebidos(baixas: BaixaRel[], titulos: Map<string, TituloRel>): LinhaPagoRecebido[] {
  return validas(baixas, titulos)
    .map(({ b, t }) => ({
      id: b.id,
      data: b.data,
      tipo: t.tipo,
      descricao: t.descricao,
      pessoaId: t.pessoa_id,
      categoriaId: t.categoria_id,
      contaId: b.conta_id,
      valor: Number(b.valor),
      encargos: r2(Number(b.juros) + Number(b.multa)),
      desconto: Number(b.desconto),
      total: r2((t.tipo === "receber" ? 1 : -1) * totalDaBaixa(b)),
    }))
    .sort((a, b) => a.data.localeCompare(b.data) || a.id - b.id);
}

// ------------------------------------------------------------------ centros de custo

export interface LinhaCentro {
  /** id do centro, ou "" para "Sem centro de custo". */
  id: string;
  receitas: number;
  despesas: number;
  resultado: number;
  /** Parte das despesas do período, de 0 a 1. */
  parteDespesas: number;
}

/** Receitas e despesas pagas/recebidas no período por centro de custo do título (valor da categoria, sem juros). */
export function porCentroDeCusto(baixas: BaixaRel[], titulos: Map<string, TituloRel>): LinhaCentro[] {
  const m = new Map<string, LinhaCentro>();
  for (const { b, t } of validas(baixas, titulos)) {
    const id = t.centro_id ?? "";
    const x = m.get(id) ?? { id, receitas: 0, despesas: 0, resultado: 0, parteDespesas: 0 };
    if (t.tipo === "receber") x.receitas = r2(x.receitas + Number(b.valor));
    else x.despesas = r2(x.despesas + Number(b.valor));
    m.set(id, x);
  }
  const lista = [...m.values()];
  const totalDesp = lista.reduce((a, x) => a + x.despesas, 0);
  for (const x of lista) {
    x.resultado = r2(x.receitas - x.despesas);
    x.parteDespesas = totalDesp ? x.despesas / totalDesp : 0;
  }
  // sem centro por último; os outros pela maior despesa
  return lista.sort((a, b) => (a.id === "") === (b.id === "") ? b.despesas - a.despesas : a.id === "" ? 1 : -1);
}
