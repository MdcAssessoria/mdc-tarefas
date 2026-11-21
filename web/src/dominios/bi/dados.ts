// BI de Gestão: leitura e gravação no banco (funções bi_* das migrações 097, 104 e 105). A permissão é conferida no banco em cada
// chamada (app.bi_pode_ver / app.bi_pode_lancar); a tela só mostra o que o banco devolve.
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import type { ContaBanco, OrigemBanco } from "./detalhe";
import type { SaldoBanco } from "./saldos";
import type { MovIntragrupo } from "./intragrupo";
import { montarMatriz } from "./relatorio";
import type { LinhaBanco, Matriz, TipoRelatorio } from "./relatorio";
import type { Indicadores } from "./indicadores";
import type { ComplementarBanco, LinhaRelatorio, OrcamentoBanco } from "./lancamentos";

export interface EmpresaBi {
  grupo_id: string;
  grupo: string;
  eliminar_intragrupo: boolean;
  cliente_id: string;
  nome: string;
  cnpj: string;
  codigo_dominio: string | null;
  ultima_sync: string | null;
  liberado: boolean;
  pode_aprovar: boolean;
  pedido_situacao: string | null;
  valido_ate: string | null;
}

export interface AcessoBi {
  id: string;
  cliente_id: string;
  empresa: string;
  pessoa: string;
  eu: boolean;
  situacao: "pedido" | "aprovado" | "negado" | "encerrado" | "vencido";
  motivo: string;
  pedido_em: string;
  decidido_em: string | null;
  resposta: string | null;
  valido_ate: string | null;
  posso_decidir: boolean;
}

export interface RegistroAcesso {
  em: string;
  pessoa: string;
  empresas: string;
  consulta: string;
  de: string | null;
  ate: string | null;
}

export interface ComplementarLido {
  id: number;
  cliente_id: string;
  competencia: string;
  data_caixa: string | null;
  linha_dre: string | null;
  linha_dfc: string | null;
  historico: string;
  valor: number;
  criado_em: string;
  cancelado_em: string | null;
  motivo_cancelamento: string | null;
}

export interface OrcamentoLido {
  cliente_id: string;
  relatorio: TipoRelatorio;
  linha: string;
  competencia: string;
  valor: number;
}

export interface ResultadoGravacao {
  ok: boolean;
  erros?: string[];
  total_erros?: number;
  linhas?: number;
  gravadas?: number;
  apagadas?: number;
}

async function rpc<T>(nome: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(nome, args);
  if (error) throw new Error(traduzirErro(error));
  return data as T;
}

export const lerEmpresas = () => rpc<EmpresaBi[]>("bi_empresas");
export const lerAcessos = () => rpc<AcessoBi[]>("bi_acessos_listar");
export const lerRegistro = (dias = 30) => rpc<RegistroAcesso[]>("bi_registro_acessos", { p_dias: dias });
export const pedirAcesso = (cliente: string, motivo: string) => rpc<string>("bi_acesso_pedir", { p_cliente: cliente, p_motivo: motivo });
export const decidirAcesso = (id: string, aprovar: boolean, resposta: string | null, dias = 30) =>
  rpc<void>("bi_acesso_decidir", { p_id: id, p_aprovar: aprovar, p_resposta: resposta, p_dias: dias });
export const encerrarAcesso = (id: string, motivo: string) => rpc<void>("bi_acesso_encerrar", { p_id: id, p_motivo: motivo });

export async function lerRelatorio(rel: TipoRelatorio, clientes: string[], de: string, ate: string, eliminar: boolean): Promise<Matriz> {
  const linhas = await rpc<LinhaBanco[]>("bi_relatorio", {
    p_relatorio: rel,
    p_clientes: clientes,
    p_inicio: de,
    p_fim: ate,
    p_eliminar: eliminar,
  });
  return montarMatriz(linhas ?? []);
}

/** Contas do plano por linha do relatório (bi_relatorio_contas, 104); agrupe com montarContas. */
export const lerContas = (rel: TipoRelatorio, clientes: string[], de: string, ate: string, eliminar: boolean) =>
  rpc<ContaBanco[]>("bi_relatorio_contas", { p_relatorio: rel, p_clientes: clientes, p_inicio: de, p_fim: ate, p_eliminar: eliminar });

