// CRM Comercial: leituras do banco usadas pelas telas (funil, leads, ficha, contratos e modelo).
// Listas que podem crescer passam por lerTudo (o Supabase corta em 1.000 linhas sem avisar).
import { supabase } from "@/lib/supabase";
import { exigir } from "@/lib/exigir";
import { lerTudo } from "@/lib/lerTudo";
import type { Atividade, Contrato, Modelo, Oportunidade } from "./crm";
import type { Arquivo } from "@/lib/arquivos/armazenamento";

/** Todas as oportunidades da organização (no funil e arquivadas), da mais mexida para a menos. */
export function lerOportunidades(orgId: string) {
  return lerTudo<Oportunidade>((de, ate) =>
    supabase()
      .from("crm_oportunidades")
      .select("*")
      .eq("org_id", orgId)
      .order("atualizado_em", { ascending: false })
      .order("id")
      .range(de, ate),
  );
}

export type ContratoComEmpresa = Contrato & { crm_oportunidades: { empresa: string } | null };

/** Todos os contratos da organização com o nome da empresa da oportunidade. */
export function lerContratos(orgId: string) {
  return lerTudo<ContratoComEmpresa>((de, ate) =>
    supabase()
      .from("crm_contratos")
      .select("*, crm_oportunidades(empresa)")
      .eq("org_id", orgId)
      .order("criado_em", { ascending: false })
      .order("id")
      .range(de, ate),
  );
}

/** O modelo de contrato em uso (o ativo mais recente) ou null. */
export async function lerModeloAtivo(orgId: string): Promise<Modelo | null> {
  const linhas = exigir(
    await supabase()
      .from("crm_modelos")
      .select("*")
      .eq("org_id", orgId)
      .eq("ativo", true)
      .order("atualizado_em", { ascending: false })
      .limit(1),
  ) as Modelo[] | null;
  return linhas?.[0] ?? null;
}

export interface Ficha {
  o: Oportunidade;
  atividades: Atividade[];
  contratos: Contrato[];
  modelo: Modelo | null;
  /** Propostas em PDF anexadas na ficha (hub_arquivos do Comercial, sem as retiradas), a mais nova primeiro (115). */
  propostas: Arquivo[];
}

/** Tudo da ficha de uma oportunidade: dados, histórico, contratos (o mais novo primeiro), o modelo em uso e as propostas em PDF. */
export async function lerFicha(id: string, orgId: string): Promise<Ficha> {
  const sb = supabase();
  const [o, atividades, contratos, modelo, propostas] = await Promise.all([
    sb.from("crm_oportunidades").select("*").eq("id", id).single(),
    sb.from("crm_atividades").select("*").eq("oportunidade_id", id).order("criado_em", { ascending: false }),
    sb.from("crm_contratos").select("*").eq("oportunidade_id", id).order("criado_em", { ascending: false }),
    lerModeloAtivo(orgId),
    sb
      .from("hub_arquivos")
      .select("*")
      .eq("org_id", orgId)
      .eq("app", "comercial")
      .eq("ref_id", id)
      .is("retirado_em", null)
      .order("enviado_em", { ascending: false }),
  ]);
  return {
    o: exigir(o) as Oportunidade,
    atividades: (exigir(atividades) as Atividade[] | null) ?? [],
    contratos: (exigir(contratos) as Contrato[] | null) ?? [],
    modelo,
    propostas: (exigir(propostas) as Arquivo[] | null) ?? [],
  };
}
