// Valor em reais nas listas; negativo sai em vermelho. `sinal` colore também o positivo de verde (entradas).
import { brl } from "@/lib/formato/moeda";

export function Valor({ v, sinal, className = "" }: { v: number; sinal?: boolean; className?: string }) {
  const cor = v < 0 ? "text-[var(--perigo)]" : sinal && v > 0 ? "text-emerald-800" : "";
  return <span className={`num whitespace-nowrap ${cor} ${className}`}>{brl(v)}</span>;
}
