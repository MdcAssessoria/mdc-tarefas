import { supabase } from "./supabase";
import { calcularIndices, classificar, conferir, fragilidades, normalizarSinal, resumir } from "./balancete";
import type { Grupo, Linha, Resumo } from "./balancete";
import { basePrazos, montar, periodoDe } from "./demonstracoes";
import type { MapaDfc } from "./demonstracoes";

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

/** Linhas da DFC escolhidas pelo contador (padrão da organização + específicas do cliente; a do cliente vence). */
export async function carregarMapaDfc(org: string, cliente: string): Promise<MapaDfc> {
  const { data } = await supabase()
    .from("portal_mapa_dfc")
    .select("classificacao,linha,cliente_id")
    .eq("org_id", org)
    .or(`cliente_id.is.null,cliente_id.eq.${cliente}`);
  const rows = (data as { classificacao: string; linha: string; cliente_id: string | null }[]) ?? [];
  // mesma classificação: a do cliente fica por último e prevalece no empate de tamanho
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

export function analisar(
  linhas: Linha[],
  competencia: string | null,
  anterior: Resumo | null,
  inicio?: string | null,
  fim?: string | null,
  mapaDfc: MapaDfc = [],
) {
  const resumo = resumir(linhas);
  const periodo = periodoDe(competencia ?? new Date().toISOString().slice(0, 10), inicio, fim);
  const indices = calcularIndices(resumo, periodo.dias, basePrazos(linhas, periodo.dias));
  const alertas = fragilidades(resumo, indices, linhas, anterior);
  const conferencias = conferir(resumo, linhas, competencia);
  const demonstracoes = montar(linhas, resumo, indices, periodo, mapaDfc);
  if (!demonstracoes.dfc.fechado)
    conferencias.push({ nome: "DFC fecha com a variação do caixa", ok: false, detalhe: "revise os grupos das contas" });
  return { resumo, indices, alertas, conferencias, demonstracoes, periodo_inicio: periodo.inicio, periodo_fim: periodo.fim };
}

/** Grava (ou substitui, se ainda for rascunho) o balancete do cliente na competência. */
export async function salvarBalancete(o: {
  org: string;
  cliente: string;
  competencia: string; // YYYY-MM-01
  arquivo: string;
  linhas: Linha[];
  inicio?: string | null;
  fim?: string | null;
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
  const a = analisar(o.linhas, o.competencia, anterior, o.inicio, o.fim, await carregarMapaDfc(o.org, o.cliente));
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
  const b = await sb.from("portal_balancetes").select("org_id,cliente_id,competencia,periodo_inicio,periodo_fim").eq("id", balanceteId).single();
  if (b.error) throw b.error;
  const l = await sb.from("portal_balancete_linhas").select("*").eq("balancete_id", balanceteId).order("classificacao").limit(20000);
  if (l.error) throw l.error;
  const { org_id, cliente_id, competencia, periodo_inicio, periodo_fim } = b.data as { org_id: string; cliente_id: string; competencia: string; periodo_inicio: string | null; periodo_fim: string | null };
  const num = (l.data as Linha[]).map((x) => ({ ...x, saldo_anterior: Number(x.saldo_anterior), debitos: Number(x.debitos), creditos: Number(x.creditos), saldo_atual: Number(x.saldo_atual) }));
  const a = analisar(num, competencia, await resumoAnterior(cliente_id, competencia), periodo_inicio, periodo_fim, await carregarMapaDfc(org_id, cliente_id));
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
  const b = await sb.from("portal_balancetes").select("org_id,cliente_id,competencia,status,periodo_inicio,periodo_fim").eq("id", balanceteId).single();
  if (b.error) throw b.error;
  const { org_id, cliente_id, competencia, status, periodo_inicio, periodo_fim } = b.data as {
    org_id: string; cliente_id: string; competencia: string; status: string; periodo_inicio: string | null; periodo_fim: string | null;
  };
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
  const a = analisar(linhas, competencia, await resumoAnterior(cliente_id, competencia), periodo_inicio, periodo_fim, await carregarMapaDfc(org_id, cliente_id));
  const u = await sb.from("portal_balancetes").update(a).eq("id", balanceteId);
  if (u.error) throw u.error;
}

/** Guarda a linha da DFC escolhida para uma conta (do cliente ou padrão da MDC) e refaz os cálculos. */
export async function definirLinhaDfc(o: { org: string; cliente: string | null; balanceteId: string; classificacao: string; linha: string | null }) {
  const sb = supabase();
  const del = sb.from("portal_mapa_dfc").delete().eq("org_id", o.org).eq("classificacao", o.classificacao);
  const d = await (o.cliente ? del.eq("cliente_id", o.cliente) : del.is("cliente_id", null));
  if (d.error) throw d.error;
  if (o.linha) {
    const ins = await sb.from("portal_mapa_dfc").insert({ org_id: o.org, cliente_id: o.cliente, classificacao: o.classificacao, linha: o.linha });
    if (ins.error) throw ins.error;
  }
  await recalcular(o.balanceteId);
}

export { classificar };
