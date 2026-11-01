// Gerado de web/src/dominios/demonstrativos/linhasPeriodo.ts por scripts/sync-funcoes.sh. Não edite aqui.
// Balancete de verificação de um período (trimestre, semestre, ano) a partir dos balancetes mensais:
// saldo anterior = abertura do primeiro mês, débitos e créditos = soma dos meses, saldo atual = fechamento do último.
// Usado no PDF completo do período (copiado para a Edge Function por scripts/sync-funcoes.sh).
import type { Linha } from "./balancete.ts";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Junta os balancetes mensais do período (em ordem de competência) num balancete só. */
export function combinarLinhas(meses: Linha[][]): Linha[] {
  if (meses.length === 1) return meses[0];
  const ultimo = meses.length - 1;
  const contas = new Map<string, Linha>();
  meses.forEach((linhas, k) => {
    for (const l of linhas) {
      const c = contas.get(l.classificacao) ?? { ...l, saldo_anterior: 0, debitos: 0, creditos: 0, saldo_atual: 0 };
      // descrição, nível e grupo: vale o mês mais recente em que a conta aparece
      const somado = {
        ...l,
        saldo_anterior: k === 0 ? l.saldo_anterior : c.saldo_anterior,
        debitos: r2(c.debitos + l.debitos),
        creditos: r2(c.creditos + l.creditos),
        saldo_atual: k === ultimo ? l.saldo_atual : 0,
      };
      contas.set(l.classificacao, somado);
    }
  });
  return [...contas.values()].sort((a, b) => a.classificacao.localeCompare(b.classificacao));
}
