// Cartão de indicador com faixa (padrão MDC): título, situação em cor, valor, régua das três faixas com o ponto do
// período e uma frase curta. Usado nas margens da DRE e nos indicadores principais.
import { Chip } from "@/components/ui/Chip";
import { TONS } from "@/components/ui/Tons";
import { NOME_DO_NIVEL, TOM_DO_NIVEL } from "../margens";
import type { NivelMargem } from "../margens";

export function CartaoFaixa({
  titulo,
  valor,
  nivel,
  regua,
  frase,
  dica,
  nota,
}: {
  titulo: string;
  valor: string;
  nivel: NivelMargem | null;
  regua: { fimBaixa: number; fimMedia: number; marca: number };
  frase: string;
  /** Como foi calculado (aparece ao passar o mouse). */
  dica?: string;
  /** Premissa em letra pequena. */
  nota?: string;
}) {
  const tom = nivel ? TOM_DO_NIVEL[nivel] : "neutro";
  return (
    <div className="rounded-xl border border-[var(--borda)] bg-white p-3.5" title={dica}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--texto-suave)]">{titulo}</p>
        {nivel && <Chip tom={tom}>{NOME_DO_NIVEL[nivel]}</Chip>}
      </div>
      <p className={`num mt-1 text-2xl font-semibold tracking-tight ${nivel ? TONS[tom].valor : "text-[var(--texto-suave)]"}`}>{valor}</p>
      {nivel && (
        <div className="relative mt-2 h-1.5 rounded-full" aria-hidden="true">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: `linear-gradient(to right, #f3c7c2 0 ${regua.fimBaixa}%, #f6e2b3 ${regua.fimBaixa}% ${regua.fimMedia}%, #bfe3cf ${regua.fimMedia}% 100%)`,
            }}
          />
          <div
            className="absolute -top-1 h-3.5 w-1 -translate-x-1/2 rounded-full bg-[var(--marca)] ring-2 ring-white"
            style={{ left: `${regua.marca}%` }}
          />
        </div>
      )}
      <p className="mt-2 text-[13px] leading-snug text-[var(--texto)]">{frase}</p>
      {nota && <p className="mt-1 text-[11.5px] leading-snug text-[var(--texto-suave)]">{nota}</p>}
    </div>
  );
}
