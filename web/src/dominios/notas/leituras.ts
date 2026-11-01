// Leituras das notas fiscais (sempre paginadas: o Supabase corta em 1000 linhas sem avisar).
import { supabase } from "@/lib/supabase";
import { lerTudo } from "@/lib/lerTudo";
import { exigir } from "@/lib/exigir";
import type { RegraCredito } from "./creditos";
import type {
  CertificadoEmpresa,
  ControleCaptura,
  DeParaItem,
  EventoNota,
  Nota,
  NotaItem,
  ParametrosFiscais,
  TipoEntradaRegra,
} from "./tipos";

/** Notas da empresa; com período, pela data de emissão (inclusive). */
export const lerNotas = (cliente: string, filtro: { de?: string; ate?: string; direcao?: "entrada" | "saida" } = {}) =>
  lerTudo<Nota>((de, ate) => {
    let q = supabase().from("fis_notas").select("*").eq("cliente_id", cliente);
    if (filtro.direcao) q = q.eq("direcao", filtro.direcao);
    if (filtro.de) q = q.gte("emissao", `${filtro.de}T00:00:00-03:00`);
    if (filtro.ate) q = q.lte("emissao", `${filtro.ate}T23:59:59-03:00`);
    return q.order("emissao", { ascending: false }).order("id").range(de, ate);
  });

export async function lerNota(id: string): Promise<Nota | null> {
  return exigir(await supabase().from("fis_notas").select("*").eq("id", id).maybeSingle()) as Nota | null;
}

/** Itens de várias notas (em blocos de 200 ids). */
export async function lerItensDasNotas(ids: string[]): Promise<NotaItem[]> {
  const saida: NotaItem[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const bloco = ids.slice(i, i + 200);
    saida.push(
      ...(await lerTudo<NotaItem>((de, ate) =>
        supabase().from("fis_nota_itens").select("*").in("nota_id", bloco).order("nota_id").order("numero").order("id").range(de, ate),
      )),
    );
  }
  return saida;
}

export const lerEventos = (cliente: string) =>
  lerTudo<EventoNota>((de, ate) =>
    supabase()
      .from("fis_eventos")
      .select("id,nota_id,chave,tp_evento,descricao,sequencia,justificativa,cstat,motivo,protocolo,registrado_em,origem,em")
      .eq("cliente_id", cliente)
      .order("em", { ascending: false })
      .order("id")
      .range(de, ate),
  );

export async function lerControle(cliente: string): Promise<ControleCaptura[]> {
  return exigir(await supabase().from("fis_dfe_controle").select("*").eq("cliente_id", cliente)) as ControleCaptura[];
}

export async function lerCertificado(cliente: string): Promise<CertificadoEmpresa | null> {
  return exigir(
    await supabase()
      .from("fis_certificados")
      .select("cliente_id,titular,cnpj,emissor,icp_brasil,valido_de,valido_ate,enviado_em")
      .eq("cliente_id", cliente)
      .maybeSingle(),
  ) as CertificadoEmpresa | null;
}

export async function lerParametros(cliente: string): Promise<ParametrosFiscais | null> {
  return exigir(await supabase().from("fis_parametros").select("*").eq("cliente_id", cliente).maybeSingle()) as ParametrosFiscais | null;
}

/** Regras de tipo de entrada visíveis (geral, da organização e da empresa). */
export async function lerTiposEntrada(): Promise<TipoEntradaRegra[]> {
  return exigir(await supabase().from("fis_tipos_entrada").select("*").eq("ativo", true)) as TipoEntradaRegra[];
}

export async function lerRegrasCredito(): Promise<RegraCredito[]> {
  return exigir(
    await supabase().from("fis_regras_credito").select("*").order("regime").order("tributo").order("vigencia_inicio"),
  ) as RegraCredito[];
}

export const lerDepara = (cliente: string) =>
  lerTudo<DeParaItem>((de, ate) =>
    supabase()
      .from("fis_depara_itens")
      .select("id,fornecedor_doc,codigo_fornecedor,item_id,fator")
      .eq("cliente_id", cliente)
      .order("id")
      .range(de, ate),
  );

/** Endereço temporário (5 minutos) para baixar o XML guardado no Storage. */
export async function enderecoDoXml(caminho: string): Promise<string> {
  const { data, error } = await supabase().storage.from("fiscal").createSignedUrl(caminho, 300, { download: true });
  if (error || !data?.signedUrl) throw new Error("Não foi possível baixar o XML. Tente de novo.");
  return data.signedUrl;
}
