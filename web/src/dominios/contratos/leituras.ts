// Leituras do módulo Contratos (sempre paginadas: o Supabase corta em 1000 linhas sem avisar).
import { supabase } from "@/lib/supabase";
import { lerTudo } from "@/lib/lerTudo";
import type { Arquivo } from "@/lib/arquivos/armazenamento";
import type { Titulo } from "@/dominios/financeiro/tipos";
import type {
  BoletoFatura,
  ContaBancoLink,
  EmissaoNfse,
  EnvioDaFatura,
  EventoContrato,
  Fatura,
  NumeracaoNfse,
  ParametrosNfse,
  ReajusteRecorrente,
  ReceitaSistemas,
  Recorrente,
  RegraServico,
  Sistema,
} from "./tipos";

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
      .is("retirado_em", null)
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
      .select("id,fatura_id,canal,destino,conteudo,situacao,tentativas,ultimo_erro,enviado_em,proxima_tentativa_em,falhas,reenvios,etapa")
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
/** Regras fiscais por tipo de serviço da empresa (ativas e inativas; a tela filtra). */
export async function lerRegrasServico(cliente: string): Promise<RegraServico[]> {
  const { data, error } = await supabase()
    .from("fis_regras_servico")
    .select("*")
    .eq("cliente_id", cliente)
    .order("ativo", { ascending: false })
    .order("servico_codigo");
  if (error) throw error;
  return (data ?? []) as unknown as RegraServico[];
}

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

/** Boletos das faturas emitidos pelo Ledgra Link (049), o mais recente de cada fatura primeiro. */
export const lerBoletos = (cliente: string) =>
  lerTudo<BoletoFatura>((de, ate) =>
    supabase()
      .from("fin_fatura_boletos")
      .select("id,fatura_id,banco,tipo,situacao,valor,vencimento,linha_digitavel,pix_copia_cola,nosso_numero,tentativa,emitido_em")
      .eq("cliente_id", cliente)
      .order("tentativa", { ascending: false })
      .order("id")
      .range(de, ate),
  );

/** Contas da MDC no Ledgra Link por banco (Itaú e Santander) (049). */
export async function lerContasBanco(cliente: string): Promise<ContaBancoLink[]> {
  const { data, error } = await supabase().from("link_contas_banco").select("*").eq("cliente_id", cliente).order("banco");
  if (error) throw error;
  return (data ?? []) as ContaBancoLink[];
}

/** Sistemas que a empresa licencia (059), ativos e inativos. */
export const lerSistemas = (cliente: string) =>
  lerTudo<Sistema>((de, ate) =>
    supabase()
      .from("fin_sistemas")
      .select("id,cliente_id,nome,descricao,ativo,ordem")
      .eq("cliente_id", cliente)
      .order("ordem")
      .order("nome")
      .order("id")
      .range(de, ate),
  );

/** Painel de receita por sistema do mês (primeiro dia do mês, AAAA-MM-01), calculado no banco (059). */
export async function lerReceitaSistemas(cliente: string, mes: string): Promise<ReceitaSistemas> {
  const { data, error } = await supabase().rpc("fin_receita_sistemas", { p_cliente: cliente, p_mes: mes });
  if (error) throw error;
  const r = data as unknown as ReceitaSistemas;
  return {
    ...r,
    linhas: (r.linhas ?? []).map((l) => ({
      ...l,
      contratos: Number(l.contratos),
      suspensos: Number(l.suspensos),
      clientes: Number(l.clientes),
      mensal: Number(l.mensal),
      faturado: Number(l.faturado),
      recebido: Number(l.recebido),
      atraso: Number(l.atraso),
      novos: Number(l.novos),
      encerrados: Number(l.encerrados),
      previsto: Number(l.previsto),
      por_mes: (l.por_mes ?? []).map(Number),
    })),
  };
}
