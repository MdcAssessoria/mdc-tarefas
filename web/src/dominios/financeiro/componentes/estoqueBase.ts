// Peças comuns das abas de estoque: formato de quantidade, nomes dos tipos e origens, e os dados das três abas.
import { useCallback } from "react";
import { useConsulta } from "@/lib/useConsulta";
import { lerCategorias, lerItens, lerLocais, lerSaldos } from "../leituras";
import type { TipoMovimento } from "../tipos";

export const qtd = (n: number | null | undefined) => Number(n ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
export const TIPOS_MOV: Record<TipoMovimento, { nome: string; tom: string }> = {
  entrada: { nome: "Entrada", tom: "bg-emerald-50 text-emerald-800" },
  saida: { nome: "Saída", tom: "bg-red-50 text-red-800" },
  ajuste: { nome: "Inventário", tom: "bg-amber-50 text-amber-900" },
  transferencia: { nome: "Transferência", tom: "bg-sky-50 text-sky-900" },
};
export const ORIGENS: Record<string, string> = {
  manual: "Manual",
  pedido_compra: "Pedido de compra",
  pedido_venda: "Pedido de venda",
  nota_entrada: "Nota de entrada",
  nota_saida: "Nota de saída",
};

/** Dados comuns às três abas (itens, locais, saldos). */
export function useBaseEstoque(cliente: string) {
  return useConsulta(
    useCallback(async () => {
      const [itens, locais, saldos, categorias] = await Promise.all([
        lerItens(cliente),
        lerLocais(cliente),
        lerSaldos(cliente),
        lerCategorias(cliente),
      ]);
      const porItem = new Map<string, number>();
      for (const s of saldos) porItem.set(s.item_id, (porItem.get(s.item_id) ?? 0) + Number(s.saldo));
      return { itens, locais, saldos, categorias, porItem };
    }, [cliente]),
  );
}
