// Cartões das margens da DRE (bruta, operacional e líquida) no padrão MDC: valor, faixa em cor, régua com as três
// faixas e o ponto do período, e uma frase curta em reais. Regras em ../margens.ts. Sem receita líquida, não mostra nada.
import { Chip } from "@/components/ui/Chip";
import { TONS } from "@/components/ui/Tons";
import { calcularMargens, fmtMargem, NOME_DO_NIVEL, regua, TOM_DO_NIVEL } from "../margens";
import type { Matriz } from "../relatorio";

export function CartoesMargem({ m }: { m: Matriz }) {
  const margens = calcularMargens(m);
  if (!margens) return null;
  return (
    <section aria-label="Margens do período" className="grid gap-3 md:grid-cols-3">
      {margens.map((x) => {
        const tom = TOM_DO_NIVEL[x.nivel];
        const r = regua(x.faixa, x.valor);
        return (
          <div key={x.faixa.codigo} className="rounded-xl border border-[var(--borda)] bg-white p-3.5" title={x.regua}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--texto-suave)]">{x.faixa.titulo}</p>
              <Chip tom={tom}>{NOME_DO_NIVEL[x.nivel]}</Chip>
            </div>
            <p className={`num mt-1 text-2xl font-semibold tracking-tight ${TONS[tom].valor}`}>{fmtMargem(x.valor)}</p>
            <div className="relative mt-2 h-1.5 rounded-full" aria-hidden="true">
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background: `linear-gradient(to right, #f3c7c2 0 ${r.fimBaixa}%, #f6e2b3 ${r.fimBaixa}% ${r.fimMedia}%, #bfe3cf ${r.fimMedia}% 100%)`,
                }}
              />
              <div
                className="absolute -top-1 h-3.5 w-1 -translate-x-1/2 rounded-full bg-[var(--marca)] ring-2 ring-white"
                style={{ left: `${r.marca}%` }}
              />
            </div>
            <p className="mt-2 text-[13px] leading-snug text-[var(--texto)]">{x.frase}</p>
          </div>
        );
      })}
    </section>
  );
}
