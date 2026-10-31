// Tipos básicos do balancete: grupo gerencial de uma conta, linha (conta) e cabeçalho do relatório do Domínio.
// Convenção dos saldos: devedor = positivo, credor = negativo.

export type Grupo =
  | "ac_disponivel"
  | "ac_clientes"
  | "ac_estoques"
  | "ac_outros"
  | "anc_rlp"
  | "anc_permanente"
  | "pc_fornecedores"
  | "pc_emprestimos"
  | "pc_obrigacoes"
  | "pc_outros"
  | "pnc_emprestimos"
  | "pnc_outros"
  | "pl"
  | "receita_bruta"
  | "deducoes"
  | "custos"
  | "despesas_operacionais"
  | "receitas_financeiras"
  | "despesas_financeiras"
  | "outras_receitas"
  | "outras_despesas"
  | "ir_csll"
  | "ignorar";

export interface Linha {
  codigo: string | null;
  classificacao: string;
  descricao: string;
  nivel: number;
  analitica: boolean;
  saldo_anterior: number;
  debitos: number;
  creditos: number;
  saldo_atual: number;
  grupo: Grupo | null;
}

export interface Cabecalho {
  empresa: string | null;
  cnpj: string | null;
  codigoEmpresa: string | null;
  inicio: string | null; // YYYY-MM-DD
  fim: string | null;
}
