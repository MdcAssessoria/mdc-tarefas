// Formatação de números, percentuais e índices financeiros (liquidez, margens, prazos) em pt-BR.
import { brl } from "./moeda";

/** Número com casas decimais fixas: fmtNumero(1234.5) → "1.234,50". */
export function fmtNumero(v: number, casas = 2): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/** Fração como percentual: fmtPercentual(0.1234) → "12,3%" (até `casas` decimais); vazio ou infinito → "—". */
export function fmtPercentual(v: number | null | undefined, casas = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return (v * 100).toLocaleString("pt-BR", { maximumFractionDigits: casas }) + "%";
}

/** Como cada índice é mostrado: "x" (vezes, 2 casas), "%" (percentual), "R$" (reais inteiros) ou "dias". */
export type FormatoIndice = "x" | "%" | "R$" | "dias";

/** Valor de um índice no formato dele; vazio ou infinito → "—". */
export function fmtIndice(v: number | null | undefined, f: FormatoIndice): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  if (f === "x") return fmtNumero(v, 2);
  if (f === "%") return fmtPercentual(v);
  if (f === "dias") return `${Math.round(v)} dias`;
  return brl(v, { centavos: false });
}
