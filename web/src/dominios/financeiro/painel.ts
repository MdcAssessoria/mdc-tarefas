// Contas do painel inicial do Financeiro (funções puras, testadas em painel.test.ts): o que vence hoje, o que está
// vencido, os próximos 7 dias, o fluxo de caixa previsto dos próximos 30 dias, o realizado dos últimos meses e as
// maiores despesas do mês por categoria. Não lê o banco: a tela entrega os títulos, as baixas e o saldo atual.
import { somarDias, somarMeses } from "@/lib/datas";
import { saldoDoTitulo } from "./regras";
import { saldoDaConta } from "./tipos";
import type { Baixa, Categoria, ContaBancaria, LinhaExtrato, Titulo, Transferencia } from "./tipos";

const r2 = (v: number) => Math.round(v * 100) / 100;

type TituloAberto = Pick<Titulo, "tipo" | "vencimento" | "valor" | "valor_pago" | "situacao">;

export interface Soma {
  valor: number;
  qtd: number;
}
export interface ResumoPrazos {
  hoje: { pagar: Soma; receber: Soma };
  vencidos: { pagar: Soma; receber: Soma };
  /** De amanhã até daqui a 7 dias (inclusive). */
  semana: { pagar: Soma; receber: Soma };
}

const vazio = (): Soma => ({ valor: 0, qtd: 0 });

/** Agrupa os títulos em aberto por prazo: vencidos (antes de hoje), hoje e próximos 7 dias. Usa o que falta pagar. */
export function resumirPrazos(titulos: TituloAberto[], hoje: string): ResumoPrazos {
  const r: ResumoPrazos = {
    hoje: { pagar: vazio(), receber: vazio() },
    vencidos: { pagar: vazio(), receber: vazio() },
    semana: { pagar: vazio(), receber: vazio() },
  };
  const limite = somarDias(hoje, 7);
  for (const t of titulos) {
    if (t.situacao !== "aberto") continue;
    const falta = saldoDoTitulo(t);
    if (falta <= 0) continue;
    const faixa = t.vencimento < hoje ? r.vencidos : t.vencimento === hoje ? r.hoje : t.vencimento <= limite ? r.semana : null;
    if (!faixa) continue;
    faixa[t.tipo].valor = r2(faixa[t.tipo].valor + falta);
    faixa[t.tipo].qtd++;
  }
  return r;
}

export interface DiaFluxo {
  data: string;
  entra: number;
  sai: number;
  /** Saldo no fim do dia (saldo atual + tudo que entra − tudo que sai até este dia). */
  saldo: number;
}

/**
 * Fluxo de caixa previsto: começa no saldo atual dos bancos e soma, dia a dia, o que falta receber e pagar dos títulos
 * em aberto. O que já está vencido e não foi pago conta no dia de hoje (ainda vai sair ou entrar). Devolve `dias`
 * dias a partir de hoje (hoje incluído).
 */
export function fluxoPrevisto(saldoAtual: number, titulos: TituloAberto[], hoje: string, dias = 30): DiaFluxo[] {
  const fim = somarDias(hoje, dias - 1);
  const porDia = new Map<string, { entra: number; sai: number }>();
  for (const t of titulos) {
    if (t.situacao !== "aberto") continue;
    const falta = saldoDoTitulo(t);
    if (falta <= 0 || t.vencimento > fim) continue;
    const dia = t.vencimento < hoje ? hoje : t.vencimento;
    const x = porDia.get(dia) ?? { entra: 0, sai: 0 };
    if (t.tipo === "receber") x.entra += falta;
    else x.sai += falta;
    porDia.set(dia, x);
  }
  const saida: DiaFluxo[] = [];
  let saldo = saldoAtual;
  for (let i = 0; i < dias; i++) {
    const data = somarDias(hoje, i);
    const x = porDia.get(data) ?? { entra: 0, sai: 0 };
    saldo = r2(saldo + x.entra - x.sai);
    saida.push({ data, entra: r2(x.entra), sai: r2(x.sai), saldo });
  }
  return saida;
}

/** Menor saldo previsto do período e o dia em que acontece (para avisar quando o caixa fica negativo). */
export function menorSaldo(fluxo: DiaFluxo[]): DiaFluxo | null {
  return fluxo.reduce<DiaFluxo | null>((m, d) => (!m || d.saldo < m.saldo ? d : m), null);
}

export interface MesRealizado {
  /** AAAA-MM */
  mes: string;
  entrou: number;
  saiu: number;
}

type BaixaPainel = Pick<Baixa, "titulo_id" | "data" | "valor" | "juros" | "multa" | "desconto" | "total" | "estornada">;

/**
 * Dinheiro que entrou e saiu de verdade em cada um dos últimos `meses` meses (o atual incluído), pelas baixas não
 * estornadas. Usa o total da baixa (o que passou no banco: valor + juros + multa − desconto).
 */
