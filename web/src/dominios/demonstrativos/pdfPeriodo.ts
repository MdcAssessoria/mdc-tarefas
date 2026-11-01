// Regra do PDF de um período (trimestre, semestre, ano) montado só com meses publicados.
// Usada na tela (para avisar antes de baixar) e na Edge Function demonstrativo-pdf (que decide de verdade);
// copiada para a função por scripts/sync-funcoes.sh.
//
//   completo → todos os meses do período publicados: sai assinado.
//   parcial  → os meses publicados vêm em sequência desde o início do período e só faltam os últimos
//              (período ainda em andamento): sai SEM assinatura, marcado "parcial".
//   lacuna   → falta mês publicado antes do último publicado: os números não fecham (caixa, balancete);
//              o PDF não é gerado e a tela diz o que falta publicar.

export type SituacaoPdf = { tipo: "completo" } | { tipo: "parcial"; ate: string; faltam: string[] } | { tipo: "lacuna"; faltam: string[] };

/**
 * `meses`: todos os meses do período (YYYY-MM, em ordem); `publicados`: os que têm balancete publicado.
 * Balancete acumulado (vários meses num arquivo) entra com todos os meses que ele cobre.
 */
export function situacaoPdf(meses: string[], publicados: string[]): SituacaoPdf {
  const tem = new Set(publicados);
  const faltam = meses.filter((m) => !tem.has(m));
  if (!faltam.length) return { tipo: "completo" };
  const ultimo = [...meses].reverse().find((m) => tem.has(m));
  const antes = ultimo ? faltam.filter((m) => m < ultimo) : faltam;
  if (!ultimo || antes.length) return { tipo: "lacuna", faltam: antes.length ? antes : faltam };
  return { tipo: "parcial", ate: ultimo, faltam };
}
