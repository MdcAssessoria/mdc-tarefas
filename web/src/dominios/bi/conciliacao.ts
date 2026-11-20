// BI de Gestão: comparativo Resultado (DRE, competência) × Caixa (DFC, pagamento), conta a conta do plano, com os
// alertas de variação (decisão do Edvaldo, 20/11/2026: atenção a partir de 10%, alerta a partir de 25%, só acima de
// R$ 5 mil) e a ponte do resultado líquido à variação do caixa (CPC 03 (R2), item 20A). Testado em conciliacao.test.ts.
import type { ContaBanco } from "./detalhe";

export interface GrupoConciliacao {
  id: string;
  nome: string;
  /** Prefixos das contas do plano que entram no grupo (o mais longo ganha). */
  prefixos: string[];
  /** Por que competência e caixa costumam diferir neste grupo. */
  explica: string;
}

/** Grupos com conta nos dois lados (DRE e caixa). O resto do caixa é investimento, financiamento ou sócios. */
export const GRUPOS: GrupoConciliacao[] = [
  {
    id: "vendas",
    nome: "Vendas e serviços",
    prefixos: ["3.1", "3.2", "4.1.07"],
    explica: "vendas a prazo ainda não recebidas (contas a receber subiu) ou recebimento de vendas de meses anteriores",
  },
  {
    id: "outras_receitas",
    nome: "Outras receitas e receitas financeiras",
    prefixos: ["3.3", "7.1"],
    explica: "receitas reconhecidas e ainda não recebidas, ou recebidas de períodos anteriores",
  },
  {
    id: "impostos",
    nome: "Impostos sobre vendas e sobre o lucro",
    prefixos: ["4.1", "6.4", "8.1", "9.1.02"],
    explica: "imposto apurado no mês e pago no mês seguinte, impostos atrasados ou parcelados",
  },
  {
    id: "pessoal",
    nome: "Pessoal (produção e administrativo)",
    prefixos: ["5.1.05", "5.1.11", "5.1.12", "6.1"],
    explica: "folha paga no mês seguinte, férias, 13º e encargos provisionados ou pagos depois",
  },
  {
    id: "custos",
    nome: "Custos de produção (materiais e terceiros)",
    prefixos: ["5"],
    explica: "compras a prazo (fornecedores a pagar) e material comprado que ficou no estoque",
  },
  {
    id: "despesas",
    nome: "Despesas administrativas e comerciais",
    prefixos: ["6.2", "6.3"],
    explica: "despesas lançadas por competência e pagas antes ou depois",
  },
  {
    id: "financeiras",
    nome: "Juros, tarifas e despesas financeiras",
    prefixos: ["7.2.01", "7.2.02", "7.2.03", "7.2.15", "7.2.16", "7.2.17", "7.2.18", "7.2.19", "7.2.20", "7.2.24", "7.2.25"],
    explica: "juros apropriados no mês e pagos junto com as parcelas, ou descontados direto na conta",
  },
];

export const SEM_CONTA = {
  id: "sem_conta",
  nome: "Sem conta do plano e lançamentos complementares",
  explica: "categorias do Omie ainda sem classificação ou lançamentos complementares com datas diferentes de competência e caixa",
};

export type NivelAlerta = "ok" | "atencao" | "alerta";

export const LIMITES = { atencao: 0.1, alerta: 0.25, piso: 5000 };

/** Alerta da diferença: abaixo do piso em R$ nunca alerta; o % é sobre o maior dos dois lados. */
export function nivelDaDiferenca(competencia: number, caixa: number): NivelAlerta {
  const dif = Math.abs(caixa - competencia);
  if (dif < LIMITES.piso) return "ok";
  const base = Math.max(Math.abs(competencia), Math.abs(caixa));
  const p = base ? dif / base : 1;
  if (p >= LIMITES.alerta) return "alerta";
  if (p >= LIMITES.atencao) return "atencao";
  return "ok";
}

/** Grupo de uma conta do plano (null = conta só de caixa: empréstimos, sócios, investimentos, transferências). */
export function grupoDaConta(conta: string | null): string | null {
  if (!conta) return SEM_CONTA.id;
  let melhor: { id: string; tam: number } | null = null;
  for (const g of GRUPOS)
    for (const p of g.prefixos)
      if ((conta === p || conta.startsWith(p + ".")) && (!melhor || p.length > melhor.tam)) melhor = { id: g.id, tam: p.length };
  return melhor?.id ?? null;
}

export interface LinhaConciliacao {
  id: string;
  nome: string;
  explica: string;
  competencia: number;
  caixa: number;
  diferenca: number;
  /** Diferença ÷ maior dos dois lados (null quando os dois são zero). */
  percentual: number | null;
  nivel: NivelAlerta;
}

export interface Conciliacao {
  linhas: LinhaConciliacao[];
  resultado: number;
  caixaOperacional: number;
  /** Caixa de contas que não passam pela DRE (empréstimos, parcelamentos, investimentos, sócios). */
  soCaixa: number;
  variacaoCaixa: number;
}

const centavos = (v: number) => Math.round(v * 100) / 100;

/**
 * Monta o comparativo a partir das contas da DRE e do DFC (bi_relatorio_contas). `soCaixa` junta o que no DFC não tem
 * contrapartida na DRE; resultado + Σ diferenças + soCaixa = variação do caixa.
 */
export function conciliar(dre: ContaBanco[], dfc: ContaBanco[]): Conciliacao {
  const soma = new Map<string, { c: number; x: number }>();
  const add = (g: string, c: number, x: number) => {
    const a = soma.get(g) ?? { c: 0, x: 0 };
    soma.set(g, { c: a.c + c, x: a.x + x });
  };
  let resultado = 0;
  let soCaixa = 0;
  let variacao = 0;
  for (const l of dre) {
    const v = Number(l.valor);
    resultado += v;
    add(grupoDaConta(l.conta) ?? SEM_CONTA.id, v, 0);
  }
  for (const l of dfc) {
    const v = Number(l.valor);
    variacao += v;
    const g = grupoDaConta(l.conta);
    if (g === null) soCaixa += v;
    else add(g, 0, v);
  }
  const todos = [...GRUPOS, SEM_CONTA];
  const linhas = todos
    .filter((g) => soma.has(g.id))
    .map((g) => {
      const { c, x } = soma.get(g.id)!;
      const competencia = centavos(c);
      const caixa = centavos(x);
      const base = Math.max(Math.abs(competencia), Math.abs(caixa));
      return {
        id: g.id,
        nome: g.nome,
        explica: g.explica,
        competencia,
        caixa,
        diferenca: centavos(caixa - competencia),
        percentual: base ? Math.abs(caixa - competencia) / base : null,
        nivel: nivelDaDiferenca(competencia, caixa),
      };
    })
    .filter((l) => l.competencia !== 0 || l.caixa !== 0);
  const caixaOperacional = centavos(linhas.reduce((a, l) => a + l.caixa, 0));
  return { linhas, resultado: centavos(resultado), caixaOperacional, soCaixa: centavos(soCaixa), variacaoCaixa: centavos(variacao) };
}

/** Frase de cada linha com alerta, para o topo da tela e o PDF. */
export function fraseDoAlerta(l: LinhaConciliacao, brl: (v: number) => string): string {
  const sentido = l.diferenca > 0 ? "entrou mais (ou saiu menos) no caixa do que" : "entrou menos (ou saiu mais) no caixa do que";
  return `${l.nome}: ${sentido} o resultado mostra (${brl(Math.abs(l.diferenca))}). Causa comum: ${l.explica}.`;
}