export function realizadoPorMes(
  baixas: BaixaPainel[],
  tipoDoTitulo: Map<string, Titulo["tipo"]>,
  hoje: string,
  meses = 6,
): MesRealizado[] {
  const lista = Array.from({ length: meses }, (_, i) => ({ mes: somarMeses(hoje, i - meses + 1), entrou: 0, saiu: 0 }));
  const idx = new Map(lista.map((m, i) => [m.mes, i]));
  for (const b of baixas) {
    if (b.estornada) continue;
    const i = idx.get(b.data.slice(0, 7));
    const tipo = tipoDoTitulo.get(b.titulo_id);
    if (i === undefined || !tipo) continue;
    const total = Number(b.total ?? Number(b.valor) + Number(b.juros) + Number(b.multa) - Number(b.desconto));
    if (tipo === "receber") lista[i].entrou = r2(lista[i].entrou + total);
    else lista[i].saiu = r2(lista[i].saiu + total);
  }
  return lista;
}

export interface FatiaCategoria {
  id: string;
  nome: string;
  valor: number;
}

/**
 * Maiores despesas pagas no mês (AAAA-MM) por categoria, como em Entradas e saídas: o valor do título vai para a
 * categoria dele e juros/multa para "Juros e multas pagos". Mostra as `limite` maiores e junta o resto em "Outras".
 */
export function despesasPorCategoria(
  baixas: BaixaPainel[],
  titulos: Map<string, Pick<Titulo, "tipo" | "categoria_id">>,
  categorias: Map<string, Pick<Categoria, "nome">>,
  mes: string,
  limite = 5,
): FatiaCategoria[] {
  const m = new Map<string, FatiaCategoria>();
  const somar = (id: string, nome: string, v: number) => {
    if (v <= 0) return;
    const x = m.get(id) ?? { id, nome, valor: 0 };
    x.valor = r2(x.valor + v);
    m.set(id, x);
  };
  for (const b of baixas) {
    if (b.estornada || b.data.slice(0, 7) !== mes) continue;
    const t = titulos.get(b.titulo_id);
    if (!t || t.tipo !== "pagar") continue;
    somar(t.categoria_id, categorias.get(t.categoria_id)?.nome ?? "Sem categoria", Number(b.valor));
    somar("_juros_pagos", "Juros e multas pagos", Number(b.juros) + Number(b.multa));
  }
  const ordenado = [...m.values()].sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome));
  if (ordenado.length <= limite) return ordenado;
  const resto = ordenado.slice(limite).reduce((a, x) => a + x.valor, 0);
  return [...ordenado.slice(0, limite), { id: "_outras", nome: "Outras", valor: r2(resto) }];
}

/**
 * Saldo atual de uma conta: o saldo pelos extratos mais as transferências entre contas registradas DEPOIS do último
 * dia já importado do extrato daquela conta (as de antes já estão no extrato; contar de novo seria em dobro).
 * Sem extrato importado, vale a data do saldo inicial; sem ela, contam todas. Estornadas não contam.
 */
export function saldoComTransferencias(
  conta: ContaBancaria,
  linhas: Pick<LinhaExtrato, "conta_id" | "data" | "valor">[],
  transferencias: Pick<Transferencia, "origem_id" | "destino_id" | "data" | "valor" | "estornada">[],
): number {
  const daConta = linhas.filter((l) => l.conta_id === conta.id);
  const corte = daConta.reduce<string | null>((m, l) => (!m || l.data > m ? l.data : m), null) ?? conta.saldo_inicial_em;
  let saldo = saldoDaConta(conta, daConta);
  for (const t of transferencias) {
    if (t.estornada || (corte && t.data <= corte)) continue;
    if (t.origem_id === conta.id) saldo -= Number(t.valor);
    if (t.destino_id === conta.id) saldo += Number(t.valor);
  }
  return r2(saldo);
}

export interface PassoInicial {
  id: "plano" | "banco" | "categorias" | "lancar";
  feito: boolean;
}

/** Os primeiros passos de uma empresa nova no Financeiro, na ordem em que precisam ser feitos. */
export function primeirosPassos(c: { plano: number; bancos: number; categorias: number; titulos: number }): PassoInicial[] {
  return [
    { id: "plano", feito: c.plano > 0 },
    { id: "banco", feito: c.bancos > 0 },
    { id: "categorias", feito: c.categorias > 0 },
    { id: "lancar", feito: c.titulos > 0 },
  ];
}

/** "Bom dia", "Boa tarde" ou "Boa noite" pela hora (0–23) no fuso da organização. */
export const saudacao = (hora: number) => (hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite");

/** Valor curto para eixos de gráfico: 1.500 → "1,5 mil"; 2.300.000 → "2,3 mi"; negativos com sinal. */
export function valorCurto(v: number): string {
  const a = Math.abs(v);
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ","));
  const s = a >= 1e6 ? `${fmt(Math.round(a / 1e5) / 10)} mi` : a >= 1e3 ? `${fmt(Math.round(a / 100) / 10)} mil` : `${Math.round(a)}`;
  return (v < 0 ? "-" : "") + s;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** "2026-11" → "nov/26" */
export const rotuloMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`;
