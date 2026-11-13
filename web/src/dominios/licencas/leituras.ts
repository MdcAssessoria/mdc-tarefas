// Leituras do módulo Licenças (sempre paginadas com lerTudo; o Supabase corta em 1.000 linhas sem avisar).
import { supabase } from "@/lib/supabase";
import { lerTudo } from "@/lib/lerTudo";
import { exigir } from "@/lib/exigir";
import type { BaixaLicenca, Bloqueio, Cobranca, Contrato, Parametros, Plano, Produto, Reajuste, SituacaoPortal } from "./tipos";

const num = <T>(l: T, campos: (keyof T)[]): T => {
  const x = { ...l };
  for (const c of campos) if (x[c] != null) (x as Record<string, unknown>)[c as string] = Number(x[c]);
  return x;
};

// Colunas que o navegador lê (074): preço e valores ficam de fora e só voltam pela lic_valores (permissão de valores).
const COLS_PRODUTO = "id,org_id,slug,nome,descricao,ativo,ordem,criado_em,sistema";
const COLS_PLANO = "id,org_id,nome,descricao,ativo,criado_em";
const COLS_CONTRATO =
  "id,org_id,cliente_id,plano_id,dia_vencimento,inicio,fim,proporcional,reajuste_indice,reajuste_mes,ultimo_reajuste,situacao,encerrado_em,encerrado_motivo,observacao,por,criado_em,modalidade";

export interface ValoresLicencas {
  produtos: Record<string, number>;
  planos: Record<string, number>;
  contratos: Record<string, { valor_mensal: number; valor_tabela: number }>;
}

/** Preços e valores (só quem tem "gerir" em Licenças = permissão de valores). */
export async function lerValores(org: string): Promise<ValoresLicencas> {
  const d = exigir(await supabase().rpc("lic_valores", { p_org: org })) as unknown as ValoresLicencas;
  return { produtos: d?.produtos ?? {}, planos: d?.planos ?? {}, contratos: d?.contratos ?? {} };
}

/** Põe os valores nas listas (sem a permissão, tudo fica zero e as telas escondem as colunas de dinheiro). */
export function comValores<T extends { produtos: Produto[]; planos: Plano[]; contratos: Contrato[] }>(d: T, v: ValoresLicencas | null): T {
  if (!v) return d;
  return {
    ...d,
    produtos: d.produtos.map((p) => ({ ...p, preco: Number(v.produtos[p.id] ?? 0) })),
    planos: d.planos.map((p) => ({ ...p, preco: Number(v.planos[p.id] ?? 0) })),
    contratos: d.contratos.map((k) => ({
      ...k,
      valor_mensal: Number(v.contratos[k.id]?.valor_mensal ?? 0),
      valor_tabela: Number(v.contratos[k.id]?.valor_tabela ?? 0),
    })),
  };
}

export async function lerProdutos(org: string): Promise<Produto[]> {
  const l = await lerTudo<Produto>((de, ate) =>
    supabase().from("lic_produtos").select(COLS_PRODUTO).eq("org_id", org).order("ordem").order("nome").order("id").range(de, ate),
  );
  return l.map((p) => ({ ...p, preco: 0 }));
}

export async function lerPlanos(org: string): Promise<Plano[]> {
  const [planos, itens] = await Promise.all([
    lerTudo<Omit<Plano, "produtos">>((de, ate) =>
      supabase().from("lic_planos").select(COLS_PLANO).eq("org_id", org).order("nome").order("id").range(de, ate),
    ),
    lerTudo<{ plano_id: string; produto_id: string }>((de, ate) =>
      supabase()
        .from("lic_plano_produtos")
        .select("plano_id,produto_id")
        .eq("org_id", org)
        .order("plano_id")
        .order("produto_id")
        .range(de, ate),
    ),
  ]);
  return planos.map((p) => ({ ...p, preco: 0, produtos: itens.filter((i) => i.plano_id === p.id).map((i) => i.produto_id) }));
}