/** De onde vem um valor (bi_origem, 104): notas, impostos, títulos, baixas e complementares. No máximo 5.000 linhas. */
export const lerOrigem = (
  rel: TipoRelatorio,
  clientes: string[],
  de: string,
  ate: string,
  eliminar: boolean,
  linha: string,
  conta: string | null,
  mes: string | null,
) =>
  rpc<OrigemBanco[]>("bi_origem", {
    p_relatorio: rel,
    p_clientes: clientes,
    p_inicio: de,
    p_fim: ate,
    p_eliminar: eliminar,
    p_linha: linha,
    p_conta: conta,
    p_mes: mes ? `${mes}-01` : null,
  });

export async function lerOrcado(rel: TipoRelatorio, clientes: string[], de: string, ate: string): Promise<Matriz> {
  const linhas = await rpc<LinhaBanco[]>("bi_orcado", { p_relatorio: rel, p_clientes: clientes, p_inicio: de, p_fim: ate });
  return montarMatriz(linhas ?? []);
}

export const lerIndicadores = (clientes: string[], de: string, ate: string, eliminar: boolean) =>
  rpc<Indicadores>("bi_indicadores", { p_clientes: clientes, p_inicio: de, p_fim: ate, p_eliminar: eliminar });

/** Contas analíticas (sem subtotais) da DRE e do DFC, para os lançamentos e o orçamento. */
export async function lerLinhas(): Promise<LinhaRelatorio[]> {
  const { data, error } = await supabase()
    .from("bi_linhas")
    .select("relatorio, codigo, nome, natureza, ordem, soma, org_id")
    .eq("ativo", true)
    .is("soma", null)
    .order("relatorio")
    .order("ordem");
  if (error) throw new Error(traduzirErro(error));
  const vistos = new Set<string>();
  return ((data ?? []) as (LinhaRelatorio & { org_id: string | null })[])
    .sort((a, b) => Number(a.org_id === null) - Number(b.org_id === null))
    .filter((l) => {
      const k = `${l.relatorio}:${l.codigo}`;
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    })
    .map(({ relatorio, codigo, nome, natureza }) => ({ relatorio, codigo, nome, natureza }));
}

export async function lerComplementares(clientes: string[], de: string, ate: string): Promise<ComplementarLido[]> {
  const { data, error } = await supabase()
    .from("bi_complementares")
    .select("id, cliente_id, competencia, data_caixa, linha_dre, linha_dfc, historico, valor, criado_em, cancelado_em, motivo_cancelamento")
    .in("cliente_id", clientes)
    .gte("competencia", `${de.slice(0, 7)}-01`)
    .lte("competencia", ate)
    .order("competencia", { ascending: false })
    .order("id", { ascending: false })
    .limit(2000);
  if (error) throw new Error(traduzirErro(error));
  return (data ?? []) as ComplementarLido[];
}

export const gravarComplementares = (linhas: ComplementarBanco[], arquivo: string, origem: "excel" | "manual") =>
  rpc<ResultadoGravacao>("bi_complementar_importar", { p_arquivo: arquivo, p_linhas: linhas, p_origem: origem });
export const cancelarComplementar = (id: number, motivo: string) => rpc<void>("bi_complementar_cancelar", { p_id: id, p_motivo: motivo });

export async function lerOrcamento(cliente: string, rel: TipoRelatorio, ano: number): Promise<OrcamentoLido[]> {
  const { data, error } = await supabase()
    .from("bi_orcamento")
    .select("cliente_id, relatorio, linha, competencia, valor")
    .eq("cliente_id", cliente)
    .eq("relatorio", rel)
    .gte("competencia", `${ano}-01-01`)
    .lte("competencia", `${ano}-12-01`);
  if (error) throw new Error(traduzirErro(error));
  return (data ?? []) as OrcamentoLido[];
}

