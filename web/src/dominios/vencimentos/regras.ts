// Regras da lista de vencimentos (sem tela): dias até vencer, filtro por prazo, contagens dos indicadores e a etiqueta
// de situação. "hoje" é o dia AAAA-MM-DD no fuso da organização. Testado em regras.test.ts.
import type { Tom } from "@/components/ui/Tons";
import { diasEntre } from "@/dominios/tarefas/regras";

export const diasParaVencer = (venceEm: string, hoje: string) => diasEntre(hoje, venceEm) ?? 0;

export type FiltroPrazo = "padrao" | "vencidos" | "7" | "30" | "60" | "todos";
export const FILTROS_PRAZO: { id: FiltroPrazo; nome: string }[] = [
  { id: "padrao", nome: "Vencidos e próximos 90 dias" },
  { id: "vencidos", nome: "Só vencidos" },
  { id: "7", nome: "Vencem em até 7 dias" },
  { id: "30", nome: "Vencem em até 30 dias" },
  { id: "60", nome: "Vencem em até 60 dias" },
  { id: "todos", nome: "Todos" },
];

/** O vencimento entra no filtro? "Em até N dias" vai de hoje a hoje + N (os vencidos têm filtro próprio). */
export function passaPrazo(dias: number, f: FiltroPrazo): boolean {
  switch (f) {
    case "padrao":
      return dias <= 90;
    case "vencidos":
      return dias < 0;
    case "todos":
      return true;
    default:
      return dias >= 0 && dias <= Number(f);
  }
}

export function contarVencimentos(itens: { vence_em: string }[], hoje: string) {
  const c = { vencidos: 0, d7: 0, d30: 0, d60: 0 };
  for (const i of itens) {
    const d = diasParaVencer(i.vence_em, hoje);
    if (d < 0) c.vencidos++;
    else {
      if (d <= 7) c.d7++;
      if (d <= 30) c.d30++;
      if (d <= 60) c.d60++;
    }
  }
  return c;
}

/** Etiqueta da situação: vermelho = vencido, âmbar = até 7 dias, azul = a vencer. */
export function situacaoDoVencimento(dias: number): { texto: string; tom: Tom } {
  if (dias < 0) return { texto: dias === -1 ? "Venceu ontem" : `Vencido há ${-dias} dias`, tom: "vermelho" };
  if (dias === 0) return { texto: "Vence hoje", tom: "ambar" };
  if (dias === 1) return { texto: "Vence amanhã", tom: "ambar" };
  return { texto: `Em ${dias} dias`, tom: dias <= 7 ? "ambar" : "azul" };
}
