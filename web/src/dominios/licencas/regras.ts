// Regras puras do módulo Licenças (sem banco; testadas em regras.test.ts): valor do mês (proporcional), vencimento,
// situação e atraso das mensalidades, faixas de inadimplência, reajuste, receita mensal recorrente e o relatório
// "Faturamento do mês". As contas de valor e vencimento são as mesmas do banco (app.lic_valor_mes, app.lic_vencimento).
import { somarMeses } from "@/lib/datas";
import type { Cobranca, Contrato } from "./tipos";

const DIA = 86_400_000;
const utc = (d: string) => Date.parse(d.slice(0, 10) + "T00:00:00Z");
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Diferença em dias corridos entre duas datas AAAA-MM-DD (b − a). */
export const diasEntre = (a: string, b: string) => Math.round((utc(b) - utc(a)) / DIA);

/** Quantos dias tem o mês da data/competência. */
export function diasNoMes(competencia: string): number {
  const [a, m] = competencia.slice(0, 7).split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

/** "2026-11" ou "2026-11-15" → "2026-11-01". */
export const inicioDoMes = (d: string) => d.slice(0, 7) + "-01";
/** "2026-11" → "2026-11-30". */
export const fimDoMesCompetencia = (d: string) => `${d.slice(0, 7)}-${String(diasNoMes(d)).padStart(2, "0")}`;

/**
 * Valor da mensalidade numa competência. Sem proporcional: o mês cheio se o contrato vale em algum dia do mês. Com
 * proporcional: só os dias cobertos (início ou fim no meio do mês). Fora da vigência: zero.
 */
export function valorDoMes(valor: number, inicio: string, fim: string | null, proporcional: boolean, competencia: string): number {
  const ini = inicioDoMes(competencia);
  const ult = fimDoMesCompetencia(competencia);
  const de = inicio > ini ? inicio : ini;
  const ate = fim && fim < ult ? fim : ult;
  if (ate < de) return 0;
  if (!proporcional) return r2(valor);
  return r2((valor * (diasEntre(de, ate) + 1)) / diasNoMes(competencia));
}

/** Vencimento da mensalidade: o dia do contrato no próprio mês da competência; 31 vira o último dia do mês. */
export function vencimentoDaCompetencia(competencia: string, dia: number): string {
  return `${competencia.slice(0, 7)}-${String(Math.min(dia, diasNoMes(competencia))).padStart(2, "0")}`;
}

// ------------------------------------------------------------------ situação e atraso

export type SituacaoExibida = "atrasada" | "vence_hoje" | "a_vencer" | "paga" | "cancelada";

export const SITUACOES: Record<SituacaoExibida, { nome: string; tom: string }> = {
  atrasada: { nome: "Atrasada", tom: "bg-red-50 text-red-800" },
  vence_hoje: { nome: "Vence hoje", tom: "bg-amber-50 text-amber-900" },
  a_vencer: { nome: "A vencer", tom: "bg-sky-50 text-sky-800" },
  paga: { nome: "Paga", tom: "bg-emerald-50 text-emerald-800" },
  cancelada: { nome: "Cancelada", tom: "bg-neutral-100 text-neutral-600" },
};

export function situacaoDaCobranca(c: Pick<Cobranca, "situacao" | "vencimento">, hoje: string): SituacaoExibida {
  if (c.situacao === "paga") return "paga";
  if (c.situacao === "cancelada") return "cancelada";
  if (c.vencimento < hoje) return "atrasada";
  return c.vencimento === hoje ? "vence_hoje" : "a_vencer";
}

/** Dias de atraso de uma mensalidade em aberto (0 se não está vencida, paga ou cancelada). */
export function diasDeAtraso(c: Pick<Cobranca, "situacao" | "vencimento">, hoje: string): number {
  return c.situacao === "aberta" && c.vencimento < hoje ? diasEntre(c.vencimento, hoje) : 0;
}

export type Faixa = "1-15" | "16-30" | "31-60" | "61-90" | "90+";

export const FAIXAS: { id: Faixa; nome: string; ate: number }[] = [
  { id: "1-15", nome: "1 a 15 dias", ate: 15 },
  { id: "16-30", nome: "16 a 30 dias", ate: 30 },
  { id: "31-60", nome: "31 a 60 dias", ate: 60 },
  { id: "61-90", nome: "61 a 90 dias", ate: 90 },
  { id: "90+", nome: "Mais de 90 dias", ate: Infinity },
];

/** Faixa de atraso (null se não está em atraso). */
export function faixaDoAtraso(dias: number): Faixa | null {
  if (dias < 1) return null;
  return FAIXAS.find((f) => dias <= f.ate)!.id;
}

export interface TotalFaixa {
  faixa: Faixa;
  nome: string;
  quantidade: number;
  valor: number;
  clientes: number;
}

/** Inadimplência por faixa de atraso (cada mensalidade conta na própria faixa). */
export function inadimplenciaPorFaixa(cobrancas: Cobranca[], hoje: string): TotalFaixa[] {
  const mapa = new Map(FAIXAS.map((f) => [f.id, { faixa: f.id, nome: f.nome, quantidade: 0, valor: 0, clientes: new Set<string>() }]));
  for (const c of cobrancas) {
    const f = faixaDoAtraso(diasDeAtraso(c, hoje));
    if (!f) continue;
    const x = mapa.get(f)!;
    x.quantidade++;
    x.valor = r2(x.valor + Number(c.valor));
    x.clientes.add(c.cliente_id);
  }
  return [...mapa.values()].map((x) => ({ ...x, clientes: x.clientes.size }));
}

export interface Inadimplente {
  cliente_id: string;
  cobrancas: Cobranca[];
  total: number;
  maiorAtraso: number;
  faixa: Faixa;
}

/** Clientes com mensalidade vencida e em aberto, do maior atraso para o menor (empate: maior valor). */
export function inadimplentes(cobrancas: Cobranca[], hoje: string): Inadimplente[] {
  const por = new Map<string, Cobranca[]>();
  for (const c of cobrancas) {
    if (diasDeAtraso(c, hoje) < 1) continue;
    por.set(c.cliente_id, [...(por.get(c.cliente_id) ?? []), c]);
  }
  return [...por.entries()]
    .map(([cliente_id, l]) => {
      const lista = [...l].sort((a, b) => a.vencimento.localeCompare(b.vencimento));
      const maiorAtraso = diasDeAtraso(lista[0], hoje);
      return {
        cliente_id,
        cobrancas: lista,
        total: r2(lista.reduce((s, c) => s + Number(c.valor), 0)),
        maiorAtraso,
        faixa: faixaDoAtraso(maiorAtraso)!,
      };
    })
    .sort((a, b) => b.maiorAtraso - a.maiorAtraso || b.total - a.total);
}

// ------------------------------------------------------------------ contratos

/** Contrato que vale hoje: ativo e dentro da vigência. */
export const contratoVigente = (c: Pick<Contrato, "situacao" | "inicio" | "fim">, hoje: string) =>
  c.situacao === "ativo" && c.inicio <= hoje && (!c.fim || c.fim >= hoje);

/** Receita mensal recorrente: soma do valor mensal dos contratos que valem hoje. */
export const receitaRecorrente = (contratos: Contrato[], hoje: string) =>
  r2(contratos.filter((c) => contratoVigente(c, hoje)).reduce((s, c) => s + Number(c.valor_mensal), 0));

/** Valor depois do reajuste (percentual, ex.: 4,5 = 4,5%), com centavos arredondados. */
export const aplicarReajuste = (valor: number, percentual: number) => r2(valor * (1 + percentual / 100));

/** Meses entre duas competências ("2026-01" → "2027-01" = 12). */
export const mesesEntre = (a: string, b: string) =>
  (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));

