// Leituras do Financeiro (sempre paginadas: o Supabase corta em 1000 linhas sem avisar).
import { supabase } from "@/lib/supabase";
import { lerTudo } from "@/lib/lerTudo";
import { exigir } from "@/lib/exigir";
import type { DadosConciliacao } from "./conciliacao";
import type {
  Baixa,
  Categoria,
  CentroCusto,
  ContaBancaria,
  ContaContabil,
  GrupoItem,
  Item,
  LinhaExtrato,
  LocalEstoque,
  LoteExtrato,
  MovimentoEstoque,
  Pedido,
  PedidoItem,
  Pessoa,
  SaldoEstoque,
  Titulo,
  TipoTitulo,
  Transferencia,
} from "./tipos";

export const lerPlano = (cliente: string) =>
  lerTudo<ContaContabil>((de, ate) =>
    supabase()
      .from("fin_plano_contas")
      .select("id,cliente_id,codigo,classificacao,descricao,analitica,nivel,ativo")
      .eq("cliente_id", cliente)
      .order("classificacao")
      .order("id")
      .range(de, ate),
  );

export const lerContas = (cliente: string) =>
  lerTudo<ContaBancaria>((de, ate) =>
    supabase().from("fin_contas_bancarias").select("*").eq("cliente_id", cliente).order("nome").order("id").range(de, ate),
  );

/** Lançamentos do cliente; com `conta`, só daquela conta; com período, só entre as datas (inclusive). */
export const lerLinhas = (cliente: string, filtro: { conta?: string; de?: string; ate?: string } = {}) =>
  lerTudo<LinhaExtrato>((de, ate) => {
    let q = supabase()
      .from("fin_extrato_linhas")
      .select("id,conta_id,lote_id,data,valor,descricao,documento,situacao")
      .eq("cliente_id", cliente)
      .neq("situacao", "desfeita");
    if (filtro.conta) q = q.eq("conta_id", filtro.conta);
    if (filtro.de) q = q.gte("data", filtro.de);
    if (filtro.ate) q = q.lte("data", filtro.ate);
    return q.order("data").order("id").range(de, ate);
  });

export const lerLotes = (cliente: string) =>
  lerTudo<LoteExtrato>((de, ate) =>
    supabase()
      .from("fin_extrato_lotes")
      .select("id,conta_id,arquivo,formato,inicio,fim,recebidas,novas,repetidas,em")
      .eq("cliente_id", cliente)
      .is("desfeito_em", null)
      .order("em", { ascending: false })
      .order("id")
      .range(de, ate),
  );

/** Texto de um arquivo de extrato: tenta UTF-8 e, se vierem caracteres quebrados, lê como Windows-1252 (bancos antigos). */
export async function textoDoArquivo(arq: File): Promise<string> {
  const bytes = new Uint8Array(await arq.arrayBuffer());
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(bytes) : utf8;
}

/** "1.1.1.02.001 · Banco Itaú" */
export const rotuloConta = (c: Pick<ContaContabil, "classificacao" | "descricao" | "codigo">) =>
  `${c.classificacao}${c.codigo ? ` (${c.codigo})` : ""} · ${c.descricao}`;

// ------------------------------------------------------------------ cadastros

export const lerPessoas = (cliente: string) =>
  lerTudo<Pessoa>((de, ate) =>
    supabase().from("fin_pessoas").select("*").eq("cliente_id", cliente).order("nome").order("id").range(de, ate),
  );

export const lerCategorias = (cliente: string) =>
  lerTudo<Categoria>((de, ate) =>
    supabase().from("fin_categorias").select("*").eq("cliente_id", cliente).order("tipo").order("nome").order("id").range(de, ate),
  );

export const lerCentros = (cliente: string) =>
  lerTudo<CentroCusto>((de, ate) =>
    supabase().from("fin_centros_custo").select("*").eq("cliente_id", cliente).order("nome").order("id").range(de, ate),
  );

// ------------------------------------------------------------------ títulos e baixas

