// Cobrança Ledgra pelo Ledgra Link (migração 043): boleto híbrido ou Pix de cada mensalidade e baixa automática quando o
// banco avisa o pagamento. Leituras pelo RLS (Licenças › ver); emissão pela Função Edge ledgra-link (a chave do Ledgra
// Link fica só no servidor); configuração pela função link_salvar_config (Licenças › gerir).
import { supabase } from "@/lib/supabase";
import { exigir } from "@/lib/exigir";
import { lerTudo } from "@/lib/lerTudo";
import { chamarFuncao } from "@/lib/funcoesEdge";
import { brl } from "@/lib/formato/moeda";
import { fmtCompetencia, fmtData } from "@/lib/formato/datas";
import { saudacao } from "@/lib/datas";
import type { Json } from "@/lib/database.types";
import type { Cobranca } from "./tipos";

export type TipoCobrancaLink = "boleto_hibrido" | "pix_vencimento" | "boleto";
export const TIPOS_LINK: { id: TipoCobrancaLink; nome: string; ajuda: string }[] = [
  { id: "boleto_hibrido", nome: "Boleto com Pix (recomendado)", ajuda: "O cliente paga pelo código de barras ou pelo QR Code Pix." },
  { id: "pix_vencimento", nome: "Só Pix com vencimento", ajuda: "Cobrança Pix com data de vencimento, multa e juros." },
  { id: "boleto", nome: "Só boleto", ajuda: "Boleto tradicional, sem Pix." },
];

export interface ConfigLink {
  org_id: string;
  ativo: boolean;
  conta_link_id: string | null;
  tipo_padrao: TipoCobrancaLink;
  multa_percentual: number;
  juros_mensal_percentual: number;
  dias_apos_vencimento: number;
}

export type SituacaoEmissao = "registrada" | "paga" | "paga_parcial" | "baixada" | "cancelada" | "vencida" | "rejeitada";
export interface EmissaoLink {
  lic_cobranca_id: string;
  tipo: TipoCobrancaLink;
  situacao: SituacaoEmissao;
  linha_digitavel: string | null;
  pix_copia_cola: string | null;
  emitida_em: string;
}

export const SITUACOES_EMISSAO: Record<SituacaoEmissao, { nome: string; tom: string }> = {
  registrada: { nome: "Boleto/Pix emitido", tom: "bg-sky-50 text-sky-800" },
  paga: { nome: "Pago pelo banco", tom: "bg-emerald-50 text-emerald-800" },
  paga_parcial: { nome: "Pago a menor: revisar", tom: "bg-amber-50 text-amber-900" },
  baixada: { nome: "Baixado no banco", tom: "bg-neutral-100 text-neutral-700" },
  cancelada: { nome: "Cancelado no banco", tom: "bg-neutral-100 text-neutral-700" },
  vencida: { nome: "Vencido no banco", tom: "bg-red-50 text-red-800" },
  rejeitada: { nome: "Recusado pelo banco", tom: "bg-red-50 text-red-800" },
};

/** Emissão ainda vale para o cliente pagar (não precisa emitir de novo). */
export const emissaoValida = (e: EmissaoLink | undefined) => !!e && (e.situacao === "registrada" || e.situacao === "paga_parcial");

export async function lerConfigLink(org: string): Promise<ConfigLink | null> {
  const c = exigir(await supabase().from("link_config").select("*").eq("org_id", org).maybeSingle()) as ConfigLink | null;
  return c && { ...c, multa_percentual: Number(c.multa_percentual), juros_mensal_percentual: Number(c.juros_mensal_percentual) };
}

export async function lerEmissoes(org: string): Promise<EmissaoLink[]> {
  return lerTudo<EmissaoLink>((de, ate) =>
    supabase()
      .from("link_cobrancas")
      .select("lic_cobranca_id,tipo,situacao,linha_digitavel,pix_copia_cola,emitida_em")
      .eq("org_id", org)
      .order("lic_cobranca_id")
      .range(de, ate),
  );
}

export async function salvarConfigLink(org: string, c: Omit<ConfigLink, "org_id">): Promise<void> {
  exigir(await supabase().rpc("link_salvar_config", { p_org: org, p: c as unknown as Json }));
}

export interface ResultadoEmissao {
  linha_digitavel: string | null;
  pix_copia_cola: string | null;
  vencimento: string;
  aviso: string | null;
}

/** Pede o boleto/Pix ao Ledgra Link. Pode repetir: a mesma mensalidade nunca vira dois boletos. */
export const emitirBoletoPix = (cobranca: string) => chamarFuncao<ResultadoEmissao>("ledgra-link", { corpo: { acao: "emitir", cobranca } });

export const situacaoLedgraLink = () => chamarFuncao<{ ligado: boolean; mensagem: string }>("ledgra-link", { corpo: { acao: "situacao" } });

/** Mensagem para mandar o boleto/Pix ao cliente pelo WhatsApp (começa com bom dia/boa tarde/boa noite). */
export function mensagemBoletoPix(o: {
  hora: number;
  cliente: string;
  escritorio: string;
  cobranca: Pick<Cobranca, "competencia" | "valor">;
  vencimento: string;
  linha_digitavel: string | null;
  pix_copia_cola: string | null;
}): string {
  return [
    `${saudacao(o.hora)}! Tudo bem?`,
    "",
    `Aqui é da ${o.escritorio}. Segue a mensalidade do HUB da ${o.cliente} de ${fmtCompetencia(o.cobranca.competencia)}: ` +
      `${brl(Number(o.cobranca.valor))}, com vencimento em ${fmtData(o.vencimento)}.`,
    ...(o.pix_copia_cola ? ["", "Pix copia e cola:", o.pix_copia_cola] : []),
    ...(o.linha_digitavel ? ["", "Linha digitável do boleto:", o.linha_digitavel] : []),
    "",
    "Assim que o banco confirmar o pagamento, a baixa é feita automaticamente. Qualquer dúvida, é só chamar.",
    "",
    "Obrigado!",
  ].join("\n");
}
