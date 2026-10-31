// Formatação de datas para mostrar na tela e nos relatórios (dd/mm/aaaa, mês/ano, data e hora).
// Cálculos com datas ("hoje", somar meses, dias até o prazo) ficam em lib/datas.ts.

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-03-05" (ou "2026-03-05T10:00…") → "05/03/2026"; vazio → "—". Não converte fuso: usa o dia escrito. */
export function fmtData(d: string | null | undefined): string {
  if (!d) return "—";
  const [a, m, dia] = d.slice(0, 10).split("-");
  return `${dia}/${m}/${a}`;
}

/** Instante (timestamp) → data no fuso do navegador, "05/03/2026". Para colunas de data use fmtData. */
export function fmtDataLocal(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";
}

/** Instante (timestamp) → "05/03/2026, 14:30" no fuso do navegador. */
export function fmtDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** Competência "2026-09" ou "2026-09-01" → "09/2026"; vazio → "". */
export function fmtCompetencia(d: string | null | undefined): string {
  if (!d) return "";
  const [a, m] = d.split("-");
  return `${m}/${a}`;
}

/** Competência → "set/26" (rótulos curtos de gráfico e lista). */
export function mesAno(competencia: string): string {
  const [a, m] = competencia.split("-");
  return `${MESES_CURTOS[Number(m) - 1]}/${a.slice(2)}`;
}

/** Competência → "setembro de 2026". */
export function mesExtenso(competencia: string): string {
  return new Date(competencia.slice(0, 7) + "-15T12:00:00Z").toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