/**
 * Reajuste a fazer: contrato vigente com índice, o mês do reajuste deste ano já chegou, o contrato completou 12 meses
 * até esse mês e o último reajuste é anterior a ele. Devolve a data prevista (primeiro dia do mês) ou null.
 */
export function reajustePendente(c: Contrato, hoje: string): string | null {
  if (!contratoVigente(c, hoje) || c.reajuste_indice === "nenhum" || !c.reajuste_mes) return null;
  const prevista = `${hoje.slice(0, 4)}-${String(c.reajuste_mes).padStart(2, "0")}-01`;
  if (hoje < prevista) return null;
  if (mesesEntre(c.inicio, prevista) < 12) return null;
  if (c.ultimo_reajuste && c.ultimo_reajuste >= prevista) return null;
  return prevista;
}

/** Desconto do valor negociado sobre o preço de tabela, em % (0 se não há desconto ou tabela zerada). */
export const descontoSobreTabela = (tabela: number, negociado: number) =>
  tabela > 0 && negociado < tabela ? Math.round(((tabela - negociado) / tabela) * 1000) / 10 : 0;

// ------------------------------------------------------------------ meses dos filtros e do gráfico

/** As últimas `n` competências até a de `hoje` (mais antiga primeiro), mais `depois` meses à frente. Formato AAAA-MM. */
export function mesesAte(hoje: string, n: number, depois = 0): string[] {
  const atual = hoje.slice(0, 7);
  return Array.from({ length: n + depois }, (_, i) => somarMeses(atual, i - n + 1));
}

