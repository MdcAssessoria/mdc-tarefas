// Cartões das margens da DRE (bruta, operacional e líquida) no padrão MDC (CartaoFaixa). Regras em ../margens.ts.
// Sem receita líquida no período, não mostra nada.
import { calcularMargens, fmtMargem, regua } from "../margens";
import type { Matriz } from "../relatorio";
import { CartaoFaixa } from "./CartaoFaixa";

export function CartoesMargem({ m }: { m: Matriz }) {
  const margens = calcularMargens(m);
  if (!margens) return null;
  return (
    <section aria-label="Margens do período" className="grid gap-3 md:grid-cols-3">
      {margens.map((x) => (
        <CartaoFaixa
          key={x.faixa.codigo}
          titulo={x.faixa.titulo}
          valor={fmtMargem(x.valor)}
          nivel={x.nivel}
          regua={regua(x.faixa, x.valor)}
          frase={x.frase}
          dica={x.regua}
        />
      ))}
    </section>
  );
}
