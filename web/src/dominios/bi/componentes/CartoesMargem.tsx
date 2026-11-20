// Cartões das margens da DRE (bruta, operacional e líquida) com a faixa em cor e a explicação em linguagem simples
// (regras em ../margens.ts). Sem receita líquida no período, não mostra nada.
import { Chip } from "@/components/ui/Chip";
import { Icone } from "@/components/ui/Icone";
import { TONS } from "@/components/ui/Tons";
import { calcularMargens, fmtMargem, NOME_DO_NIVEL, TOM_DO_NIVEL } from "../margens";
import type { Matriz } from "../relatorio";

const ICONES = { lucro_bruto: "grafico", resultado_operacional: "engrenagem", resultado_liquido: "tendencia" } as const;

export function CartoesMargem({ m }: { m: Matriz }) {
  const margens = calcularMargens(m);
  if (!margens) return null;
  return (
    <section aria-label="Margens do período" className="grid gap-3 md:grid-cols-3">
      {margens.map((x) => {
        const tom = TOM_DO_NIVEL[x.nivel];
        return (
          <div key={x.faixa.codigo} className="cartao space-y-2 p-4">
            <div className="flex items-start gap-3">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${TONS[tom].icone}`} aria-hidden="true">
                <Icone nome={ICONES[x.faixa.codigo]} className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-[var(--texto-suave)]">{x.faixa.titulo}</p>
                <p className={`num text-xl font-semibold tracking-tight ${TONS[tom].valor}`}>{fmtMargem(x.valor)}</p>
              </div>
              <Chip tom={tom}>{NOME_DO_NIVEL[x.nivel]}</Chip>
            </div>
            <p className="text-sm">{x.frase}</p>
            <p className="text-xs text-[var(--texto-suave)]">{x.regua}</p>
          </div>
        );
      })}
    </section>
  );
}