export interface PontoMes {
  mes: string;
  faturado: number;
  recebido: number;
}

/** Faturado (mensalidades não canceladas da competência) e recebido (baixas válidas pela data) de cada mês. */
export function faturadoERecebido(
  cobrancas: Pick<Cobranca, "competencia" | "situacao" | "valor">[],
  baixas: { data: string; total: number; estornada: boolean }[],
  meses: string[],
): PontoMes[] {
  return meses.map((mes) => ({
    mes,
    faturado: r2(
      cobrancas.filter((c) => c.situacao !== "cancelada" && c.competencia.startsWith(mes)).reduce((s, c) => s + Number(c.valor), 0),
    ),
    recebido: r2(baixas.filter((b) => !b.estornada && b.data.startsWith(mes)).reduce((s, b) => s + Number(b.total), 0)),
  }));
}

// ------------------------------------------------------------------ faturamento do mês (junto com o honorário)

export interface LinhaFaturamento {
  cliente_id: string;
  /** Mensalidades da competência que ainda não foram pagas. */
  doMes: number;
  /** Mensalidades da competência já pagas (informação; não entram no total). */
  jaPago: number;
  /** Mensalidades de meses anteriores vencidas e em aberto. */
  atrasado: number;
  /** O que acrescentar ao honorário: doMes + atrasado. */
  total: number;
  descricoes: string[];
}

/**
 * O que acrescentar ao honorário de cada cliente no mês: as mensalidades da competência ainda em aberto e, se pedido,
 * as de meses anteriores que continuam em aberto. Cliente sem nada a cobrar não entra (a não ser que já tenha pago).
 */
export function faturamentoDoMes(cobrancas: Cobranca[], competencia: string, incluirAtrasados: boolean): LinhaFaturamento[] {
  const mes = competencia.slice(0, 7);
  const por = new Map<string, LinhaFaturamento>();
  const linha = (id: string) => {
    if (!por.has(id)) por.set(id, { cliente_id: id, doMes: 0, jaPago: 0, atrasado: 0, total: 0, descricoes: [] });
    return por.get(id)!;
  };
  for (const c of cobrancas) {
    if (c.situacao === "cancelada") continue;
    const doMes = c.competencia.startsWith(mes);
    if (doMes) {
      const l = linha(c.cliente_id);
      if (c.situacao === "paga") l.jaPago = r2(l.jaPago + Number(c.valor));
      else {
        l.doMes = r2(l.doMes + Number(c.valor));
        l.descricoes.push(c.descricao);
      }
    } else if (incluirAtrasados && c.situacao === "aberta" && c.competencia.slice(0, 7) < mes) {
      const l = linha(c.cliente_id);
      l.atrasado = r2(l.atrasado + Number(c.valor));
      l.descricoes.push(c.descricao);
    }
  }
  return [...por.values()].map((l) => ({ ...l, total: r2(l.doMes + l.atrasado) }));
}
