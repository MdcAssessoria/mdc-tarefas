// Gravações do módulo Licenças. Tudo passa pelas funções lic_* do banco (permissão conferida lá, auditoria, nada se
// apaga); a tela só monta os dados e mostra o erro em português.
import { supabase } from "@/lib/supabase";
import { exigir } from "@/lib/exigir";
import type { Json } from "@/lib/database.types";
import type { IndiceReajuste } from "./tipos";

const rpc = async <T>(nome: string, args: Record<string, unknown>) => exigir(await supabase().rpc(nome, args)) as T;

export const salvarProduto = (p: {
  id?: string;
  org: string;
  slug?: string;
  nome: string;
  descricao: string;
  preco: number;
  ativo: boolean;
  ordem?: number;
}) => rpc<string>("lic_salvar_produto", { p: p as unknown as Json });

export const salvarPlano = (p: {
  id?: string;
  org: string;
  nome: string;
  descricao: string;
  preco: number;
  ativo: boolean;
  produtos: string[];
}) => rpc<string>("lic_salvar_plano", { p: p as unknown as Json });

export interface DadosContrato {
  id?: string;
  cliente: string;
  plano: string | null;
  produtos: string[];
  valor_mensal: number;
  dia_vencimento: number;
  inicio: string;
  fim: string | null;
  proporcional: boolean;
  reajuste_indice: IndiceReajuste;
  reajuste_mes: number | null;
  observacao: string | null;
  /** "full" = todos os módulos ativos do Ledgra; sem ele o banco decide entre gratuita (valor zero) e pacote. */
  modalidade?: "full";
}

export const salvarContrato = (p: DadosContrato) => rpc<string>("lic_salvar_contrato", { p: p as unknown as Json });

export const encerrarContrato = (contrato: string, data: string, motivo: string) =>
  rpc<number>("lic_encerrar_contrato", { p_contrato: contrato, p_data: data, p_motivo: motivo });

export const reajustarContrato = (contrato: string, percentual: number, obs: string | null) =>
  rpc<number>("lic_reajustar_contrato", { p_contrato: contrato, p_percentual: percentual, p_obs: obs });

/** Gera as mensalidades do mês (competência AAAA-MM-01). Não duplica: devolve quantas eram novas. */
export const gerarCobrancas = (org: string, competencia: string) =>
  rpc<number>("lic_gerar_cobrancas", { p_org: org, p_competencia: competencia });

export const baixarCobranca = (o: {
  cobranca: string;
  data: string;
  forma: string | null;
  juros: number;
  desconto: number;
  obs: string | null;
}) =>
  rpc<{ baixa: number; total: number }>("lic_baixar_cobranca", {
    p_cobranca: o.cobranca,
    p_data: o.data,
    p_forma: o.forma,
    p_juros: o.juros,
    p_desconto: o.desconto,
    p_obs: o.obs,
  });

export const desfazerBaixa = (cobranca: string, motivo: string) =>
  rpc<null>("lic_desfazer_baixa", { p_cobranca: cobranca, p_motivo: motivo });

export const cancelarCobranca = (cobranca: string, motivo: string) =>
  rpc<null>("lic_cancelar_cobranca", { p_cobranca: cobranca, p_motivo: motivo });

export const bloquearCliente = (cliente: string, motivo: string) => rpc<number>("lic_bloquear", { p_cliente: cliente, p_motivo: motivo });

export const desbloquearCliente = (cliente: string, motivo: string) =>
  rpc<null>("lic_desbloquear", { p_cliente: cliente, p_motivo: motivo });

export const definirParametros = (org: string, dias: number) =>
  rpc<null>("lic_definir_parametros", { p_org: org, p_dias_sugerir_bloqueio: dias });

/** Chave do Ledgra do cliente (migração 067): gera uma nova (a anterior deixa de valer) e devolve o texto UMA vez. */
export const gerarChaveLedgra = (cliente: string) => rpc<string>("lic_ledgra_chave_gerar", { p_cliente: cliente });

/** Revoga a chave do Ledgra: na próxima conferência o Ledgra fecha os módulos pagos daquela empresa. */
export const revogarChaveLedgra = (id: string, motivo: string) => rpc<null>("lic_ledgra_chave_revogar", { p_id: id, p_motivo: motivo });
