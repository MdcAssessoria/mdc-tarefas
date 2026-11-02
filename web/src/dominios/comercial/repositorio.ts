// CRM Comercial: gravações feitas pelas telas. Nada do CRM se apaga (migração 036): oportunidade se arquiva com
// motivo (crm_arquivar), atividade fica no histórico (pode ser editada) e contrato muda para "cancelado".
//
// Atenção: salvarContrato, marcarContrato e registrarAtividade gravam em mais de uma etapa a partir do navegador
// (a auditoria pediu que virem funções do banco, uma transação só). Enquanto isso não existe, cada função devolve
// o que falhou depois da gravação principal, para a tela avisar a pessoa.
import { supabase } from "@/lib/supabase";
import { exigir } from "@/lib/exigir";
import { traduzirErro } from "@/lib/erros";
import { brl } from "@/lib/formato/moeda";
import { montarContrato, numeroContrato } from "./crm";
import type { Atividade, Contrato, Etapa, Modelo, Oportunidade, Valores } from "./crm";
import { SITUACOES_CONTRATO } from "./rotulos";

/** Arquiva (ou devolve ao funil) várias oportunidades; devolve quantas mudaram. */
export async function arquivarOportunidades(ids: string[], motivo: string, arquivar: boolean): Promise<number> {
  return Number(exigir(await supabase().rpc("crm_arquivar", { p_ids: ids, p_motivo: motivo, p_arquivar: arquivar })) ?? 0);
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
 * contato tira do "Novo lead"). Duas gravações: devolve a mensagem se a segunda falhar.
 */
export async function registrarAtividade(
  o: Oportunidade,
  eu: string,
  a: { tipo: string; texto: string; quando: string },
): Promise<string | null> {
  const sb = supabase();
  exigir(
    await sb.from("crm_atividades").insert({
      org_id: o.org_id,
      oportunidade_id: o.id,
      tipo: a.tipo,
      texto: a.texto,
      quando: a.quando ? new Date(a.quando + "T09:00:00").toISOString() : null,
      concluida: a.tipo !== "tarefa",
      autor_id: eu,
    }),
  );
  const campos: Record<string, unknown> =
    a.tipo === "tarefa" && a.quando ? { proximo_contato: a.quando } : { atualizado_em: new Date().toISOString() };
  if (o.etapa === "novo" && ["ligacao", "whatsapp", "email", "reuniao"].includes(a.tipo))
    campos.etapa = a.tipo === "reuniao" ? "reuniao" : "contato";
  const op = await sb.from("crm_oportunidades").update(campos).eq("id", o.id);
  return op.error ? `Registro salvo, mas a oportunidade não foi atualizada: ${traduzirErro(op.error)}` : null;
}

export async function editarAtividade(id: string, texto: string) {
  exigir(await supabase().from("crm_atividades").update({ texto }).eq("id", id));
}

export async function concluirAtividade(a: Atividade) {
  exigir(await supabase().from("crm_atividades").update({ concluida: !a.concluida }).eq("id", a.id));
}

// ---------------------------------------------------------------- contrato

/**
 * Salva os valores negociados. Rascunho existente: atualiza o texto e o valor do funil. Sem rascunho: numera
 * (contratos do ano + 1), cria o contrato, atualiza o valor do funil e registra no histórico.
 */
export async function salvarContrato(
  o: Oportunidade,
  modelo: Modelo,
  v: Valores,
  ultimo: Contrato | undefined,
  hoje: string,
): Promise<{ contrato: Contrato; falha: string | null }> {
  const sb = supabase();
  if (ultimo && ultimo.status === "rascunho") {
    const contrato = exigir(
      await sb
        .from("crm_contratos")
        .update({
          valores: v,
          texto: montarContrato(modelo.texto, v, ultimo.numero ?? ""),
          modelo_id: modelo.id,
          modelo_versao: modelo.versao,
        })
        .eq("id", ultimo.id)
        .select("*")
        .single(),
    ) as Contrato;
    const op = await sb
      .from("crm_oportunidades")
      .update({ valor_mensal: v.honorario_mensal || null })
      .eq("id", o.id);
    return { contrato, falha: op.error ? `Contrato salvo, mas o valor do funil não foi atualizado: ${traduzirErro(op.error)}` : null };
  }
  const { count, error } = await sb
    .from("crm_contratos")
    .select("id", { count: "exact", head: true })
    .eq("org_id", o.org_id)
    .gte("criado_em", `${hoje.slice(0, 4)}-01-01`);
  if (error) throw new Error(traduzirErro(error));
  const numero = numeroContrato((count ?? 0) + 1, new Date(hoje + "T12:00:00Z"));
  const contrato = exigir(
    await sb
      .from("crm_contratos")
      .insert({
        org_id: o.org_id,
        oportunidade_id: o.id,
        modelo_id: modelo.id,
        modelo_versao: modelo.versao,
        numero,
        valores: v,
        texto: montarContrato(modelo.texto, v, numero),
      })
      .select("*")
      .single(),
  ) as Contrato;
  const [op, at] = await Promise.all([
    sb
      .from("crm_oportunidades")
      .update({ valor_mensal: v.honorario_mensal || null })
      .eq("id", o.id),
    sb.from("crm_atividades").insert({
      org_id: o.org_id,
      oportunidade_id: o.id,
      tipo: "contrato",
      texto: `Contrato ${numero} criado (${brl(v.honorario_mensal)}/mês)`,
      concluida: true,
    }),
  ]);
  const falha = op.error ?? at.error;
  return { contrato, falha: falha ? `Contrato criado, mas o funil ou o histórico não foram atualizados: ${traduzirErro(falha)}` : null };
}

/**
 * Muda a situação do contrato (enviado, assinado ou cancelado), registra no histórico, leva a oportunidade para
 * "Proposta" quando o contrato sai e, se pedido, cadastra o cliente ao assinar. Devolve o que falhou depois da
 * mudança principal.
 */
export async function marcarContrato(
  o: Oportunidade,
  c: Contrato,
  status: "enviado" | "assinado" | "cancelado",
  converter = false,
): Promise<string[]> {
  const sb = supabase();
  const campos: Record<string, unknown> = { status };
  if (status === "enviado") campos.enviado_em = new Date().toISOString();
  if (status === "assinado") campos.assinado_em = new Date().toISOString();
  exigir(await sb.from("crm_contratos").update(campos).eq("id", c.id));
  const falhas: string[] = [];
  const at = await sb.from("crm_atividades").insert({
    org_id: o.org_id,
    oportunidade_id: o.id,
    tipo: "contrato",
    texto: `Contrato ${c.numero}: ${SITUACOES_CONTRATO[status].nome.toLowerCase()}`,
    concluida: true,
  });
  if (at.error) falhas.push(`histórico (${traduzirErro(at.error)})`);
  if (status === "enviado" && ["novo", "contato", "reuniao"].includes(o.etapa)) {
    const op = await sb.from("crm_oportunidades").update({ etapa: "proposta" }).eq("id", o.id);
    if (op.error) falhas.push(`etapa do funil (${traduzirErro(op.error)})`);
  }
  if (converter) {
    const cv = await sb.rpc("crm_converter_cliente", { p_op: o.id });
    if (cv.error) falhas.push(`cadastro do cliente (${traduzirErro(cv.error)})`);
  }
  return falhas;
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
