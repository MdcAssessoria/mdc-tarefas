import { supabase } from "@/lib/supabase";
import { lerTudo } from "@/lib/lerTudo";
import { calcularIndices } from "@/dominios/demonstrativos/balancete/indices";
import { classificar } from "@/dominios/demonstrativos/balancete/classificacao";
import { conferir, fragilidades } from "@/dominios/demonstrativos/balancete/fragilidades";
import { normalizarSinal } from "@/dominios/demonstrativos/balancete/leitura";
import { resumir } from "@/dominios/demonstrativos/balancete/resumo";
import type { Grupo, Linha } from "@/dominios/demonstrativos/balancete/tipos";
import type { Resumo } from "@/dominios/demonstrativos/balancete/resumo";
import { basePrazos, montar, periodoDe } from "./calculosDemonstracoes";
import type { MapaDfc } from "./calculosDemonstracoes";
import { hojeISO } from "@/lib/datas";
import { exigir } from "@/lib/exigir";
import { traduzirErro } from "@/lib/erros";
import type { Json } from "@/lib/database.types";

/**
 * Regras de conta → grupo salvas (padrão da organização + específicas do cliente).
 * Erro de leitura para a importação: sem as regras o balancete seria classificado errado sem aviso.
 */
export async function carregarMapa(org: string, cliente: string) {
  const rows = await lerTudo<{ classificacao: string; grupo: Grupo; cliente_id: string | null }>((de, ate) =>
    supabase()
      .from("portal_mapa_contas")
      .select("id,classificacao,grupo,cliente_id")
      .eq("org_id", org)
      .or(`cliente_id.is.null,cliente_id.eq.${cliente}`)
      .order("id")
      .range(de, ate),
  );
  // regra do cliente vence a padrão
  return [...rows.filter((r) => !r.cliente_id), ...rows.filter((r) => r.cliente_id)];
}

/** Linhas da DFC escolhidas pelo contador (padrão da organização + específicas do cliente; a do cliente vence). */
export async function carregarMapaDfc(org: string, cliente: string): Promise<MapaDfc> {
  const rows = await lerTudo<{ classificacao: string; linha: string; cliente_id: string | null }>((de, ate) =>
    supabase()
      .from("portal_mapa_dfc")
      .select("id,classificacao,linha,cliente_id")
      .eq("org_id", org)
      .or(`cliente_id.is.null,cliente_id.eq.${cliente}`)
      .order("id")
      .range(de, ate),
  );
  // mesma classificação: a do cliente fica por último e prevalece no empate de tamanho
  return [...rows.filter((r) => !r.cliente_id), ...rows.filter((r) => r.cliente_id)];
}

async function resumoAnterior(cliente: string, competencia: string): Promise<Resumo | null> {
  const { data, error } = await supabase()
    .from("portal_balancetes")
    .select("resumo")
    .eq("cliente_id", cliente)
    .lt("competencia", competencia)
    .order("competencia", { ascending: false })
    .limit(1);
  if (error) throw new Error(traduzirErro(error));
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
  const periodo = periodoDe(competencia ?? hojeISO(), inicio, fim);
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
    .select("status")
    .eq("cliente_id", o.cliente)
    .eq("competencia", o.competencia)
    .maybeSingle();
  if (existe.error) throw new Error(traduzirErro(existe.error));
  if (existe.data?.status === "publicado")
    throw new Error("Este mês já está publicado para o cliente. Despublique na tela do balancete antes de importar de novo.");
  const anterior = await resumoAnterior(o.cliente, o.competencia);
  const a = analisar(o.linhas, o.competencia, anterior, o.inicio, o.fim, await carregarMapaDfc(o.org, o.cliente));
  // cabeçalho, cálculo e contas num pedido só: ou grava inteiro, ou não muda nada
  const id = exigir(
    await sb.rpc("portal_gravar_balancete", {
      p_org: o.org,
      p_cliente: o.cliente,
      p_competencia: o.competencia,
      p_arquivo: o.arquivo,
      p_analise: a as unknown as Json,
      p_linhas: o.linhas.map(somenteConta) as unknown as Json,
    }),
  ) as string;
  return id;
}

/** Todas as linhas de um balancete, em ordem de classificação (paginado: o Supabase corta em 1.000). */
export function lerLinhas(balanceteId: string) {
  return lerTudo<Linha & { id: number }>((de, ate) =>
    supabase()
      .from("portal_balancete_linhas")
      .select("*")
      .eq("balancete_id", balanceteId)
      .order("classificacao")
      .order("id")
      .range(de, ate),
  );
}