export async function lerContratos(org: string): Promise<Contrato[]> {
  const [contratos, itens] = await Promise.all([
    lerTudo<Omit<Contrato, "produtos">>((de, ate) =>
      supabase().from("lic_contratos").select(COLS_CONTRATO).eq("org_id", org).order("criado_em").order("id").range(de, ate),
    ),
    lerTudo<{ contrato_id: string; produto_id: string }>((de, ate) =>
      supabase()
        .from("lic_contrato_produtos")
        .select("contrato_id,produto_id")
        .eq("org_id", org)
        .order("contrato_id")
        .order("produto_id")
        .range(de, ate),
    ),
  ]);
  const por = new Map<string, string[]>();
  for (const i of itens) por.set(i.contrato_id, [...(por.get(i.contrato_id) ?? []), i.produto_id]);
  return contratos.map((k) => ({ ...k, valor_mensal: 0, valor_tabela: 0, produtos: por.get(k.id) ?? [] }));
}

/** Mensalidades da organização; com período, pela competência (inclusive). */
export async function lerCobrancas(org: string, filtro: { de?: string; ate?: string } = {}): Promise<Cobranca[]> {
  const l = await lerTudo<Cobranca>((de, ate) => {
    let q = supabase().from("lic_cobrancas").select("*").eq("org_id", org);
    if (filtro.de) q = q.gte("competencia", filtro.de);
    if (filtro.ate) q = q.lte("competencia", filtro.ate);
    return q.order("vencimento").order("id").range(de, ate);
  });
  return l.map((c) => num(c, ["valor", "valor_pago"]));
}

/** Recebimentos; com período, pela data do recebimento. */
export async function lerBaixas(org: string, filtro: { de?: string; ate?: string } = {}): Promise<BaixaLicenca[]> {
  const l = await lerTudo<BaixaLicenca>((de, ate) => {
    let q = supabase().from("lic_baixas").select("*").eq("org_id", org);
    if (filtro.de) q = q.gte("data", filtro.de);
    if (filtro.ate) q = q.lte("data", filtro.ate);
    return q.order("data").order("id").range(de, ate);
  });
  return l.map((b) => num(b, ["valor", "juros", "desconto", "total"]));
}

export async function lerBaixasDaCobranca(cobranca: string): Promise<BaixaLicenca[]> {
  const l = exigir(await supabase().from("lic_baixas").select("*").eq("cobranca_id", cobranca).order("id")) as BaixaLicenca[];
  return l.map((b) => num(b, ["valor", "juros", "desconto", "total"]));
}

export const lerBloqueios = (org: string) =>
  lerTudo<Bloqueio>((de, ate) =>
    supabase().from("lic_bloqueios").select("*").eq("org_id", org).order("bloqueado_em", { ascending: false }).order("id").range(de, ate),
  );

export async function lerReajustes(org: string): Promise<Reajuste[]> {
  const l = await lerTudo<Reajuste>((de, ate) =>
    supabase().from("lic_reajustes").select("*").eq("org_id", org).order("data", { ascending: false }).order("id").range(de, ate),
  );
  return l.map((r) => num(r, ["percentual", "valor_antes", "valor_depois"]));
}

export async function lerParametros(org: string): Promise<Parametros> {
  const { data, error } = await supabase().from("lic_parametros").select("org_id,dias_sugerir_bloqueio").eq("org_id", org).maybeSingle();
  if (error) throw error;
  return (data as Parametros | null) ?? { org_id: org, dias_sugerir_bloqueio: 30 };
}

/** Situação do cliente para o Portal (bloqueado? módulos contratados). */
export async function lerSituacaoPortal(cliente: string): Promise<SituacaoPortal> {
  const d = exigir(await supabase().rpc("portal_licenca_situacao", { p_cliente: cliente })) as SituacaoPortal | null;
  return { bloqueado: !!d?.bloqueado, modulos: d?.modulos ?? [] };
}
