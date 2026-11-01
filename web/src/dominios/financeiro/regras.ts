// Regras puras do Financeiro (sem banco, testadas em regras.test.ts): CPF/CNPJ, período dos filtros, parcelas e
// situação exibida dos títulos. As mesmas contas de parcelas são feitas no banco (fin_lancar); aqui servem à prévia.
import { somarDias, somarMeses } from "@/lib/datas";
import type { Titulo } from "./tipos";

// ------------------------------------------------------------------ CPF / CNPJ

export const soDigitos = (s: string) => s.replace(/\D/g, "");

function digitoCpf(base: string, pesoInicial: number) {
  let soma = 0;
  for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}
function digitoCnpj(base: string) {
  const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const soma = base.split("").reduce((a, d, i) => a + Number(d) * pesos[i], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** CPF (11 dígitos) ou CNPJ (14) com dígitos verificadores corretos. */
export function documentoValido(doc: string): boolean {
  const d = soDigitos(doc);
  if (/^(\d)\1+$/.test(d)) return false;
  if (d.length === 11) return digitoCpf(d.slice(0, 9), 10) === Number(d[9]) && digitoCpf(d.slice(0, 10), 11) === Number(d[10]);
  if (d.length === 14) return digitoCnpj(d.slice(0, 12)) === Number(d[12]) && digitoCnpj(d.slice(0, 13)) === Number(d[13]);
  return false;
}

/** 12.345.678/0001-90 ou 123.456.789-01 (devolve como veio se não tiver 11 ou 14 dígitos). */
export function formatarDocumento(doc: string | null | undefined): string {
  const d = soDigitos(doc ?? "");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return doc ?? "";
}

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

export type Periodo = "mes" | "anterior" | "proximo" | "90" | "ano" | "escolher" | "tudo";
export const PERIODOS: { id: Periodo; nome: string }[] = [
  { id: "mes", nome: "Este mês" },
  { id: "anterior", nome: "Mês passado" },
  { id: "proximo", nome: "Próximo mês" },
  { id: "90", nome: "Últimos 90 dias" },
  { id: "ano", nome: "Este ano" },
  { id: "escolher", nome: "Escolher datas" },
  { id: "tudo", nome: "Tudo" },
];

/** Último dia do mês "AAAA-MM" → "AAAA-MM-DD". */
export function fimDoMes(mes: string): string {
  const [a, m] = mes.slice(0, 7).split("-").map(Number);
  return `${mes.slice(0, 7)}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

/** Datas (inclusive) de um período; "tudo" devolve sem limites. `hoje` = AAAA-MM-DD no fuso da organização. */
export function intervaloDoPeriodo(p: Periodo, hoje: string, de = "", ate = ""): { de?: string; ate?: string } {
  const mes = hoje.slice(0, 7);
  switch (p) {
    case "mes":
      return { de: `${mes}-01`, ate: fimDoMes(mes) };
    case "anterior": {
      const m = somarMeses(mes, -1);
      return { de: `${m}-01`, ate: fimDoMes(m) };
    }
    case "proximo": {
      const m = somarMeses(mes, 1);
      return { de: `${m}-01`, ate: fimDoMes(m) };
    }
    case "90":
      return { de: somarDias(hoje, -90), ate: hoje };
    case "ano":
      return { de: `${hoje.slice(0, 4)}-01-01`, ate: `${hoje.slice(0, 4)}-12-31` };
    case "escolher":
      return { de: de || undefined, ate: ate || undefined };
    default:
      return {};
  }
}

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
export const SITUACOES: Record<SituacaoExibida, { nome: string; tom: string }> = {
  vencido: { nome: "Vencido", tom: "bg-red-50 text-red-800" },
  vence_hoje: { nome: "Vence hoje", tom: "bg-amber-50 text-amber-900" },
  a_vencer: { nome: "A vencer", tom: "bg-sky-50 text-sky-900" },
  parcial: { nome: "Pago em parte", tom: "bg-violet-50 text-violet-900" },
  quitado: { nome: "Pago", tom: "bg-emerald-50 text-emerald-800" },
  cancelado: { nome: "Cancelado", tom: "bg-neutral-100 text-neutral-600" },
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
