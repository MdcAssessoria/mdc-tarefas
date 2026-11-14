// MDC · Pessoal: resumo do dia das finanças da família (o que está atrasado, vence hoje, nos próximos 7 dias e o que
// entra). Regra pura, usada no Início do app; o aviso diário do banco (fase 3) segue a mesma divisão.
import { somarDias } from "@/lib/datas";

export interface TituloResumo {
  id: string;
  tipo: "pagar" | "receber";
  descricao: string;
  vencimento: string;
  valor: number;
  valor_pago: number;
}

export interface GrupoResumo {
  itens: TituloResumo[];
  total: number;
}

export interface ResumoDoDia {
  atrasadas: GrupoResumo;
  hoje: GrupoResumo;
  proximos7: GrupoResumo;
  receber7: GrupoResumo;
}

const falta = (t: TituloResumo) => Math.max(0, Math.round((t.valor - t.valor_pago) * 100) / 100);

function grupo(itens: TituloResumo[]): GrupoResumo {
  const ordenados = [...itens].sort((a, b) => a.vencimento.localeCompare(b.vencimento) || b.valor - a.valor);
  return { itens: ordenados, total: Math.round(ordenados.reduce((s, t) => s + falta(t), 0) * 100) / 100 };
}

/** Divide os títulos em aberto pelo vencimento, contando só o que ainda falta pagar ou receber. */
export function resumoDoDia(titulos: TituloResumo[], hoje: string): ResumoDoDia {
  const ate7 = somarDias(hoje, 7);
  const abertos = titulos.filter((t) => falta(t) > 0);
  const pagar = abertos.filter((t) => t.tipo === "pagar");
  return {
    atrasadas: grupo(pagar.filter((t) => t.vencimento < hoje)),
    hoje: grupo(pagar.filter((t) => t.vencimento === hoje)),
    proximos7: grupo(pagar.filter((t) => t.vencimento > hoje && t.vencimento <= ate7)),
    receber7: grupo(abertos.filter((t) => t.tipo === "receber" && t.vencimento <= ate7)),
  };
}

export function valorEmAberto(t: TituloResumo): number {
  return falta(t);
}
