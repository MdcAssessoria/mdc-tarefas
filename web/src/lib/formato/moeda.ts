// Formatação de dinheiro em reais. É a única função brl() do HUB: não crie outra.

export interface OpcoesMoeda {
  /** false arredonda para reais inteiros ("R$ 1.235"), como nos painéis e textos dos demonstrativos. Padrão: true. */
  centavos?: boolean;
}

/** Valor em reais: brl(1234.5) → "R$ 1.234,50"; brl(1234.5, { centavos: false }) → "R$ 1.235"; vazio → "—". */
export function brl(v: number | null | undefined, { centavos = true }: OpcoesMoeda = {}): string {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString(
    "pt-BR",
    centavos ? { style: "currency", currency: "BRL" } : { style: "currency", currency: "BRL", maximumFractionDigits: 0 },
  );
}
