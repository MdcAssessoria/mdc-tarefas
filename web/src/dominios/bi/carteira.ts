// Carteira de pedidos no BI (117): situação de cada pedido (atendido, em carteira, atrasado), resumo do período,
// faixas de previsão de entrega da carteira e volume por cliente. "Atendido" = pedido faturado na Omie (o pedido
// inteiro; a Omie não informa faturamento parcial por item nesta leitura). Datas "AAAA-MM-DD"; `hoje` vem de fora.
import { semAcento } from "@/lib/texto";

export interface PedidoCarteira {
  cliente_id: string;
  empresa: string;
  codigo_pedido: string;
  numero: string | null;
  numero_cliente: string | null;
  cliente_doc: string | null;
  cliente_nome: string | null;
  etapa: string | null;
  etapa_nome: string | null;
  inclusao: string | null;
  previsao: string | null;
  faturado: boolean;
  faturamento: string | null;
  valor: number | string;
  quantidade: number | string;
  itens: number;
}

export type SituacaoPedido = "atendido" | "atrasado" | "carteira";

export const NOME_SITUACAO: Record<SituacaoPedido, string> = {
  atendido: "Atendido",
  atrasado: "Atrasado",
  carteira: "Em carteira",
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const valorDe = (p: PedidoCarteira) => Number(p.valor) || 0;
const noPeriodo = (d: string | null, de: string, ate: string) => !!d && d >= de && d <= ate;

export function situacao(p: PedidoCarteira, hoje: string): SituacaoPedido {
  if (p.faturado) return "atendido";
  return p.previsao && p.previsao < hoje ? "atrasado" : "carteira";
}

export const nomeCliente = (p: PedidoCarteira) => p.cliente_nome?.trim() || "Cliente sem cadastro";

export interface Soma {
  qtd: number;
  valor: number;
}
const somar = (ps: PedidoCarteira[]): Soma => ({ qtd: ps.length, valor: r2(ps.reduce((s, p) => s + valorDe(p), 0)) });

export interface ResumoCarteira {
  /** Pedidos que entraram no período. */
  periodo: Soma;
  /** Desses, os já faturados. */
  atendidos: Soma;
  /** Atendido ÷ pedidos do período, em valor (null sem pedidos). */
  pctAtendido: number | null;
  /** Tudo o que está sem faturar hoje, de qualquer data. */
  carteira: Soma;
  /** Da carteira, com previsão de entrega vencida. */
  atrasados: Soma;
  /** Faturado no período (de pedidos de qualquer data). */
  faturadoNoPeriodo: Soma;
}

export function resumirCarteira(ps: PedidoCarteira[], de: string, ate: string, hoje: string): ResumoCarteira {
  const doPeriodo = ps.filter((p) => noPeriodo(p.inclusao, de, ate));
  const periodo = somar(doPeriodo);
  const atendidos = somar(doPeriodo.filter((p) => p.faturado));
  const abertos = ps.filter((p) => !p.faturado);
  return {
    periodo,
    atendidos,
    pctAtendido: periodo.valor > 0 ? atendidos.valor / periodo.valor : null,
    carteira: somar(abertos),
    atrasados: somar(abertos.filter((p) => situacao(p, hoje) === "atrasado")),
    faturadoNoPeriodo: somar(ps.filter((p) => p.faturado && noPeriodo(p.faturamento, de, ate))),
  };
}

const somaDias = (iso: string, dias: number) => new Date(Date.parse(iso + "T12:00:00Z") + dias * 86400_000).toISOString().slice(0, 10);
const fimDoMes = (iso: string) => {
  const d = new Date(Date.parse(iso.slice(0, 8) + "01T12:00:00Z"));
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
};

export interface FaixaPrevisao extends Soma {
  id: "atrasado" | "semana" | "mes" | "proximo" | "depois" | "sem";
  nome: string;
}

/** A carteira (sem faturar) pela previsão de entrega: atrasado, próximos 7 dias, até o fim do mês, mês que vem, depois, sem previsão. */
export function faixasPrevisao(ps: PedidoCarteira[], hoje: string): FaixaPrevisao[] {
  const semana = somaDias(hoje, 7);
  const fimMes = fimDoMes(hoje);
  const fimProximo = fimDoMes(somaDias(fimMes, 1));
  const faixas: [FaixaPrevisao["id"], string, (d: string | null) => boolean][] = [
    ["atrasado", "Atrasados", (d) => !!d && d < hoje],
    ["semana", "Próximos 7 dias", (d) => !!d && d >= hoje && d <= semana],
    ["mes", "Até o fim do mês", (d) => !!d && d > semana && d <= fimMes],
    ["proximo", "Mês que vem", (d) => !!d && d > semana && d > fimMes && d <= fimProximo],
    ["depois", "Depois", (d) => !!d && d > fimProximo && d > semana],
    ["sem", "Sem previsão", (d) => !d],
  ];
  const abertos = ps.filter((p) => !p.faturado);
  return faixas.map(([id, nome, f]) => ({ id, nome, ...somar(abertos.filter((p) => f(p.previsao))) }));
}

/** Carteira por mês de previsão ("AAAA-MM"), em ordem; atrasados entram no mês da previsão. */
export function carteiraPorMes(ps: PedidoCarteira[]): { mes: string; qtd: number; valor: number }[] {
  const m = new Map<string, Soma>();
  for (const p of ps) {
    if (p.faturado || !p.previsao) continue;
    const k = p.previsao.slice(0, 7);
    const s = m.get(k) ?? { qtd: 0, valor: 0 };
    m.set(k, { qtd: s.qtd + 1, valor: r2(s.valor + valorDe(p)) });
  }
  return [...m].sort(([a], [b]) => a.localeCompare(b)).map(([mes, s]) => ({ mes, ...s }));
}

export interface VolumeCliente {
  chave: string;
  cliente: string;
  doc: string | null;
  pedidosPeriodo: number;
  valorPeriodo: number;
  atendidoPeriodo: number;
  pctAtendido: number | null;
  carteira: number;
  atrasado: number;
  proximaPrevisao: string | null;
}

/** Volume por cliente: pedidos do período (e quanto deles já foi faturado) e o que está em carteira hoje. */
export function volumePorCliente(ps: PedidoCarteira[], de: string, ate: string, hoje: string): VolumeCliente[] {
  const m = new Map<string, VolumeCliente>();
  for (const p of ps) {
    const chave = p.cliente_doc || `${p.cliente_id}:${nomeCliente(p)}`;
    const v =
      m.get(chave) ??
      ({ chave, cliente: nomeCliente(p), doc: p.cliente_doc, pedidosPeriodo: 0, valorPeriodo: 0, atendidoPeriodo: 0, pctAtendido: null, carteira: 0, atrasado: 0, proximaPrevisao: null } as VolumeCliente);
    const valor = valorDe(p);
    if (noPeriodo(p.inclusao, de, ate)) {
      v.pedidosPeriodo += 1;
      v.valorPeriodo = r2(v.valorPeriodo + valor);
      if (p.faturado) v.atendidoPeriodo = r2(v.atendidoPeriodo + valor);
    }
    if (!p.faturado) {
      v.carteira = r2(v.carteira + valor);
      if (situacao(p, hoje) === "atrasado") v.atrasado = r2(v.atrasado + valor);
      else if (p.previsao && (!v.proximaPrevisao || p.previsao < v.proximaPrevisao)) v.proximaPrevisao = p.previsao;
    }
    m.set(chave, v);
  }
  return [...m.values()]
    .map((v) => ({ ...v, pctAtendido: v.valorPeriodo > 0 ? v.atendidoPeriodo / v.valorPeriodo : null }))
    .filter((v) => v.valorPeriodo || v.carteira)
    .sort((a, b) => b.valorPeriodo + b.carteira - (a.valorPeriodo + a.carteira) || a.cliente.localeCompare(b.cliente, "pt-BR"));
}

/** Busca por número do pedido, pedido do cliente, cliente, CNPJ/CPF ou etapa. */
export function filtrarPedidos(ps: PedidoCarteira[], busca: string): PedidoCarteira[] {
  const t = semAcento(busca).toLowerCase().trim();
  if (!t) return ps;
  const dig = t.replace(/\D/g, "");
  return ps.filter((p) => {
    const texto = semAcento([p.numero, p.numero_cliente, nomeCliente(p), p.etapa_nome, p.empresa].join(" ")).toLowerCase();
    return texto.includes(t) || (dig.length >= 3 && (p.cliente_doc ?? "").includes(dig));
  });
}
