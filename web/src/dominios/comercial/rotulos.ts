// CRM Comercial: nomes e cores (tons do molde 8.3.1) das etapas, origens e situações do contrato, e pequenos
// cálculos de tela (dias na etapa, retorno atrasado, link do WhatsApp). Tudo puro, testado em rotulos.test.ts.
import type { Tom } from "@/components/ui/Tons";
import { ETAPAS, ORIGENS } from "./crm";
import type { Contrato, Etapa, Oportunidade } from "./crm";

/** Mesmo tom para o mesmo significado: azul = a caminho, âmbar = pede atenção, verde = fechado, vermelho = perdido. */
export const TOM_ETAPA: Record<Etapa, Tom> = {
  novo: "violeta",
  contato: "azul",
  reuniao: "azul",
  proposta: "ambar",
  negociacao: "ambar",
  ganho: "verde",
  perdido: "vermelho",
};

export type SituacaoContrato = Contrato["status"];
export const SITUACOES_CONTRATO: Record<SituacaoContrato, { nome: string; tom: Tom; dica: string }> = {
  rascunho: { nome: "Rascunho", tom: "ambar", dica: "Ainda em ajuste; pode mudar os valores" },
  enviado: { nome: "Enviado ao cliente", tom: "azul", dica: "Aguardando a assinatura" },
  assinado: { nome: "Assinado", tom: "verde", dica: "Contrato fechado" },
  cancelado: { nome: "Cancelado", tom: "neutro", dica: "Substituído por outra versão ou desistência" },
};

export const ETAPAS_FECHADAS: Etapa[] = ["ganho", "perdido"];
export const estaAberta = (o: Pick<Oportunidade, "etapa">) => !ETAPAS_FECHADAS.includes(o.etapa);

export const nomeEtapa = (id: string) => ETAPAS.find((e) => e.id === id)?.nome ?? id;
export const nomeOrigem = (id: string) => ORIGENS.find((o) => o.id === id)?.nome ?? id;

const REGIME: Record<string, string> = { simples: "Simples", presumido: "Presumido", real: "Real", mei: "MEI", nao_sei: "Não sabe" };
/** "simples" → "Simples"; vazio → "—". */
export const nomeRegime = (r: unknown) => (typeof r === "string" && r ? (REGIME[r.toLowerCase()] ?? r) : "—");

/** Número que pode vir como texto do Simulador ("1500") → 1500; o resto → null. */
export const numero = (v: unknown): number | null =>
  typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !isNaN(Number(v)) ? Number(v) : null;

/** Dias inteiros desde um instante (para "há 12 dias na etapa"). */
export function diasDesde(iso: string, agora: number = Date.now()): number {
  return Math.max(0, Math.floor((agora - Date.parse(iso)) / 864e5));
}

/** Retorno marcado para antes de hoje (AAAA-MM-DD no fuso da organização) numa oportunidade em aberto. */
export function retornoAtrasado(o: Pick<Oportunidade, "etapa" | "proximo_contato">, hoje: string): boolean {
  return estaAberta(o) && !!o.proximo_contato && o.proximo_contato < hoje;
}

/** Link do WhatsApp: só dígitos e DDI 55 quando o número veio sem ele (até 11 dígitos). Sem número → null. */
export function linkWhatsapp(tel: string | null | undefined): string | null {
  const d = (tel ?? "").replace(/\D/g, "");
  if (d.length < 8) return null;
  return `https://wa.me/${d.length <= 11 ? `55${d}` : d}`;
}

/** Texto de "tempo na etapa" para o cartão: "hoje", "1 dia", "12 dias". */
export function rotuloDias(n: number): string {
  return n === 0 ? "hoje" : n === 1 ? "1 dia" : `${n} dias`;
}

/** Texto estável de um valor (chaves em ordem): o jsonb do banco devolve as chaves em outra ordem. */
function estavel(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(estavel).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${estavel((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v ?? null);
}

/** Os valores do contrato na tela são os mesmos que estão salvos? (ignora a ordem das chaves) */
export const mesmosValores = (a: unknown, b: unknown) => estavel(a) === estavel(b);
