// Envio automático das faturas por e-mail e WhatsApp (053): as frases simples de cada envio e de cada canal para a tela
// (lista e detalhe da fatura, Contratos › Envio). A regra (quando sai, espera entre tentativas, quem pode reenviar) mora
// no banco; as chamadas (situação, Reenviar, Conferir agora, Enviar teste) ficam em repositorio.ts.
import { fmtDataHora } from "@/lib/formato/datas";
import type { Tom } from "@/components/ui/Tons";
import type { EnvioDaFatura } from "./tipos";

export type CanalAutomatico = "email" | "whatsapp";

export interface EstadoCanalBanco {
  configurado: boolean;
  detalhe: string | null;
  remetente: string | null;
  verificado_em: string;
}

/** O que public.fin_envio_situacao devolve (Contratos: ver). */
export interface SituacaoEnvio {
  canais: Partial<Record<CanalAutomatico, EstadoCanalBanco>>;
  /** "email:pendente" → quantos */
  fila: Record<string, number>;
  problemas: { envio: number; fatura: string; canal: CanalAutomatico; destino: string; erro: string | null; falhas: number; proxima: string | null }[];
}

export const NOME_CANAL: Record<CanalAutomatico, string> = { email: "E-mail (Microsoft 365)", whatsapp: "WhatsApp (API oficial da Meta)" };

const hora = (iso: string) => fmtDataHora(iso);

/** Situação de um envio em linguagem simples (chip + frase), para a lista e o detalhe da fatura. */
export function explicarEnvio(e: EnvioDaFatura, agora: Date): { nome: string; tom: Tom; texto: string } {
  if (e.canal === "portal")
    return e.situacao === "enviado"
      ? { nome: "Publicada", tom: "verde", texto: "Aparece no Portal do Cliente." }
      : e.situacao === "cancelado"
        ? { nome: "Cancelado", tom: "neutro", texto: "Fatura cancelada." }
        : { nome: "Na fila", tom: "azul", texto: "Aparece no Portal assim que a nota fiscal e o boleto (quando houver) estiverem prontos." };
  switch (e.situacao) {
    case "enviado":
      return { nome: "Enviado", tom: "verde", texto: e.enviado_em ? `Enviado em ${hora(e.enviado_em)}.` : "Enviado." };
    case "pendente":
      return {
        nome: "Na fila",
        tom: "azul",
        texto:
          e.proxima_tentativa_em && new Date(e.proxima_tentativa_em) > agora
            ? `Sai a partir de ${hora(e.proxima_tentativa_em)}.`
            : "Sai na próxima rodada (o HUB confere a fila a cada 10 minutos), assim que a nota fiscal e o boleto estiverem prontos.",
      };
    case "erro": {
      const motivo = e.ultimo_erro ?? "O provedor recusou o envio.";
      return {
        nome: "Falhou",
        tom: "vermelho",
        texto: e.proxima_tentativa_em
          ? `${motivo} O HUB tenta de novo a partir de ${hora(e.proxima_tentativa_em)}.`
          : `${motivo} O HUB parou de tentar: confira o endereço no contrato e clique em Reenviar.`,
      };
    }
    case "aguardando_configuracao":
      return {
        nome: "Aguardando configuração",
        tom: "ambar",
        texto: `O envio por ${e.canal === "email" ? "e-mail" : "WhatsApp"} ainda não foi ligado (Contratos › Envio). A fatura fica guardada e sai sozinha quando ligar.`,
      };
    default:
      return { nome: "Cancelado", tom: "neutro", texto: "Fatura cancelada: não será enviada." };
  }
}

/** "Reenviar" aparece para e-mail e WhatsApp que falharam ou já foram (para mandar de novo). */
export const podeReenviar = (e: EnvioDaFatura, faturaCancelada: boolean) =>
  !faturaCancelada && (e.canal === "email" || e.canal === "whatsapp") && (e.situacao === "erro" || e.situacao === "enviado");

/** Estado do cartão do canal em Contratos › Envio. */
export function estadoCanal(c: EstadoCanalBanco | undefined): { nome: string; tom: Tom; texto: string } {
  if (!c)
    return {
      nome: "Não configurado",
      tom: "ambar",
      texto: "Ainda não conferido. Peça à TI para seguir o passo a passo da documentação do HUB e cadastrar os segredos no painel do Supabase.",
    };
  if (c.configurado) return { nome: "Ligado", tom: "verde", texto: c.detalhe ?? "Conferido." };
  return { nome: "Não configurado", tom: "ambar", texto: c.detalhe ?? "Faltam os segredos do canal no painel do Supabase." };
}

/** Conta da fila por canal ("email:erro" → 2). */
export const naFila = (s: SituacaoEnvio | null | undefined, canal: CanalAutomatico, situacao: EnvioDaFatura["situacao"]) =>
  Number(s?.fila?.[`${canal}:${situacao}`] ?? 0);