export const gravarOrcamento = (linhas: OrcamentoBanco[], arquivo: string | null) =>
  rpc<ResultadoGravacao>("bi_orcamento_gravar", { p_linhas: linhas, p_arquivo: arquivo });

// ---------------------------------------------------------------- 105: classificação, plano e saldos dos bancos

export interface CategoriaClassificacao {
  cliente_id: string;
  empresa: string;
  categoria_codigo: string;
  descricao: string | null;
  conta: string | null;
  conta_nome: string | null;
  /** codigo = pelo código na descrição; excecao = escolhida pela equipe; transferencia = entre contas; sem = sem conta. */
  origem: "codigo" | "excecao" | "transferencia" | "sem";
  excecao_id: string | null;
  a_conferir: boolean;
  observacao: string | null;
  alterado_em: string | null;
  valor: number;
  lancamentos: number;
}

export interface ContaPlano {
  codigo: string;
  nome: string;
  tipo: string;
  ordem: number;
  linha_dre: string | null;
  linha_dfc: string | null;
  /** Linha do fluxo para o que entra, quando difere da do que sai (105, ex.: 9.1.01). */
  linha_dfc_entrada: string | null;
}

/** Plano de contas do BI (padrão MDC + contas próprias da organização, que ganham do padrão). */
export async function lerPlano(): Promise<ContaPlano[]> {
  const { data, error } = await supabase()
    .from("bi_plano")
    .select("codigo, nome, tipo, ordem, linha_dre, linha_dfc, linha_dfc_entrada, org_id")
    .eq("ativo", true)
    .order("ordem");
  if (error) throw new Error(traduzirErro(error));
  const porCodigo = new Map<string, ContaPlano>();
  for (const p of ((data ?? []) as (ContaPlano & { org_id: string | null })[]).sort(
    (a, b) => Number(a.org_id !== null) - Number(b.org_id !== null),
  )) {
    const { org_id: _org, ...conta } = p;
    porCodigo.set(conta.codigo, conta);
  }
  return [...porCodigo.values()].sort((a, b) => a.ordem - b.ordem);
}

export const lerClassificacao = (clientes: string[], de: string, ate: string) =>
  rpc<CategoriaClassificacao[]>("bi_classificacao_listar", { p_clientes: clientes, p_inicio: de, p_fim: ate });

export const salvarClassificacao = (
  clientes: string[],
  cliente: string,
  categoria: string,
  plano: string,
  mesmoNome: boolean,
  observacao: string | null,
) =>
  rpc<number>("bi_excecao_salvar", {
    p_clientes: clientes,
    p_cliente: cliente,
    p_categoria: categoria,
    p_plano: plano,
    p_mesmo_nome: mesmoNome,
    p_observacao: observacao,
  });

export const conferirClassificacao = (clientes: string[], id: string) =>
  rpc<void>("bi_excecao_conferir", { p_clientes: clientes, p_id: id });
export const excluirClassificacao = (clientes: string[], id: string, motivo: string) =>
  rpc<void>("bi_excecao_excluir", { p_clientes: clientes, p_id: id, p_motivo: motivo });

export const lerSaldos = (clientes: string[], de: string, ate: string) =>
  rpc<SaldoBanco[]>("bi_saldos", { p_clientes: clientes, p_inicio: de, p_fim: ate });

/**
 * Operações entre as empresas do grupo e possíveis pares lançados sem a empresa (109/110). Vazio com uma empresa só.
 * Lê em páginas de 1.000 (limite da API) sobre a ordem estável da função (data, empresa, ref).
 */
export async function lerIntragrupo(clientes: string[], de: string, ate: string): Promise<MovIntragrupo[]> {
  const PAGINA = 1000;
  const todas: MovIntragrupo[] = [];
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data, error } = await supabase()
      .rpc("bi_intragrupo", { p_clientes: clientes, p_inicio: de, p_fim: ate })
      .range(inicio, inicio + PAGINA - 1);
    if (error) throw new Error(traduzirErro(error));
    const pagina = (data ?? []) as MovIntragrupo[];
    todas.push(...pagina);
    if (pagina.length < PAGINA) return todas;
  }
}
