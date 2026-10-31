// Datas do dia a dia do HUB. Regra: "hoje" é sempre o dia no fuso da organização (hojeISO), nunca o dia em UTC,
// e contas com mês/dia são feitas sobre o texto AAAA-MM-DD, sem objetos Date no fuso do navegador.

/** Data de hoje (YYYY-MM-DD) no fuso da organização. */
export function hojeISO(fuso = "America/Sao_Paulo"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: fuso }).format(new Date());
}

/** Mês atual (AAAA-MM) no fuso da organização. */
export function mesAtualISO(fuso?: string): string {
  return hojeISO(fuso).slice(0, 7);
}

/** Mês anterior ao atual (AAAA-MM) no fuso da organização. Ex.: em 31/05 devolve abril. */
export function mesAnteriorISO(fuso?: string): string {
  return somarMeses(mesAtualISO(fuso), -1);
}

/** Soma (ou subtrai) meses de uma competência "AAAA-MM" (aceita "AAAA-MM-DD" e devolve só o mês). */
export function somarMeses(mes: string, n: number): string {
  const total = Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7)) - 1 + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** Soma (ou subtrai) dias corridos de uma data "AAAA-MM-DD". */
export function somarDias(data: string, n: number): string {
  return new Date(Date.parse(data.slice(0, 10) + "T12:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
}

/** Primeiro dia do mês seguinte ao da data "AAAA-MM-DD". */
export function primeiroDiaDoProximoMes(data: string): string {
  return somarMeses(data, 1) + "-01";
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
