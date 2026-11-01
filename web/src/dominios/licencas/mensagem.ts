// Mensagem de cobrança para colar no WhatsApp (testada em mensagem.test.ts). Começa com "Bom dia", "Boa tarde" ou
// "Boa noite" conforme a hora no fuso da organização, como a MDC faz no dia a dia.
import { brl } from "@/lib/formato/moeda";
import { fmtData, fmtCompetencia } from "@/lib/formato/datas";
import type { Cobranca } from "./tipos";

/** Hora (0 a 23) agora no fuso da organização. */
export function horaNoFuso(fuso = "America/Sao_Paulo", agora = new Date()): number {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: fuso, hour: "2-digit", hourCycle: "h23" }).format(agora);
  return Number(h) % 24;
}

/** Das 5h às 11h59 bom dia; das 12h às 17h59 boa tarde; das 18h às 4h59 boa noite. */
export function saudacao(hora: number): "Bom dia" | "Boa tarde" | "Boa noite" {
  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}

export function mensagemCobranca(o: {
  hora: number;
  cliente: string;
  cobrancas: Pick<Cobranca, "competencia" | "vencimento" | "valor">[];
  escritorio: string;
}): string {
  const lista = [...o.cobrancas].sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const total = lista.reduce((s, c) => s + Number(c.valor), 0);
  const uma = lista.length === 1;
  const linhas = lista.map((c) => `• ${fmtCompetencia(c.competencia)}: ${brl(Number(c.valor))} (venceu em ${fmtData(c.vencimento)})`);
  return [
    `${saudacao(o.hora)}! Tudo bem?`,
    "",
    `Aqui é da ${o.escritorio}. Passando para lembrar que ${uma ? "consta em aberto a mensalidade" : "constam em aberto as mensalidades"} do HUB da ${o.cliente}:`,
    "",
    ...linhas,
    ...(uma ? [] : ["", `Total: ${brl(total)}`]),
    "",
    "Se já foi pago, pode desconsiderar e, se puder, nos mande o comprovante por aqui. Qualquer dúvida, é só chamar.",
    "",
    "Obrigado!",
  ].join("\n");
}
