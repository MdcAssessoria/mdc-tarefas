// Leituras do módulo Contratos (sempre paginadas: o Supabase corta em 1000 linhas sem avisar).
import { supabase } from "@/lib/supabase";
import { lerTudo } from "@/lib/lerTudo";
import type { Arquivo } from "@/lib/arquivos/armazenamento";
import type { Titulo } from "@/dominios/financeiro/tipos";
import type { EmissaoNfse, EnvioDaFatura, EventoContrato, Fatura, NumeracaoNfse, ParametrosNfse, ReajusteRecorrente, Recorrente } from "./tipos";

/** Cliente de uma fatura, só com o que vai no PDF dela (047: Contratos não lê o cadastro inteiro). */
export interface TomadorFatura {
  id: string;
  nome: string;
  documento: string | null;
  email: string | null;
  cidade: string | null;
  uf: string | null;
}

/** O que a tela de Contratos usa dos cadastros do Financeiro: nomes para escolher e mostrar (função do banco, 047). */
export interface OpcoesContrato {
  pessoas: { id: string; nome: string; tipo: "fornecedor" | "cliente" | "ambos"; ativo: boolean }[];
  categorias: { id: string; nome: string; tipo: "despesa" | "receita"; grupo: string | null; ativo: boolean }[];
  centros: { id: string; nome: string; ativo: boolean }[];
  contas: { id: string; nome: string; ativo: boolean }[];
  tomadores: TomadorFatura[];
}

export async function lerOpcoesContrato(cliente: string): Promise<OpcoesContrato> {
  const { data, error } = await supabase().rpc("fin_recorrente_opcoes", { p_cliente: cliente });
  if (error) throw error;
  return data as unknown as OpcoesContrato;
}

export const lerContratos = (cliente: string) =>
  lerTudo<Recorrente>((de, ate) =>
    supabase().from("fin_recorrentes").select("*").eq("cliente_id", cliente).order("descricao").order("id").range(de, ate),
  );

export const lerReajustes = (cliente: string) =>
  lerTudo<ReajusteRecorrente>((de, ate) =>
    supabase()
      .from("fin_recorrente_reajustes")
      .select(
        "id,recorrente_id,origem,referencia,indice,percentual,percentual_proposto,valor_antes,valor_depois,titulos_atualizados,observacao,em",
      )
      .eq("cliente_id", cliente)
      .order("em", { ascending: false })
      .order("id")
      .range(de, ate),
  );

/** Contas lançadas por um contrato, do mês mais recente ao mais antigo. */
export const lerContasDoContrato = (contrato: string) =>
  lerTudo<Titulo>((de, ate) =>
    supabase()
      .from("fin_titulos")
      .select("*")
      .eq("recorrente_id", contrato)
      .order("competencia", { ascending: false })
      .order("id")
      .range(de, ate),
  );

/** Histórico do contrato (mais recente primeiro). */
export const lerEventos = (contrato: string) =>
  lerTudo<EventoContrato>((de, ate) =>
    supabase()
      .from("fin_recorrente_eventos")
      .select("id,recorrente_id,tipo,texto,por,em")
      .eq("recorrente_id", contrato)
      .order("em", { ascending: false })
      .order("id", { ascending: false })
      .range(de, ate),
  );

/** Anexos do contrato (contrato assinado, aditivos). */
export const lerAnexos = (contrato: string) =>
  lerTudo<Arquivo>((de, ate) =>
    supabase()
      .from("hub_arquivos")
      .select("*")
      .eq("app", "contratos")
      .eq("ref_id", contrato)
      .order("enviado_em", { ascending: false })
      .order("id")
      .range(de, ate),
  );

/** Faturas dos contratos a receber da empresa (mais recentes primeiro). */
export const lerFaturas = (cliente: string) =>
  lerTudo<Fatura>((de, ate) =>
    supabase()
      .from("fin_faturas")
      .select("*")
      .eq("cliente_id", cliente)
      .order("emissao", { ascending: false })
      .order("sequencia", { ascending: false })
      .range(de, ate),
  );

/** Fila de envio das faturas da empresa. */
export const lerEnvios = (cliente: string) =>
  lerTudo<EnvioDaFatura>((de, ate) =>
    supabase()
      .from("fin_envios")
      .select("id,fatura_id,canal,destino,conteudo,situacao,tentativas,ultimo_erro,enviado_em")
      .eq("cliente_id", cliente)
      .order("id")
      .range(de, ate),
  );

/** Notas fiscais enviadas ao Emissor Nacional (046), mais recentes primeiro. */
export const lerEmissoesNfse = (cliente: string) =>
  lerTudo<EmissaoNfse>((de, ate) =>
    supabase()
      .from("nfse_emissoes")
      .select(
        "id,fatura_id,ambiente,serie,ndps,id_dps,situacao,chave_acesso,numero_nfse,xml_caminho,mensagem,mensagens,tentativas,enviado_em,respondido_em,criado_em",
      )
      .eq("cliente_id", cliente)
      .order("criado_em", { ascending: false })
      .order("id")
      .range(de, ate),
  );

/** Parâmetros da emissão da NFS-e da MDC (null = ainda não configurado). */
export async function lerParametrosNfse(cliente: string): Promise<ParametrosNfse | null> {
  const { data, error } = await supabase().from("nfse_parametros").select("*").eq("cliente_id", cliente).maybeSingle();
  if (error) throw error;
  return (data as unknown as ParametrosNfse) ?? null;
}

/** Próximo número da DPS de cada ambiente e série. */
export async function lerNumeracaoNfse(cliente: string): Promise<NumeracaoNfse[]> {
  const { data, error } = await supabase().from("nfse_numeracao").select("cliente_id,ambiente,serie,proximo").eq("cliente_id", cliente);
  if (error) throw error;
  return (data ?? []) as unknown as NumeracaoNfse[];
}
