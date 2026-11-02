// Mensagem de cobrança para colar no WhatsApp (testada em mensagem.test.ts). Começa com "Bom dia", "Boa tarde" ou
// "Boa noite" conforme a hora no fuso da organização, como a MDC faz no dia a dia.
import { brl } from "@/lib/formato/moeda";
import { fmtData, fmtCompetencia } from "@/lib/formato/datas";
import { saudacao } from "@/lib/datas";
import type { Cobranca } from "./tipos";

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
