// Tipos e somas das demonstrações usados pela Edge Function (gerado de
// web/src/dominios/demonstrativos/calculosDemonstracoes.ts por scripts/sync-funcoes.sh).
import type { Dre } from "./balancete.ts";

export interface Periodo {
  inicio: string;
  fim: string;
  dias: number;
}

export interface LinhaBp {
  classificacao: string;
  rotulo: string;
  nivel: number;
  atual: number;
  anterior: number;
}
export interface Balanco {
  ativo: LinhaBp[];
  passivo: LinhaBp[];
  total_ativo: { atual: number; anterior: number };
  total_passivo: { atual: number; anterior: number };
}

export interface LinhaFluxo {
  chave: string;
  rotulo: string;
  valor: number;
}
export interface Dfc {
  operacional: LinhaFluxo[];
  investimento: LinhaFluxo[];
  financiamento: LinhaFluxo[];
  fco: number;
  fci: number;
  fcf: number;
  caixa_inicial: number;
  caixa_final: number;
  variacao: number;
  depreciacao: number;
  fechado: boolean;
}

export interface Comentario {
  titulo: string;
  texto: string;
  tom: "positivo" | "neutro" | "atencao";
}
export interface Cruzamento {
  lucro: number;
  ebitda: number;
  fco: number;
  conversao: number | null; // FCO ÷ lucro
  capital_giro: number; // variação do capital de giro na DFC (negativo = consumiu caixa)
  comentarios: Comentario[];
}

export interface Pilar {
  id: string;
  nome: string;
  status: "bom" | "atencao" | "critico";
  nota: number;
  frase: string;
}
export interface Saude {
  nota: number;
  faixa: "Saudável" | "Atenção" | "Crítica";
  pilares: Pilar[];
}

export interface Demonstracoes {
  periodo: Periodo;
  balanco: Balanco;
  dfc: Dfc;
  cruzamento: Cruzamento;
  saude: Saude;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

const ROTULOS: Record<string, [keyof Pick<Dfc, "operacional" | "investimento" | "financiamento">, string]> = {
  lucro: ["operacional", "Lucro (prejuízo) líquido do período"],
  depreciacao: ["operacional", "Depreciação e amortização (não saem do caixa)"],
  clientes: ["operacional", "Clientes a receber — (aumento) ou redução"],
  estoques: ["operacional", "Estoques — (aumento) ou redução"],
  outros_ativos: ["operacional", "Outros créditos, adiantamentos e impostos a recuperar"],
  fornecedores: ["operacional", "Fornecedores — aumento ou (redução)"],
  obrigacoes: ["operacional", "Impostos, salários e encargos a pagar"],
  outros_passivos: ["operacional", "Outras contas a pagar"],
  imobilizado: ["investimento", "Imobilizado, intangível e investimentos (compras e baixas)"],
  emprestimos_concedidos: ["investimento", "Empréstimos concedidos e créditos com partes relacionadas"],
  emprestimos: ["financiamento", "Empréstimos e financiamentos (captações − pagamentos)"],
  socios: ["financiamento", "Mútuos e contas com sócios"],
  capital: ["financiamento", "Capital social e reservas"],
  lucros: ["financiamento", "Lucros distribuídos e ajustes de lucros acumulados"],
};

export function somarDre(lista: Dre[]): Dre {
  const campos = [
    "receita_bruta",
    "deducoes",
    "receita_liquida",
    "custos",
    "lucro_bruto",
    "despesas_operacionais",
    "resultado_operacional",
    "receitas_financeiras",
    "despesas_financeiras",
    "outras",
    "resultado_antes_ir",
    "ir_csll",
    "lucro_liquido",
  ] as const;
  const out = Object.fromEntries(campos.map((c) => [c, r2(lista.reduce((a, x) => a + (x?.[c] ?? 0), 0))])) as unknown as Dre;
  const contas = new Map<string, number>();
  for (const x of lista) for (const c of x?.despesas_por_conta ?? []) contas.set(c.conta, (contas.get(c.conta) ?? 0) + c.valor);
  out.despesas_por_conta = [...contas.entries()]
    .map(([conta, valor]) => ({ conta, valor: r2(valor) }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 12);
  return out;
}

export function somarDfc(lista: Dfc[]): Dfc | null {
  if (!lista.length) return null;
  const somaSec = (s: "operacional" | "investimento" | "financiamento") => {
    const m = new Map<string, LinhaFluxo>();
    for (const d of lista)
      for (const x of d[s]) {
        const e = m.get(x.chave);
        if (e) e.valor = r2(e.valor + x.valor);
        else m.set(x.chave, { ...x });
      }
    const ordem = Object.keys(ROTULOS);
    return [...m.values()].sort((a, b) => ordem.indexOf(a.chave) - ordem.indexOf(b.chave));
  };
  const s = (k: "fco" | "fci" | "fcf" | "variacao" | "depreciacao") => r2(lista.reduce((a, d) => a + d[k], 0));
  return {
    operacional: somaSec("operacional"),
    investimento: somaSec("investimento"),
    financiamento: somaSec("financiamento"),
    fco: s("fco"),
    fci: s("fci"),
    fcf: s("fcf"),
    variacao: s("variacao"),
    depreciacao: s("depreciacao"),
    caixa_inicial: lista[0].caixa_inicial,
    caixa_final: lista[lista.length - 1].caixa_final,
    fechado: lista.every((d) => d.fechado),
  };
}

export function linhasDre(d: Dre): { rotulo: string; valor: number; total?: boolean; nivel: number }[] {
  return [
    { rotulo: "Receita operacional bruta", valor: d.receita_bruta, nivel: 1, total: true },
    { rotulo: "(−) Deduções e impostos sobre a receita", valor: -d.deducoes, nivel: 2 },
    { rotulo: "Receita operacional líquida", valor: d.receita_liquida, nivel: 1, total: true },
    { rotulo: "(−) Custos dos produtos, mercadorias e serviços", valor: -d.custos, nivel: 2 },
    { rotulo: "Lucro bruto", valor: d.lucro_bruto, nivel: 1, total: true },
    { rotulo: "(−) Despesas operacionais", valor: -d.despesas_operacionais, nivel: 2 },
    { rotulo: "Resultado operacional", valor: d.resultado_operacional, nivel: 1, total: true },
    { rotulo: "(+) Receitas financeiras", valor: d.receitas_financeiras, nivel: 2 },
    { rotulo: "(−) Despesas financeiras", valor: -d.despesas_financeiras, nivel: 2 },
    { rotulo: "(±) Outras receitas e despesas", valor: d.outras, nivel: 2 },
    { rotulo: "Resultado antes do IRPJ e da CSLL", valor: d.resultado_antes_ir, nivel: 1, total: true },
    { rotulo: "(−) IRPJ e CSLL", valor: -d.ir_csll, nivel: 2 },
    { rotulo: "Lucro (prejuízo) líquido do período", valor: d.lucro_liquido, nivel: 1, total: true },
  ];
}
