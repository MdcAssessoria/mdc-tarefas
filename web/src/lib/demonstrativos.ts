import { supabase } from "./supabase";
import { calcularIndices, classificar, conferir, fragilidades, normalizarSinal, resumir } from "./balancete";
import type { Grupo, Linha, Resumo } from "./balancete";

/** Regras de conta → grupo salvas (padrão da organização + específicas do cliente). */
export async function carregarMapa(org: string, cliente: string) {
  const { data } = await supabase()
    .from("portal_mapa_contas")
    .select("classificacao,grupo,cliente_id")
    .eq("org_id", org)
    .or(`cliente_id.is.null,cliente_id.eq.${cliente}`);
  const rows = (data as { classificacao: string; grupo: Grupo; cliente_id: string | null }[]) ?? [];
  // regra do cliente vence a padrão
  return [...rows.filter((r) => !r.cliente_id), ...rows.filter((r) => r.cliente_id)];
}

async function resumoAnterior(cliente: string, competencia: string): Promise<Resumo | null> {
  const { data } = await supabase()
    .from("portal_balancetes")
    .select("resumo")
    .eq("cliente_id", cliente)
    .lt("competencia", competencia)
    .order("competencia", { ascending: false })
    .limit(1);
  return ((data?.[0] as { resumo: Resumo } | undefined)?.resumo ?? null) as Resumo | null;
}

export function analisar(linhas: Linha[], competencia: string | null, anterior: Resumo | null) {
  const resumo = resumir(linhas);
  const indices = calcularIndices(resumo);
  const alertas = fragilidades(resumo, indices, linhas, anterior);
  const conferencias = conferir(resumo, linhas, competencia);
  return { resumo, indices, alertas, conferencias };
}

/** Grava (ou substitui, se ainda for rascunho) o balancete do cliente na competência. */
export async function salvarBalancete(o: {
  org: string;
  cliente: string;
  competencia: string; // YYYY-MM-01
  arquivo: string;
  linhas: Linha[];
}): Promise<string> {
  const sb = supabase();
  const existe = await sb
    .from("portal_balancetes")
    .select("id,status")
    .eq("cliente_id", o.cliente)
    .eq("competencia", o.competencia)
    .maybeSingle();
  if (existe.data?.status === "publicado")
    throw new Error("Este mês já está publicado para o cliente. Despublique na tela do balancete antes de importar de novo.");
  const anterior = await resumoAnterior(o.cliente, o.competencia);
  const a = analisar(o.linhas, o.competencia, anterior);
  const reg = {
    org_id: o.org,
    cliente_id: o.cliente,
    competencia: o.competencia,
    status: "rascunho",
    arquivo_nome: o.arquivo,
    ...a,
    importado_em: new Date().toISOString(),
  };
  let id: string;
  if (existe.data) {
    id = existe.data.id;
    const u = await sb.from("portal_balancetes").update(reg).eq("id", id);
    if (u.error) throw u.error;
    const d = await sb.from("portal_balancete_linhas").delete().eq("balancete_id", id);
    if (d.error) throw d.error;
  } else {
    const i = await sb.from("portal_balancetes").insert(reg).select("id").single();
    if (i.error) throw i.error;
    id = (i.data as { id: string }).id;
  }
  const rows = o.linhas.map((l) => ({ ...l, balancete_id: id, org_id: o.org }));
  for (let k = 0; k < rows.length; k += 500) {
    const r = await sb.from("portal_balancete_linhas").insert(rows.slice(k, k + 500));
    if (r.error) throw r.error;
  }
  return id;
}

/** Recalcula resumo, índices e alertas de um balancete já gravado (depois de ajustar grupos). */
export async function recalcular(balanceteId: string) {
  const sb = supabase();
  const b = await sb.from("portal_balancetes").select("cliente_id,competencia").eq("id", balanceteId).single();
  if (b.error) throw b.error;
  const l = await sb.from("portal_balancete_linhas").select("*").eq("balancete_id", balanceteId).order("classificacao").limit(20000);
  if (l.error) throw l.error;
  const { cliente_id, competencia } = b.data as { cliente_id: string; competencia: string };
  const a = analisar(l.data as Linha[], competencia, await resumoAnterior(cliente_id, competencia));
  const u = await sb.from("portal_balancetes").update(a).eq("id", balanceteId);
  if (u.error) throw u.error;
}

/** Guarda a escolha de grupo como regra (do cliente ou padrão) e reaplica ao balancete. */
export async function definirGrupo(o: {
  org: string;
  cliente: string | null;
  balanceteId: string;
  classificacao: string;
  grupo: Grupo;
}) {
  const sb = supabase();
  const del = sb.from("portal_mapa_contas").delete().eq("org_id", o.org).eq("classificacao", o.classificacao);
  await (o.cliente ? del.eq("cliente_id", o.cliente) : del.is("cliente_id", null));
  const ins = await sb.from("portal_mapa_contas").insert({ org_id: o.org, cliente_id: o.cliente, classificacao: o.classificacao, grupo: o.grupo });
  if (ins.error) throw ins.error;
  const up = await sb
    .from("portal_balancete_linhas")
    .update({ grupo: o.grupo })
    .eq("balancete_id", o.balanceteId)
    .or(`classificacao.eq.${o.classificacao},classificacao.like.${o.classificacao}.*`);
  if (up.error) throw up.error;
  await recalcular(o.balanceteId);
}



/**
 * Reprocessa um balancete já gravado com as regras atuais do leitor:
 * corrige o sinal (devedor +, credor −), reclassifica as contas (respeitando o mapa salvo) e refaz os cálculos.
 */
export async function reprocessar(balanceteId: string) {
  const sb = supabase();
  const b = await sb.from("portal_balancetes").select("org_id,cliente_id,competencia,status").eq("id", balanceteId).single();
  if (b.error) throw b.error;
  const { org_id, cliente_id, competencia, status } = b.data as { org_id: string; cliente_id: string; competencia: string; status: string };
  if (status === "publicado") throw new Error("Despublique o balancete antes de reprocessar.");
  const l = await sb.from("portal_balancete_linhas").select("*").eq("balancete_id", balanceteId).order("classificacao").limit(20000);
  if (l.error) throw l.error;
  const linhas = (l.data as (Linha & { id: number })[]).map(({ id: _id, ...x }) => ({
    ...x,
    saldo_anterior: Number(x.saldo_anterior),
    debitos: Number(x.debitos),
    creditos: Number(x.creditos),
    saldo_atual: Number(x.saldo_atual),
    grupo: null,
  })) as Linha[];
  normalizarSinal(linhas);
  classificar(linhas, (await carregarMapa(org_id, cliente_id)) as { classificacao: string; grupo: Grupo }[]);
  const d = await sb.from("portal_balancete_linhas").delete().eq("balancete_id", balanceteId);
  if (d.error) throw d.error;
  const rows = linhas.map((x) => {
    const { balancete_id: _b, org_id: _o, ...resto } = x as Linha & { balancete_id?: string; org_id?: string };
    return { ...resto, balancete_id: balanceteId, org_id };
  });
  for (let k = 0; k < rows.length; k += 500) {
    const r = await sb.from("portal_balancete_linhas").insert(rows.slice(k, k + 500));
    if (r.error) throw r.error;
  }
  const a = analisar(linhas, competencia, await resumoAnterior(cliente_id, competencia));
  const u = await sb.from("portal_balancetes").update(a).eq("id", balanceteId);
  if (u.error) throw u.error;
}

export { classificar };
