// Regra do acumulado do ano: soma a DRE e a DFC dos meses quando todos os meses do ano estão gravados.
import { somarDfc, somarDre } from "./calculosDemonstracoes";
import type { Dfc } from "./calculosDemonstracoes";
import type { BalanceteReg } from "./tipos";

/** Acumulado do ano: DRE e DFC somando os meses quando todos estão gravados. */
export function acumulado(atual: BalanceteReg, historico: BalanceteReg[]) {
  const doAno = historico.filter((b) => b.competencia.slice(0, 4) === atual.competencia.slice(0, 4) && b.competencia <= atual.competencia);
  const completo = doAno.length === Number(atual.competencia.slice(5, 7)) && (atual.demonstracoes?.periodo.dias ?? 31) <= 31;
  return {
    completo,
    dre: completo ? somarDre(doAno.map((b) => b.resumo.mes)) : atual.resumo.ano,
    dfc: completo ? somarDfc(doAno.map((b) => b.demonstracoes?.dfc).filter((x): x is Dfc => !!x)) : (atual.demonstracoes?.dfc ?? null),
  };
}
