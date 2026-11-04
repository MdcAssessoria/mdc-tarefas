// CRM Comercial: gravações feitas pelas telas. Oportunidade se arquiva com motivo (crm_arquivar); excluir de vez só
// por crm_excluir (054: quem gere, com motivo, nunca cliente nem contrato assinado; retrato fica na auditoria).
// Atividade fica no histórico (pode ser editada) e contrato muda para "cancelado".
//
// salvarContrato, marcarContrato e registrarAtividade chamam funções do banco (migração 038): cada uma grava tudo
// numa transação só (contrato, funil e histórico), e o número do contrato (AAAA/NNN) é dado pelo banco, sem repetir.
import { supabase } from "@/lib/supabase";
import type { Json } from "@/lib/database.types";
import { exigir } from "@/lib/exigir";
import { montarContrato } from "./crm";
import type { Atividade, Contrato, Etapa, Modelo, Oportunidade, Valores } from "./crm";

/** Arquiva (ou devolve ao funil) várias oportunidades; devolve quantas mudaram. */
export async function arquivarOportunidades(ids: string[], motivo: string, arquivar: boolean): Promise<number> {
  return Number(exigir(await supabase().rpc("crm_arquivar", { p_ids: ids, p_motivo: motivo, p_arquivar: arquivar })) ?? 0);
}

/** Exclui de vez (com histórico e rascunhos); devolve quantas saíram. Só quem gere o Comercial. */
export async function excluirOportunidades(ids: string[], motivo: string): Promise<number> {
  return Number(exigir(await supabase().rpc("crm_excluir", { p_ids: ids, p_motivo: motivo })) ?? 0);
}

/** Muda a etapa (ganho passa por converterEmCliente). Perdido leva o motivo. */
export async function moverEtapa(id: string, etapa: Exclude<Etapa, "ganho">, motivoPerda: string | null = null) {
  exigir(await supabase().from("crm_oportunidades").update({ etapa, motivo_perda: motivoPerda }).eq("id", id));
}

/** Marca como ganho e cadastra a empresa na carteira (função do banco, uma transação). */
export async function converterEmCliente(id: string) {
  exigir(await supabase().rpc("crm_converter_cliente", { p_op: id }));
}

export async function atualizarOportunidade(id: string, campos: Partial<Oportunidade>) {
  exigir(await supabase().from("crm_oportunidades").update(campos).eq("id", id));
}

export interface NovaOportunidade {
  empresa: string;
  contato_nome: string | null;
  whatsapp: string | null;
  email: string | null;
  cnpj: string | null;
  cidade: string | null;
  uf: string | null;
  origem: string;
  valor_mensal: number | null;
}

export async function criarOportunidade(orgId: string, eu: string, d: NovaOportunidade): Promise<string> {
  const r = exigir(
    await supabase()
      .from("crm_oportunidades")
      .insert({ ...d, org_id: orgId, responsavel_id: eu, criado_por: eu })
      .select("id")
      .single(),
  ) as { id: string };
  return r.id;
}

// ---------------------------------------------------------------- histórico

/**
 * Registra uma conversa ou próximo passo e atualiza a oportunidade (data do retorno ou "mexida agora"; o primeiro
 * contato tira do "Novo lead"). Uma transação no banco (crm_registrar_atividade).
 */
export async function registrarAtividade(o: Oportunidade, a: { tipo: string; texto: string; quando: string }) {
  exigir(
    await supabase().rpc("crm_registrar_atividade", {
      p_op: o.id,
      p_tipo: a.tipo,
      p_texto: a.texto,
      p_quando: a.quando || undefined,
    }),
  );
}

export async function editarAtividade(id: string, texto: string) {
  exigir(await supabase().from("crm_atividades").update({ texto }).eq("id", id));
}

export async function concluirAtividade(a: Atividade) {
  exigir(await supabase().from("crm_atividades").update({ concluida: !a.concluida }).eq("id", a.id));
}

// ---------------------------------------------------------------- contrato

/**
 * Salva os valores negociados (crm_salvar_contrato, uma transação). Rascunho existente: atualiza o texto e o valor do
 * funil. Sem rascunho: o banco numera (AAAA/NNN, sem repetir mesmo com duas pessoas ao mesmo tempo), cria o contrato,
 * atualiza o valor do funil e registra no histórico. O texto vai com {{numero}} e o banco põe o número.
 */
export async function salvarContrato(o: Oportunidade, modelo: Modelo, v: Valores): Promise<Contrato> {
  return exigir(
    await supabase().rpc("crm_salvar_contrato", {
      p_op: o.id,
      p_modelo: modelo.id,
      p_valores: v as unknown as Json,
      p_texto: montarContrato(modelo.texto, v, "{{numero}}"),
    }),
  ) as unknown as Contrato;
}

/**
 * Muda a situação do contrato (enviado, assinado ou cancelado), registra no histórico, leva a oportunidade para
 * "Proposta" quando o contrato sai e, se pedido, cadastra o cliente ao assinar. Tudo ou nada (crm_marcar_contrato).
 */
export async function marcarContrato(c: Contrato, status: "enviado" | "assinado" | "cancelado", converter = false) {
  exigir(await supabase().rpc("crm_marcar_contrato", { p_contrato: c.id, p_status: status, p_converter: converter }));
}

// ---------------------------------------------------------------- modelo

export async function salvarModelo(orgId: string, eu: string, modelo: Modelo | null, nome: string, texto: string) {
  const sb = supabase();
  exigir(
    modelo
      ? await sb
          .from("crm_modelos")
          .update({ nome, texto, versao: modelo.versao + 1, atualizado_por: eu, atualizado_em: new Date().toISOString() })
          .eq("id", modelo.id)
      : await sb.from("crm_modelos").insert({ org_id: orgId, nome, texto, atualizado_por: eu }),
  );
}

/** Envia a logo da organização (PNG ou JPG) usada no cabeçalho dos contratos. */
export async function enviarLogo(orgId: string, arq: File) {
  if (!/image\/(png|jpe?g)/.test(arq.type)) throw new Error("Use a logo em PNG (de preferência branca com fundo transparente) ou JPG.");
  const caminho = `${orgId}/marca/logo-${Date.now()}.${arq.type.includes("png") ? "png" : "jpg"}`;
  exigir(await supabase().storage.from("hub-arquivos").upload(caminho, arq, { contentType: arq.type }));
  exigir(
    await supabase()
      .from("organizacoes")
      .update({ logo_url: `storage:${caminho}` })
      .eq("id", orgId),
  );
}