/** Só os campos da conta (sem id, balancete ou organização), como a função do banco espera. */
const somenteConta = (l: Linha): Linha => ({
  codigo: l.codigo,
  classificacao: l.classificacao,
  descricao: l.descricao,
  nivel: l.nivel,
  analitica: l.analitica,
  saldo_anterior: l.saldo_anterior,
  debitos: l.debitos,
  creditos: l.creditos,
  saldo_atual: l.saldo_atual,
  grupo: l.grupo,
});

/** Recalcula resumo, índices e alertas de um balancete já gravado (depois de ajustar grupos). */
export async function recalcular(balanceteId: string) {
  const sb = supabase();
  const b = await sb
    .from("portal_balancetes")
    .select("org_id,cliente_id,competencia,periodo_inicio,periodo_fim")
    .eq("id", balanceteId)
    .single();
  if (b.error) throw b.error;
  const l = { data: await lerLinhas(balanceteId) };
  const { org_id, cliente_id, competencia, periodo_inicio, periodo_fim } = b.data as {
    org_id: string;
    cliente_id: string;
    competencia: string;
    periodo_inicio: string | null;
    periodo_fim: string | null;
  };
  const num = (l.data as Linha[]).map((x) => ({
    ...x,
    saldo_anterior: Number(x.saldo_anterior),
    debitos: Number(x.debitos),
    creditos: Number(x.creditos),
    saldo_atual: Number(x.saldo_atual),
  }));
  const a = analisar(
    num,
    competencia,
    await resumoAnterior(cliente_id, competencia),
    periodo_inicio,
    periodo_fim,
    await carregarMapaDfc(org_id, cliente_id),
  );
  const u = await sb.from("portal_balancetes").update(a).eq("id", balanceteId);
  if (u.error) throw u.error;
}

/** Guarda a escolha de grupo como regra (do cliente ou padrão) e reaplica ao balancete. */
export async function definirGrupo(o: { org: string; cliente: string | null; balanceteId: string; classificacao: string; grupo: Grupo }) {
  const sb = supabase();
  const del = sb.from("portal_mapa_contas").delete().eq("org_id", o.org).eq("classificacao", o.classificacao);
  const d = await (o.cliente ? del.eq("cliente_id", o.cliente) : del.is("cliente_id", null));
  if (d.error) throw new Error(traduzirErro(d.error));
  const ins = await sb
    .from("portal_mapa_contas")
    .insert({ org_id: o.org, cliente_id: o.cliente, classificacao: o.classificacao, grupo: o.grupo });
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
  const b = await sb
    .from("portal_balancetes")
    .select("org_id,cliente_id,competencia,status,periodo_inicio,periodo_fim")
    .eq("id", balanceteId)
    .single();
  if (b.error) throw b.error;
  const { org_id, cliente_id, competencia, status, periodo_inicio, periodo_fim } = b.data as {
    org_id: string;
    cliente_id: string;
    competencia: string;
    status: string;
    periodo_inicio: string | null;
    periodo_fim: string | null;
  };
  if (status === "publicado") throw new Error("Despublique o balancete antes de reprocessar.");
  const l = { data: await lerLinhas(balanceteId) };
  // trava de segurança: só apaga e regrava se leu todas as contas gravadas
  const c = await sb.from("portal_balancete_linhas").select("id", { count: "exact", head: true }).eq("balancete_id", balanceteId);
  if (c.error) throw c.error;
  if (c.count !== l.data.length)
    throw new Error("Não foi possível ler todas as contas deste balancete. Nada foi alterado; tente de novo em instantes.");
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
  const a = analisar(
    linhas,
    competencia,
    await resumoAnterior(cliente_id, competencia),
    periodo_inicio,
    periodo_fim,
    await carregarMapaDfc(org_id, cliente_id),
  );
  // troca as contas e o cálculo num pedido só: se a conexão cair, nada muda
  exigir(
    await sb.rpc("portal_regravar_contas", {
      p_balancete: balanceteId,
      p_analise: a as unknown as Json,
      p_linhas: linhas.map(somenteConta) as unknown as Json,
    }),
  );
}

/** Guarda a linha da DFC escolhida para uma conta (do cliente ou padrão da MDC) e refaz os cálculos. */
export async function definirLinhaDfc(o: {
  org: string;
  cliente: string | null;
  balanceteId: string;
  classificacao: string;
  linha: string | null;
}) {
  const sb = supabase();
  const del = sb.from("portal_mapa_dfc").delete().eq("org_id", o.org).eq("classificacao", o.classificacao);
  const d = await (o.cliente ? del.eq("cliente_id", o.cliente) : del.is("cliente_id", null));
  if (d.error) throw d.error;
  if (o.linha) {
    const ins = await sb
      .from("portal_mapa_dfc")
      .insert({ org_id: o.org, cliente_id: o.cliente, classificacao: o.classificacao, linha: o.linha });
    if (ins.error) throw ins.error;
  }
  await recalcular(o.balanceteId);
}
