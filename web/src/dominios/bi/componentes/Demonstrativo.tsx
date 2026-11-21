// Peças do padrão de demonstrativo da MDC (estilo .demo em globals.css), usadas por todas as tabelas de valores do BI:
// o quadro com rolagem e cabeçalho preso, a célula de valor compacta e a classe de cada linha (subtotal, resultado).
import { fmtCelula, RESULTADOS } from "../formatoMatriz";

export { QuadroDemonstrativo } from "@/components/ui/QuadroDemonstrativo";

/** Valor sem "R$", com milhar e sinal; negativo em vermelho. `cor` pinta pelo efeito no resultado (verde melhor, vermelho pior). */
export function TdValor({
  v,
  centavos = false,
  cor,
  className = "",
  rotulo,
}: {
  v: number;
  centavos?: boolean;
  cor?: "melhor" | "pior" | null;
  className?: string;
  rotulo?: string;
}) {
  const tom = cor === "melhor" ? "text-[var(--sucesso)]" : cor === "pior" || (cor === undefined && v < 0) ? "neg" : "";
  return (
    <td className={`demo-num ${tom} ${className}`} data-rotulo={rotulo}>
      {fmtCelula(v, centavos)}
    </td>
  );
}

/** Classe da linha do demonstrativo pelo código e por ser subtotal. */
export const classeDaLinha = (codigo: string, subtotal: boolean) =>
  RESULTADOS.has(codigo) ? "demo-resultado" : subtotal ? "demo-subtotal" : "";
