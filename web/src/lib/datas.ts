/** Data de hoje (YYYY-MM-DD) no fuso da organização. */
export function hojeISO(fuso = "America/Sao_Paulo"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: fuso }).format(new Date());
}

export function diasAte(prazo: string | null, fuso?: string): number | null {
  if (!prazo) return null;
  const h = new Date(hojeISO(fuso) + "T00:00:00Z").getTime();
  const p = new Date(prazo + "T00:00:00Z").getTime();
  return Math.round((p - h) / 86_400_000);
}

export function fmtData(d: string | null): string {
  if (!d) return "—";
  const [a, m, dia] = d.slice(0, 10).split("-");
  return `${dia}/${m}/${a}`;
}

export function fmtCompetencia(d: string | null): string {
  if (!d) return "";
  const [a, m] = d.split("-");
  return `${m}/${a}`;
}

export function rotuloPrazo(dias: number | null): string {
  if (dias === null) return "Sem prazo";
  if (dias < -1) return `Atrasada ${-dias} dias`;
  if (dias === -1) return "Atrasada 1 dia";
  if (dias === 0) return "Vence hoje";
  if (dias === 1) return "Amanhã";
  return `Em ${dias} dias`;
}

export function fmtDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
