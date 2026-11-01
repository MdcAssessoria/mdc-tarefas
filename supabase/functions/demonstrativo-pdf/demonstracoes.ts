// Tipos, somas, cruzamento DRE × DFC e termômetro usados pela Edge Function (gerado de
// web/src/dominios/demonstrativos/calculosDemonstracoes.ts por scripts/sync-funcoes.sh).
import { brl, fmtIndice } from "./balancete.ts";
import type { Dre, Indices, Resumo } from "./balancete.ts";

/** Valores dos textos de análise em reais inteiros (brl da função já não mostra centavos). */
const reais = (v: number | null | undefined) => brl(v);

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

export function cruzar(d: Dre, f: Dfc): Cruzamento {
  const lucro = d.lucro_liquido;
  const ebitda = r2(d.resultado_operacional + f.depreciacao);
  const giro = r2(f.operacional.filter((x) => x.chave !== "lucro" && x.chave !== "depreciacao").reduce((a, x) => a + x.valor, 0));
  const conversao = lucro > 0 ? f.fco / lucro : null;
  const C: Comentario[] = [];
  const cem = (v: number) => reais(Math.abs(v));

  // 1. lucro × caixa da operação
  if (lucro >= 0 && f.fco >= lucro)
    C.push({
      tom: "positivo",
      titulo: "O lucro virou dinheiro",
      texto: `A empresa teve lucro de ${cem(lucro)} e a operação colocou ${cem(f.fco)} no caixa. Cada R$ 100 de lucro trouxeram cerca de R$ ${Math.round((conversao ?? 0) * 100)} de dinheiro.`,
    });
  else if (lucro >= 0 && f.fco >= 0)
    C.push({
      tom: "neutro",
      titulo: "Lucro maior que o dinheiro gerado",
      texto: `O lucro foi de ${cem(lucro)}, mas a operação gerou só ${cem(f.fco)} de caixa. Parte do lucro ficou "presa" em clientes a receber, estoque ou pagamentos adiantados.`,
    });
  else if (lucro >= 0)
    C.push({
      tom: "atencao",
      titulo: "Lucro no papel, caixa saindo",
      texto: `Mesmo com lucro de ${cem(lucro)}, a operação consumiu ${cem(f.fco)} de caixa. É sinal de que a empresa está vendendo a prazo, comprando estoque ou pagando contas acumuladas mais rápido do que recebe.`,
    });
  else if (f.fco >= 0)
    C.push({
      tom: "neutro",
      titulo: "Prejuízo, mas a operação gerou caixa",
      texto: `A DRE mostra prejuízo de ${cem(lucro)}, porém a operação colocou ${cem(f.fco)} no caixa — por recebimentos de vendas anteriores, despesas ainda não pagas ou depreciação (que é custo, mas não sai do caixa). O alívio é temporário se o prejuízo continuar.`,
    });
  else
    C.push({
      tom: "atencao",
      titulo: "Prejuízo e caixa saindo",
      texto: `Houve prejuízo de ${cem(lucro)} e a operação consumiu ${cem(f.fco)} de caixa. A empresa está financiando o dia a dia com o caixa acumulado, empréstimos ou dinheiro dos sócios.`,
    });

  // 2. o que mais mexeu no capital de giro
  const giroLinhas = f.operacional.filter(
    (x) => !["lucro", "depreciacao"].includes(x.chave) && Math.abs(x.valor) > Math.max(1000, Math.abs(f.fco) * 0.1),
  );
  const explica: Record<string, [string, string]> = {
    clientes: [
      "a carteira a receber diminuiu (os clientes pagaram mais do que compraram a prazo)",
      "as vendas a prazo ainda não recebidas aumentaram",
    ],
    estoques: ["o estoque diminuiu (vendeu mais do que comprou)", "o estoque aumentou (dinheiro parado em mercadoria)"],
    outros_ativos: ["créditos e adiantamentos foram recuperados", "aumentaram adiantamentos, créditos ou impostos a recuperar"],
    fornecedores: ["a empresa passou a pagar fornecedores com mais prazo", "fornecedores foram pagos (dívida com eles diminuiu)"],
    obrigacoes: ["impostos e encargos ficaram para pagar no mês seguinte", "impostos e encargos acumulados foram pagos"],
    outros_passivos: ["outras contas ficaram a pagar", "outras contas a pagar foram quitadas"],
  };
  if (giroLinhas.length) {
    const top = [...giroLinhas].sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor)).slice(0, 3);
    C.push({
      tom: giro >= 0 ? "positivo" : "atencao",
      titulo: giro >= 0 ? `O giro do negócio liberou ${cem(giro)}` : `O giro do negócio prendeu ${cem(giro)}`,
      texto:
        top
          .map((x) => `${(explica[x.chave] ?? [x.rotulo, x.rotulo])[x.valor >= 0 ? 0 : 1]} (${x.valor >= 0 ? "+" : "−"}${cem(x.valor)})`)
          .join("; ") + ".",
    });
  }

  // 3. EBITDA
  if (d.receita_liquida > 0)
    C.push({
      tom: ebitda >= 0 ? "neutro" : "atencao",
      titulo: `Geração operacional (EBITDA): ${reais(ebitda)}`,
      texto: `É o resultado da operação antes de juros, impostos sobre o lucro e depreciação — ${fmtIndice(ebitda / d.receita_liquida, "%")} da receita líquida. Mostra quanto o negócio gera só com a atividade principal.`,
    });

  // 4. para onde foi / de onde veio o dinheiro além da operação
  const usos: string[] = [];
  for (const x of [...f.investimento, ...f.financiamento].filter((x) => Math.abs(x.valor) > Math.max(1000, Math.abs(f.variacao) * 0.05))) {
    const sai = x.valor < 0;
    const t: Record<string, [string, string]> = {
      imobilizado: ["venda ou baixa de bens", "compra de máquinas, veículos, imóveis ou sistemas"],
      emprestimos_concedidos: ["recebimento de empréstimos feitos a terceiros/sócios", "empréstimos feitos a sócios ou empresas ligadas"],
      emprestimos: ["novos empréstimos bancários", "pagamento de empréstimos bancários"],
      socios: ["dinheiro emprestado pelos sócios", "devolução de dinheiro aos sócios"],
      capital: ["aumento de capital ou de reservas", "redução de capital ou de reservas"],
      lucros: ["ajustes de lucros acumulados", "distribuição de lucros aos sócios"],
    };
    usos.push(`${(t[x.chave] ?? [x.rotulo, x.rotulo])[sai ? 1 : 0]} (${sai ? "−" : "+"}${cem(x.valor)})`);
  }
  if (usos.length) C.push({ tom: "neutro", titulo: "Além da operação", texto: `O caixa também foi movimentado por: ${usos.join("; ")}.` });

  // 5. resultado final no caixa
  C.push({
    tom: f.variacao >= 0 ? "positivo" : f.caixa_final >= 0 ? "neutro" : "atencao",
    titulo: f.variacao >= 0 ? `O caixa aumentou ${cem(f.variacao)}` : `O caixa diminuiu ${cem(f.variacao)}`,
    texto: `Começou o período com ${reais(f.caixa_inicial)} em caixa, bancos e aplicações e terminou com ${reais(f.caixa_final)}.`,
  });
  return { lucro, ebitda, fco: f.fco, conversao, capital_giro: giro, comentarios: C };
}

