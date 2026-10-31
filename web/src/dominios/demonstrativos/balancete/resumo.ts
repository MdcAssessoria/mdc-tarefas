// Resumo do balancete: totais do balanço por grupo e DRE do mês (movimento) e do ano (saldo acumulado).
// Convenção dos saldos: devedor = positivo, credor = negativo.
import type { Grupo, Linha } from "./tipos";

export interface Resumo {
  // balanço (saldos atuais, valores positivos na natureza da conta)
  disponivel: number;
  clientes: number;
  estoques: number;
  ac_outros: number;
  ac: number;
  rlp: number;
  permanente: number;
  anc: number;
  ativo_total: number;
  fornecedores: number;
  pc_emprestimos: number;
  pc_obrigacoes: number;
  pc_outros: number;
  pc: number;
  pnc_emprestimos: number;
  pnc: number;
  pl: number;
  resultado_exercicio: number;
  // DRE do mês (movimento) e do ano (saldo acumulado)
  mes: Dre;
  ano: Dre;
  debitos: number;
  creditos: number;
}
export interface Dre {
  receita_bruta: number;
  deducoes: number;
  receita_liquida: number;
  custos: number;
  lucro_bruto: number;
  despesas_operacionais: number;
  resultado_operacional: number;
  receitas_financeiras: number;
  despesas_financeiras: number;
  outras: number;
  resultado_antes_ir: number;
  ir_csll: number;
  lucro_liquido: number;
  despesas_por_conta: { conta: string; valor: number }[];
}

/** Arredonda para centavos. */
export const r2 = (n: number) => Math.round(n * 100) / 100;

function dre(linhas: Linha[], valor: (l: Linha) => number): Dre {
  const s = (g: Grupo) => r2(linhas.filter((l) => l.analitica && l.grupo === g).reduce((a, l) => a + valor(l), 0));
  // resultado: receitas credoras (negativas) → invertidas para positivo
  const receita_bruta = -s("receita_bruta");
  const deducoes = s("deducoes");
  const receita_liquida = r2(receita_bruta - deducoes);
  const custos = s("custos");
  const lucro_bruto = r2(receita_liquida - custos);
  const despesas_operacionais = s("despesas_operacionais");
  const resultado_operacional = r2(lucro_bruto - despesas_operacionais);
  const receitas_financeiras = -s("receitas_financeiras");
  const despesas_financeiras = s("despesas_financeiras");
  const outras = r2(-s("outras_receitas") - s("outras_despesas"));
  const resultado_antes_ir = r2(resultado_operacional + receitas_financeiras - despesas_financeiras + outras);
  const ir_csll = s("ir_csll");
  const porConta = new Map<string, number>();
  for (const l of linhas.filter((x) => x.analitica && (x.grupo === "despesas_operacionais" || x.grupo === "custos"))) {
    porConta.set(l.descricao, (porConta.get(l.descricao) ?? 0) + valor(l));
  }
  return {
    receita_bruta,
    deducoes,
    receita_liquida,
    custos,
    lucro_bruto,
    despesas_operacionais,
    resultado_operacional,
    receitas_financeiras,
    despesas_financeiras,
    outras,
    resultado_antes_ir,
    ir_csll,
    lucro_liquido: r2(resultado_antes_ir - ir_csll),
    despesas_por_conta: [...porConta.entries()]
      .map(([conta, v]) => ({ conta, valor: r2(v) }))
      .filter((x) => x.valor > 0)
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 12),
  };
}

export function resumir(linhas: Linha[]): Resumo {
  const an = linhas.filter((l) => l.analitica);
  const sa = (g: Grupo) => r2(an.filter((l) => l.grupo === g).reduce((a, l) => a + l.saldo_atual, 0));
  const disponivel = sa("ac_disponivel"),
    clientes = sa("ac_clientes"),
    estoques = sa("ac_estoques"),
    ac_outros = sa("ac_outros");
  const ac = r2(disponivel + clientes + estoques + ac_outros);
  const rlp = sa("anc_rlp"),
    permanente = sa("anc_permanente");
  const anc = r2(rlp + permanente);
  const fornecedores = -sa("pc_fornecedores"),
    pc_emprestimos = -sa("pc_emprestimos"),
    pc_obrigacoes = -sa("pc_obrigacoes"),
    pc_outros = -sa("pc_outros");
  const pc = r2(fornecedores + pc_emprestimos + pc_obrigacoes + pc_outros);
  const pnc_emprestimos = -sa("pnc_emprestimos");
  const pnc = r2(pnc_emprestimos - sa("pnc_outros"));
  const pl = -sa("pl");
  const ano = dre(linhas, (l) => l.saldo_atual);
  const mes = dre(linhas, (l) => l.debitos - l.creditos);
  return {
    disponivel,
    clientes,
    estoques,
    ac_outros,
    ac,
    rlp,
    permanente,
    anc,
    ativo_total: r2(ac + anc),
    fornecedores,
    pc_emprestimos,
    pc_obrigacoes,
    pc_outros,
    pc,
    pnc_emprestimos,
    pnc,
    pl,
    resultado_exercicio: ano.lucro_liquido,
    mes,
    ano,
    debitos: r2(an.reduce((a, l) => a + l.debitos, 0)),
    creditos: r2(an.reduce((a, l) => a + l.creditos, 0)),
  };
}
