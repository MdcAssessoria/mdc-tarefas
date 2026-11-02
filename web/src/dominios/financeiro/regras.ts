// Regras puras do Financeiro (sem banco, testadas em regras.test.ts): valores digitados, período dos filtros, parcelas e
// situação exibida dos títulos. As mesmas contas de parcelas são feitas no banco (fin_lancar); aqui servem à prévia.
import { somarMeses } from "@/lib/datas";
import { fimDoMes } from "@/lib/periodo";
import type { Titulo } from "./tipos";

// ------------------------------------------------------------------ CPF / CNPJ
// Moram em lib/documento.ts (fonte única do site).

// ------------------------------------------------------------------ valores digitados

/**
 * Valor digitado no padrão brasileiro: "1.234,56" → 1234.56; "1.250" → 1250 (ponto é milhar); "1250.5" → 1250.5
 * (um ponto seguido de 1, 2 ou 4+ casas, ou depois de zero como em "0.500", é decimal, como vem de copiar e colar); vazio → 0; inválido → NaN.
 */
export function numeroBr(s: string): number {
  const t = s.replace(/\s|R\$/g, "");
  if (!t) return 0;
  let normal: string;
  if (t.includes(",")) normal = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(t)) normal = t.replace(/\./g, "");
  else normal = t;
  const n = Number(normal);
  return Number.isFinite(n) ? n : NaN;
}

export const valorParaCampo = (v: number | null | undefined, casas = 2) =>
  v == null ? "" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: Math.max(casas, 4) });

// ------------------------------------------------------------------ período dos filtros
// Mora em lib/periodo.ts (o filtro de período é peça comum de tela); reexportado aqui para as telas do Financeiro.
export { PERIODOS, fimDoMes, intervaloDoPeriodo } from "@/lib/periodo";
export type { Periodo } from "@/lib/periodo";

// ------------------------------------------------------------------ parcelas

/** Mesmo dia do mês seguinte; se o mês não tiver o dia (31/02), usa o último dia (igual ao banco). */
export function somarMesesData(data: string, n: number): string {
  const m = somarMeses(data, n);
  const dia = Number(data.slice(8, 10));
  const ultimo = Number(fimDoMes(m).slice(8, 10));
  return `${m}-${String(Math.min(dia, ultimo)).padStart(2, "0")}`;
}

/** Prévia das parcelas: valor dividido igual, centavos que sobram na última; vencimentos mensais. */
export function dividirParcelas(
  total: number,
  n: number,
  primeiroVencimento: string,
): { parcela: number; vencimento: string; valor: number }[] {
  const centavos = Math.round(total * 100);
  const base = Math.floor(centavos / n);
  return Array.from({ length: n }, (_, k) => ({
    parcela: k + 1,
    vencimento: somarMesesData(primeiroVencimento, k),
    valor: (k === n - 1 ? centavos - base * (n - 1) : base) / 100,
  }));
}

// ------------------------------------------------------------------ situação exibida

export type SituacaoExibida = "vencido" | "vence_hoje" | "a_vencer" | "parcial" | "quitado" | "cancelado";
/** Nome e cor do chip de cada situação (a cor é um tom de `Chip`, em componentes/Comuns.tsx). */
export const SITUACOES: Record<SituacaoExibida, { nome: string; tom: "vermelho" | "ambar" | "azul" | "violeta" | "verde" | "neutro" }> = {
  vencido: { nome: "Vencido", tom: "vermelho" },
  vence_hoje: { nome: "Vence hoje", tom: "ambar" },
  a_vencer: { nome: "A vencer", tom: "azul" },
  parcial: { nome: "Pago em parte", tom: "violeta" },
  quitado: { nome: "Pago", tom: "verde" },
  cancelado: { nome: "Cancelado", tom: "neutro" },
};

export function situacaoDoTitulo(t: Pick<Titulo, "situacao" | "vencimento" | "valor_pago">, hoje: string): SituacaoExibida {
  if (t.situacao === "cancelado") return "cancelado";
  if (t.situacao === "quitado") return "quitado";
  if (t.vencimento < hoje) return "vencido";
  if (Number(t.valor_pago) > 0) return "parcial";
  return t.vencimento === hoje ? "vence_hoje" : "a_vencer";
}

/** Quanto falta pagar/receber. */
export const saldoDoTitulo = (t: Pick<Titulo, "valor" | "valor_pago" | "situacao">) =>
  t.situacao === "cancelado" ? 0 : Math.round((Number(t.valor) - Number(t.valor_pago)) * 100) / 100;
