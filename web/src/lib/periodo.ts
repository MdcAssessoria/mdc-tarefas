// Período dos filtros de lista ("Este mês", "Mês passado"…): opções do seletor e as datas de cada uma.
// Usado pelo FiltroPeriodo (components/ui) e pelas telas de lista. Testado em dominios/financeiro/regras.test.ts.
import { somarDias, somarMeses } from "@/lib/datas";

export type Periodo = "mes" | "anterior" | "proximo" | "90" | "ano" | "escolher" | "tudo";
export const PERIODOS: { id: Periodo; nome: string }[] = [
  { id: "mes", nome: "Este mês" },
  { id: "anterior", nome: "Mês passado" },
  { id: "proximo", nome: "Próximo mês" },
  { id: "90", nome: "Últimos 90 dias" },
  { id: "ano", nome: "Este ano" },
  { id: "escolher", nome: "Escolher datas" },
  { id: "tudo", nome: "Tudo" },
];

/** Último dia do mês "AAAA-MM" → "AAAA-MM-DD". */
export function fimDoMes(mes: string): string {
  const [a, m] = mes.slice(0, 7).split("-").map(Number);
  return `${mes.slice(0, 7)}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

/** Datas (inclusive) de um período; "tudo" devolve sem limites. `hoje` = AAAA-MM-DD no fuso da organização. */
export function intervaloDoPeriodo(p: Periodo, hoje: string, de = "", ate = ""): { de?: string; ate?: string } {
  const mes = hoje.slice(0, 7);
  switch (p) {
    case "mes":
      return { de: `${mes}-01`, ate: fimDoMes(mes) };
    case "anterior": {
      const m = somarMeses(mes, -1);
      return { de: `${m}-01`, ate: fimDoMes(m) };
    }
    case "proximo": {
      const m = somarMeses(mes, 1);
      return { de: `${m}-01`, ate: fimDoMes(m) };
    }
    case "90":
      return { de: somarDias(hoje, -90), ate: hoje };
    case "ano":
      return { de: `${hoje.slice(0, 4)}-01-01`, ate: `${hoje.slice(0, 4)}-12-31` };
    case "escolher":
      return { de: de || undefined, ate: ate || undefined };
    default:
      return {};
  }
}

