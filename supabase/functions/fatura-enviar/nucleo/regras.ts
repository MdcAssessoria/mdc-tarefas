// Cópia de web/src/dominios/contratos/regras.ts feita por scripts/sync-funcoes.sh. Não edite aqui.
// Regras puras do módulo Contratos (contratos fixos). As mesmas contas do banco (migração 041): vencimento no mês
// (app.fin_vencimento_no_mes), reajuste pendente (app.fin_reajuste_pendente), próximo reajuste
// (app.fin_reajuste_proximo) e acumulado do índice (app.fin_indice_acumulado). O banco decide; a tela só mostra.
import { somarMeses } from "./datas.ts";
type Tom = string;
import type { IndiceRecorrente, ReajusteRecorrente, Recorrente, SituacaoRecorrente } from "./tipos.ts";
export const INDICES_RECORRENTE: { id: IndiceRecorrente; nome: string; explicacao: string }[] = [
  { id: "IPCA", nome: "IPCA", explicacao: "Inflação oficial do IBGE (a mais usada em honorários e serviços)" },
  { id: "IGP-M", nome: "IGP-M", explicacao: "Índice da FGV, comum em contratos de aluguel" },
  { id: "INPC", nome: "INPC", explicacao: "Inflação do IBGE para famílias de menor renda" },
  { id: "fixo", nome: "% fixo", explicacao: "Um percentual combinado no contrato (ex.: 5% ao ano)" },
  { id: "nenhum", nome: "Sem reajuste", explicacao: "O valor só muda se alguém editar o contrato" },
];

export const SITUACOES_RECORRENTE: Record<SituacaoRecorrente, { nome: string; tom: Tom }> = {
  ativo: { nome: "Ativo", tom: "verde" },
  suspenso: { nome: "Suspenso", tom: "ambar" },
  encerrado: { nome: "Encerrado", tom: "neutro" },
};

export const MESES_ANO = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

/** "2026-11" ou "2026-11-01" → "2026-11-01". */
export const primeiroDia = (mes: string) => `${mes.slice(0, 7)}-01`;

/** Vencimento no mês: o dia do contrato; quando o mês não tem esse dia, o último (31 → 28/02, 30/04). */
export function vencimentoNoMes(mes: string, dia: number): string {
  const [a, m] = [Number(mes.slice(0, 4)), Number(mes.slice(5, 7))];
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${mes.slice(0, 7)}-${String(Math.min(dia, ultimo)).padStart(2, "0")}`;
}

/** Contrato vale no mês? (ativo, já começou a lançar e não passou do fim) */
export function valeNoMes(r: Pick<Recorrente, "situacao" | "gerar_desde" | "fim">, mes: string): boolean {
  const m = primeiroDia(mes);
  return r.situacao === "ativo" && r.gerar_desde <= m && (!r.fim || r.fim >= m);
}

/**
 * Mês de reajuste pendente (ou null): o último mês do reajuste que já chegou, se o contrato fez 12 meses até lá, se
 * é depois do mês em que entrou no HUB e se esse ciclo ainda não foi confirmado. Igual a app.fin_reajuste_pendente.
 */
export function reajustePendente(
  r: Recorrente,
  reajustes: Pick<ReajusteRecorrente, "recorrente_id" | "origem" | "referencia">[],
  hoje: string,
): string | null {
  if (r.situacao !== "ativo" || r.indice === "nenhum" || !r.mes_reajuste) return null;
  const mes = primeiroDia(hoje);
  let ref = `${mes.slice(0, 4)}-${String(r.mes_reajuste).padStart(2, "0")}-01`;
  if (ref > mes) ref = primeiroDia(somarMeses(ref, -12));
  if (ref < primeiroDia(somarMeses(r.inicio, 12)) || ref <= r.mes_cadastro) return null;
  if (reajustes.some((x) => x.recorrente_id === r.id && x.origem === "reajuste" && x.referencia === ref)) return null;
  return ref;
}

/** Próximo mês de reajuste para mostrar na lista ("reajuste em 03/2027"): o pendente ou o próximo aniversário. */
export function proximoReajuste(
  r: Recorrente,
  reajustes: Pick<ReajusteRecorrente, "recorrente_id" | "origem" | "referencia">[],
  hoje: string,
): string | null {
  if (r.indice === "nenhum" || !r.mes_reajuste) return null;
  const pendente = reajustePendente(r, reajustes, hoje);
  if (pendente) return pendente;
  const mes = primeiroDia(hoje);
  let ref = `${mes.slice(0, 4)}-${String(r.mes_reajuste).padStart(2, "0")}-01`;
  while (ref <= mes || ref < primeiroDia(somarMeses(r.inicio, 12)) || ref <= r.mes_cadastro) ref = primeiroDia(somarMeses(ref, 12));
  return ref;
}

/** A vigência termina (ou renova) nos próximos `dias` dias? Contrato encerrado ou sem prazo, não. */
export function terminaEm(r: Pick<Recorrente, "situacao" | "vigencia_fim">, hoje: string, dias = 30): boolean {
  if (r.situacao === "encerrado" || !r.vigencia_fim) return false;
  const limite = new Date(Date.parse(hoje + "T12:00:00Z") + dias * 86_400_000).toISOString().slice(0, 10);
  return r.vigencia_fim >= hoje && r.vigencia_fim <= limite;
}

/** Texto da vigência: "01/03/2025 a 28/02/2027 (renova sozinho)" ou "desde 01/03/2025 · prazo indeterminado". */
export function textoVigencia(r: Pick<Recorrente, "vigencia_inicio" | "vigencia_fim" | "renovacao_automatica">): string {
  const d = (x: string) => x.slice(0, 10).split("-").reverse().join("/");
  if (!r.vigencia_fim) return `desde ${d(r.vigencia_inicio)} · prazo indeterminado`;
  return `${d(r.vigencia_inicio)} a ${d(r.vigencia_fim)}${r.renovacao_automatica ? " (renova sozinho)" : ""}`;
}

/** Acumulado (%) por produto de (1 + %/100): [0.5, 0.5] → 1.0025 → 1,0025%. Igual a app.fin_indice_acumulado. */
export function acumulado(percentuais: number[]): number {
  return Math.round((percentuais.reduce((a, p) => a * (1 + p / 100), 1) - 1) * 1e6) / 1e4;
}

/** Valor reajustado com 2 casas, como o banco (round). */
export function valorReajustado(valor: number, percentual: number): number {
  return Math.round(valor * (1 + percentual / 100) * 100 + Number.EPSILON) / 100;
}

/** Texto do reajuste para a lista: "IPCA em março", "5% fixo em novembro", "Sem reajuste". */
export function textoReajuste(r: Pick<Recorrente, "indice" | "percentual_fixo" | "mes_reajuste">): string {
  if (r.indice === "nenhum" || !r.mes_reajuste) return "Sem reajuste";
  const mes = MESES_ANO[r.mes_reajuste - 1].toLowerCase();
  if (r.indice === "fixo") return `${String(r.percentual_fixo ?? 0).replace(".", ",")}% fixo em ${mes}`;
  return `${r.indice} em ${mes}`;
}