const cents = (m: number) =>
  (m * 100).toLocaleString("pt-BR", { minimumFractionDigits: m * 100 < 10 ? 2 : 0, maximumFractionDigits: m * 100 < 10 ? 2 : 0 });

export function saude(r: Resumo, i: Indices, f: Dfc): Saude {
  const P: Pilar[] = [];
  const pil = (id: string, nome: string, status: Pilar["status"], frase: string) =>
    P.push({ id, nome, status, nota: status === "bom" ? 100 : status === "atencao" ? 55 : 15, frase });
  const lc = i.liquidez_corrente;
  pil(
    "liquidez",
    "Pagar as contas em dia",
    lc === null ? "atencao" : lc >= 1.2 ? "bom" : lc >= 1 ? "atencao" : "critico",
    lc === null
      ? "Sem dívidas de curto prazo registradas."
      : `Para cada R$ 1,00 que vence em até 12 meses, a empresa tem R$ ${lc.toFixed(2).replace(".", ",")} em caixa e a receber.`,
  );
  const eg = i.endividamento_geral;
  const plNeg = r.pl + r.resultado_exercicio < 0;
  pil(
    "endividamento",
    "Dívidas sob controle",
    plNeg ? "critico" : eg === null ? "bom" : eg <= 0.6 ? "bom" : eg <= 0.8 ? "atencao" : "critico",
    plNeg
      ? "As dívidas são maiores que tudo o que a empresa tem (patrimônio negativo)."
      : `${fmtIndice(eg, "%")} do que a empresa tem é financiado por terceiros (bancos, fornecedores, governo).`,
  );
  // resultado do próprio período (o mesmo que aparece na DRE do período)
  const ml = r.mes.receita_bruta > 0 ? r.mes.lucro_liquido / r.mes.receita_bruta : null;
  pil(
    "rentabilidade",
    "Dar lucro",
    ml === null ? "atencao" : ml >= 0.08 ? "bom" : ml >= 0 ? "atencao" : "critico",
    ml === null
      ? "Sem receita no período."
      : ml >= 0
        ? `De cada R$ 100 vendidos, sobram R$ ${cents(ml)} de lucro.`
        : `De cada R$ 100 vendidos, a empresa perde R$ ${cents(-ml)}.`,
  );
  pil(
    "caixa",
    "Gerar caixa",
    f.fco > 0 ? "bom" : f.fco > -Math.abs(r.mes.receita_bruta) * 0.05 ? "atencao" : "critico",
    f.fco >= 0 ? `A operação colocou ${reais(f.fco)} no caixa no período.` : `A operação consumiu ${reais(-f.fco)} do caixa no período.`,
  );
  const cf = i.ciclo_financeiro;
  pil(
    "ciclo",
    "Receber antes de pagar",
    cf == null ? "atencao" : cf <= 30 ? "bom" : cf <= 60 ? "atencao" : "critico",
    cf == null
      ? "Prazos não calculados neste período."
      : cf === 0
        ? "A empresa recebe dos clientes e paga os fornecedores em prazos equivalentes."
        : cf < 0
          ? `A empresa recebe dos clientes ${-cf} dias antes de pagar os fornecedores.`
          : `A empresa precisa bancar ${cf} dias entre pagar e receber.`,
  );
  let nota = Math.round(P.reduce((a, p) => a + p.nota, 0) / P.length);
  // um pilar crítico impede a classificação "Saudável"
  if (P.some((p) => p.status === "critico")) nota = Math.min(nota, 74);
  return { nota, faixa: nota >= 75 ? "Saudável" : nota >= 50 ? "Atenção" : "Crítica", pilares: P };
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
