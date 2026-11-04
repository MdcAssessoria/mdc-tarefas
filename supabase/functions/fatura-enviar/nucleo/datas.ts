// Cópia de web/src/lib/datas.ts feita por scripts/sync-funcoes.sh. Não edite aqui.
// Cálculos com datas do HUB (a formatação para a tela fica em lib/formato/datas.ts).
// Regra: "hoje" é sempre o dia no fuso da organização (hojeISO), nunca o dia em UTC, e contas com mês/dia
// são feitas sobre o texto AAAA-MM-DD, sem objetos Date no fuso do navegador.

const FUSO_PADRAO = "America/Sao_Paulo";

/** Data de hoje (YYYY-MM-DD) no fuso da organização. */
export function hojeISO(fuso = FUSO_PADRAO): string {
  return diaNoFuso(new Date(), fuso);
}

/** Dia (AAAA-MM-DD) de um instante no fuso da organização. Ex.: "2026-11-01T01:30:00Z" em São Paulo é 31/10. */
export function diaNoFuso(instante: Date | string | number, fuso = FUSO_PADRAO): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: fuso }).format(new Date(instante));
}

/** Hora (0 a 23) de um instante (padrão: agora) no fuso da organização. */
export function horaNoFuso(fuso = FUSO_PADRAO, agora: Date = new Date()): number {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: fuso, hour: "2-digit", hourCycle: "h23" }).format(agora);
  return Number(h) % 24;
}

/**
 * Saudação única do HUB (tela, WhatsApp, e-mail): das 5h às 11h59 "Bom dia"; das 12h às 17h59 "Boa tarde";
 * das 18h às 4h59 "Boa noite". Use com horaNoFuso(org.fuso).
 */
export function saudacao(hora: number): "Bom dia" | "Boa tarde" | "Boa noite" {
  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}

/** Relógio de parede (no fuso) do instante `t`, escrito como se fosse UTC, em milissegundos. */
function paredeEmMs(t: number, fuso: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: fuso,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(t))
      .map((x) => [x.type, x.value]),
  );
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
}

/**
 * Instante (ISO em UTC) em que o dia "AAAA-MM-DD" começa no fuso. Use para filtrar colunas de data e hora pelo dia da
 * organização, no lugar de "T03:00:00Z" ou "-03:00" fixos: ".gte(col, inicioDoDiaUtc(de, fuso))" e
 * ".lt(col, inicioDoDiaUtc(somarDias(ate, 1), fuso))".
 */
export function inicioDoDiaUtc(data: string, fuso = FUSO_PADRAO): string {
  const alvo = Date.parse(data.slice(0, 10) + "T00:00:00Z");
  let t = alvo;
  // duas voltas acertam o deslocamento do fuso (e a troca de horário de verão, quando houver)
  for (let i = 0; i < 2; i++) t += alvo - paredeEmMs(t, fuso);
  return new Date(t).toISOString();
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

export function rotuloPrazo(dias: number | null): string {
  if (dias === null) return "Sem prazo";
  if (dias < -1) return `Atrasada ${-dias} dias`;
  if (dias === -1) return "Atrasada 1 dia";
  if (dias === 0) return "Vence hoje";
  if (dias === 1) return "Amanhã";
  return `Em ${dias} dias`;
}