/** Títulos de um tipo; com período, pelo vencimento (inclusive). */
export const lerTitulos = (cliente: string, tipo: TipoTitulo, filtro: { de?: string; ate?: string } = {}) =>
  lerTudo<Titulo>((de, ate) => {
    let q = supabase().from("fin_titulos").select("*").eq("cliente_id", cliente).eq("tipo", tipo);
    if (filtro.de) q = q.gte("vencimento", filtro.de);
    if (filtro.ate) q = q.lte("vencimento", filtro.ate);
    return q.order("vencimento").order("id").range(de, ate);
  });

/** Títulos em aberto (a pagar e a receber) da empresa, para o painel inicial. */
export const lerTitulosAbertos = (cliente: string) =>
  lerTudo<Titulo>((de, ate) =>
    supabase()
      .from("fin_titulos")
      .select("*")
      .eq("cliente_id", cliente)
      .eq("situacao", "aberto")
      .order("vencimento")
      .order("id")
      .range(de, ate),
  );

/** Quantas linhas a empresa tem numa tabela do Financeiro (só conta, não traz os dados). Usado nos primeiros passos. */
export async function contarDoCliente(tabela: "fin_plano_contas" | "fin_categorias" | "fin_titulos", cliente: string): Promise<number> {
  const { count, error } = await supabase().from(tabela).select("id", { count: "exact", head: true }).eq("cliente_id", cliente);
  if (error) throw error;
  return count ?? 0;
}

/** Títulos por id (para mostrar a origem das baixas em Entradas e saídas). */
export async function lerTitulosPorId(ids: string[]): Promise<Titulo[]> {
  const unicos = [...new Set(ids)];
  const saida: Titulo[] = [];
  for (let i = 0; i < unicos.length; i += 200) {
    const { data, error } = await supabase()
      .from("fin_titulos")
      .select("*")
      .in("id", unicos.slice(i, i + 200));
    if (error) throw error;
    saida.push(...((data ?? []) as Titulo[]));
  }
  return saida;
}

/** Pagamentos e recebimentos; com período, pela data do pagamento; com títulos, só desses. */
export const lerBaixas = (cliente: string, filtro: { de?: string; ate?: string; titulos?: string[] } = {}) =>
  lerTudo<Baixa>((de, ate) => {
    let q = supabase().from("fin_baixas").select("*").eq("cliente_id", cliente);
    if (filtro.de) q = q.gte("data", filtro.de);
    if (filtro.ate) q = q.lte("data", filtro.ate);
    if (filtro.titulos) q = q.in("titulo_id", filtro.titulos);
    return q.order("data").order("id").range(de, ate);
  });

/** Transferências entre contas da empresa (com estornadas, para o histórico); com período, pela data. */
export const lerTransferencias = (cliente: string, filtro: { de?: string; ate?: string } = {}) =>
  lerTudo<Transferencia>((de, ate) => {
    let q = supabase()
      .from("fin_transferencias")
      .select("id,cliente_id,origem_id,destino_id,data,valor,observacao,estornada,estorno_motivo")
      .eq("cliente_id", cliente);
    if (filtro.de) q = q.gte("data", filtro.de);
    if (filtro.ate) q = q.lte("data", filtro.ate);
    return q.order("data", { ascending: false }).order("id", { ascending: false }).range(de, ate);
  });

// ------------------------------------------------------------------ itens e estoque

export const lerItens = (cliente: string) =>
  lerTudo<Item>((de, ate) => supabase().from("est_itens").select("*").eq("cliente_id", cliente).order("nome").order("id").range(de, ate));

export const lerLocais = (cliente: string) =>
  lerTudo<LocalEstoque>((de, ate) =>
    supabase().from("est_locais").select("*").eq("cliente_id", cliente).order("nome").order("id").range(de, ate),
  );

export const lerSaldos = (cliente: string) =>
  lerTudo<SaldoEstoque>((de, ate) =>
    supabase()
      .from("est_saldos")
      .select("item_id,local_id,saldo,ultimo_movimento")
      .eq("cliente_id", cliente)
      .order("item_id")
      .order("local_id")
      .range(de, ate),
  );

