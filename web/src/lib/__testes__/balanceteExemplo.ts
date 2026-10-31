// Matriz de exemplo no formato do Balancete exportado pelo Domínio em Excel (empresa fictícia), usada pelos testes.
// Débitos = créditos = 22.000. Abertura: ativo 9.500 = passivo 4.000 + PL 5.500.
// Fechamento: ativo 12.200 = passivo 4.500 + PL 5.500 + resultado do mês 2.200 (a soma das analíticas fecha em zero).

export const MATRIZ_BALANCETE: unknown[][] = [
  ["Empresa: 123 - EMPRESA EXEMPLO COMERCIO LTDA", "", "", "CNPJ: 11.222.333/0001-81"],
  ["Período: 01/09/2026 a 30/09/2026", "", "", "Folha: 1"],
  [],
  ["Código", "Classificação", "Descrição", "Saldo Anterior", "Débitos", "Créditos", "Saldo Atual"],
  ["1", "1", "ATIVO", "9.500,00D", "15.200,00", "12.500,00", "12.200,00D"],
  ["2", "1.1", "ATIVO CIRCULANTE", "9.500,00D", "15.200,00", "12.500,00", "12.200,00D"],
  ["3", "1.1.1", "DISPONIVEL", "1.000,00D", "7.200,00", "4.000,00", "4.200,00D"],
  ["10", "1.1.1.01", "CAIXA GERAL", "1.000,00D", "7.200,00", "4.000,00", "4.200,00D"],
  ["4", "1.1.2", "CLIENTES", "3.000,00D", "4.000,00", "2.000,00", "5.000,00D"],
  ["20", "1.1.2.01", "DUPLICATAS A RECEBER", "3.000,00D", "4.000,00", "2.000,00", "5.000,00D"],
  ["5", "1.1.3", "ESTOQUES", "5.500,00D", "4.000,00", "6.500,00", "3.000,00D"],
  ["30", "1.1.3.01", "MERCADORIAS PARA REVENDA", "5.500,00D", "4.000,00", "6.500,00", "3.000,00D"],
  ["6", "2", "PASSIVO", "9.500,00C", "3.000,00", "3.500,00", "10.000,00C"],
  ["7", "2.1", "PASSIVO CIRCULANTE", "4.000,00C", "3.000,00", "3.500,00", "4.500,00C"],
  ["8", "2.1.1", "FORNECEDORES", "3.700,00C", "2.700,00", "3.000,00", "4.000,00C"],
  ["40", "2.1.1.01", "FORNECEDORES NACIONAIS", "3.700,00C", "2.700,00", "3.000,00", "4.000,00C"],
  ["9", "2.1.2", "OBRIGACOES FISCAIS", "300,00C", "300,00", "500,00", "500,00C"],
  ["50", "2.1.2.01", "SIMPLES NACIONAL A RECOLHER", "300,00C", "300,00", "500,00", "500,00C"],
  ["11", "2.3", "PATRIMONIO LIQUIDO", "5.500,00C", "0,00", "0,00", "5.500,00C"],
  ["60", "2.3.1.01", "CAPITAL SOCIAL", "3.300,00C", "0,00", "0,00", "3.300,00C"],
  ["61", "2.3.2.01", "LUCROS ACUMULADOS", "2.200,00C", "0,00", "0,00", "2.200,00C"],
  ["12", "3", "RECEITAS", "0,00", "0,00", "6.000,00", "6.000,00C"],
  ["70", "3.1.1.01", "RECEITA DE VENDAS DE MERCADORIAS", "0,00", "0,00", "6.000,00", "6.000,00C"],
  ["71", "3.1.2.01", "(-) SIMPLES NACIONAL", "0,00", "300,00", "0,00", "300,00D"],
  ["13", "4", "CUSTOS E DESPESAS", "0,00", "3.500,00", "0,00", "3.500,00D"],
  ["80", "4.1.1.01", "CUSTO DAS MERCADORIAS VENDIDAS", "0,00", "2.500,00", "0,00", "2.500,00D"],
  ["90", "4.2.1.01", "DESPESAS COM ALUGUEL", "0,00", "1.000,00", "0,00", "1.000,00D"],
  ["", "", "Total", "", "22.000,00", "22.000,00", ""],
];

/** A mesma estrutura, mas com saldos sem D/C (todos positivos), como em alguns relatórios do Domínio. */
export const MATRIZ_SEM_DC: unknown[][] = MATRIZ_BALANCETE.map((l) =>
  l.map((c) => (typeof c === "string" ? c.replace(/([\d,])[DC]$/, "$1") : c)),
);