export const lerMovimentos = (cliente: string, filtro: { de?: string; ate?: string; item?: string } = {}) =>
  lerTudo<MovimentoEstoque>((de, ate) => {
    let q = supabase().from("est_movimentos").select("*").eq("cliente_id", cliente);
    if (filtro.de) q = q.gte("data", filtro.de);
    if (filtro.ate) q = q.lte("data", filtro.ate);
    if (filtro.item) q = q.eq("item_id", filtro.item);
    return q.order("data", { ascending: false }).order("id", { ascending: false }).range(de, ate);
  });

export const lerGrupos = (cliente: string) =>
  lerTudo<GrupoItem>((de, ate) =>
    supabase().from("est_grupos").select("id,cliente_id,nome,ativo").eq("cliente_id", cliente).order("nome").order("id").range(de, ate),
  );

/** Ficha de estoque (kardex) de um item: movimentos em ordem de data, com saldo e custo médio depois de cada um. */
export const lerFicha = (item: string, filtro: { de?: string; ate?: string } = {}) =>
  lerTudo<MovimentoEstoque>((de, ate) => {
    let q = supabase().from("est_movimentos").select("*").eq("item_id", item);
    if (filtro.de) q = q.gte("data", filtro.de);
    if (filtro.ate) q = q.lte("data", filtro.ate);
    return q.order("data").order("id").range(de, ate);
  });

/** Último movimento válido antes da data (para o saldo anterior da ficha). */
export async function lerSaldoAnterior(item: string, data: string): Promise<{ saldo: number; custo: number | null }> {
  const { data: linhas, error } = await supabase()
    .from("est_movimentos")
    .select("saldo_apos,custo_medio_apos")
    .eq("item_id", item)
    .eq("estornado", false)
    .lt("data", data)
    .order("data", { ascending: false })
    .order("id", { ascending: false })
    .limit(1);
  if (error) throw error;
  const l = linhas?.[0];
  return { saldo: Number(l?.saldo_apos ?? 0), custo: l?.custo_medio_apos == null ? null : Number(l.custo_medio_apos) };
}

// ------------------------------------------------------------------ pedidos

/** Pedidos de venda ou de compra; com período, pela data do pedido. */
export const lerPedidos = (cliente: string, tipo: "venda" | "compra", filtro: { de?: string; ate?: string } = {}) =>
  lerTudo<Pedido>((de, ate) => {
    let q = supabase().from("est_pedidos").select("*").eq("cliente_id", cliente).eq("tipo", tipo);
    if (filtro.de) q = q.gte("data", filtro.de);
    if (filtro.ate) q = q.lte("data", filtro.ate);
    return q.order("data", { ascending: false }).order("numero", { ascending: false }).range(de, ate);
  });

/** Linhas de um pedido (sem as trocadas no rascunho). */
export async function lerItensDoPedido(pedido: string): Promise<PedidoItem[]> {
  const { data, error } = await supabase()
    .from("est_pedido_itens")
    .select("id,pedido_id,ordem,item_id,descricao,unidade,fator,quantidade,preco_unitario,desconto,total,custo_unitario,movimento_id")
    .eq("pedido_id", pedido)
    .eq("removido", false)
    .order("ordem");
  if (error) throw error;
  return (data ?? []) as PedidoItem[];
}

/** Contas a receber/pagar geradas pelo pedido. */
export async function lerTitulosDoPedido(pedido: string): Promise<Titulo[]> {
  const { data, error } = await supabase().from("est_pedido_titulos").select("titulo_id").eq("pedido_id", pedido);
  if (error) throw error;
  return lerTitulosPorId((data ?? []).map((x) => x.titulo_id));
}

export async function lerPermiteNegativo(cliente: string): Promise<boolean> {
  const { data, error } = await supabase().from("est_parametros").select("permite_negativo").eq("cliente_id", cliente).maybeSingle();
  if (error) throw error;
  return !!data?.permite_negativo;
}

// ------------------------------------------------------------------ conciliação do extrato

/** Tudo da tela de conciliação de uma conta no período: linhas do extrato, o que já está no HUB e os saldos (051). */
export async function lerConciliacao(conta: string, de: string, ate: string): Promise<DadosConciliacao> {
  return exigir(await supabase().rpc("fin_conciliacao_dados", { p_conta: conta, p_de: de, p_ate: ate })) as unknown as DadosConciliacao;
}
