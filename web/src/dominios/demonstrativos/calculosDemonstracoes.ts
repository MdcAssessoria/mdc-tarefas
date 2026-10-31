// Demonstrações a partir do balancete: Balanço Patrimonial, DFC (método indireto),
// cruzamento DRE × DFC em linguagem simples e termômetro de saúde financeira.
// Convenção dos saldos: devedor = positivo, credor = negativo.
import { blocoDe } from "@/dominios/demonstrativos/balancete/classificacao";
import { sem } from "@/dominios/demonstrativos/balancete/leitura";
import type { BasePrazos, Indices } from "@/dominios/demonstrativos/balancete/indices";
import type { Dre, Resumo } from "@/dominios/demonstrativos/balancete/resumo";
import type { Linha } from "@/dominios/demonstrativos/balancete/tipos";
import { brl } from "@/lib/formato/moeda";
import { fmtIndice } from "@/lib/formato/numero";

/** Valores dos textos de análise em reais inteiros, sem centavos. */
const reais = (v: number | null | undefined) => brl(v, { centavos: false });

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

/** Período do balancete; sem cabeçalho, o mês da competência. */
export function periodoDe(competencia: string, inicio?: string | null, fim?: string | null): Periodo {
  const c = competencia.slice(0, 7);
  const ini = inicio ?? `${c}-01`;
  const ultimo = new Date(Date.UTC(Number(c.slice(0, 4)), Number(c.slice(5, 7)), 0)).getUTCDate();
  const f = fim ?? `${c}-${String(ultimo).padStart(2, "0")}`;
  const dias = Math.max(1, Math.round((Date.parse(f + "T12:00:00Z") - Date.parse(ini + "T12:00:00Z")) / 864e5) + 1);
  return { inicio: ini, fim: f, dias };
}

/** Bases dos prazos médios (saldos médios entre o início e o fim do período). */
export function basePrazos(linhas: Linha[], dias: number): BasePrazos {
  const an = linhas.filter((l) => l.analitica);
  const soma = (f: (l: Linha) => boolean, campo: "saldo_atual" | "saldo_anterior") => an.filter(f).reduce((a, l) => a + l[campo], 0);
  const media = (f: (l: Linha) => boolean, sinal = 1) => (sinal * (soma(f, "saldo_atual") + soma(f, "saldo_anterior"))) / 2;
  // estoque próprio: fora o de terceiros (industrialização/consignação), que tem contrapartida no passivo
  const deTerceiros = (d: string) => /CONSIGNA|REMESSA/.test(d) || (/DE TERCEIROS/.test(d) && !/EM PODER DE TERCEIROS/.test(d));
  const est = (l: Linha) => l.grupo === "ac_estoques" && !deTerceiros(sem(l.descricao));
  const acab = (l: Linha) => est(l) && /ACABADO|MERCADORIA|REVENDA/.test(sem(l.descricao));
  const temAcab = an.some((l) => acab(l) && (Math.abs(l.saldo_atual) > 1 || Math.abs(l.saldo_anterior) > 1));
  return {
    dias,
    clientes_medio: media((l) => l.grupo === "ac_clientes"),
    estoques_medio: media(est),
    acabados_medio: temAcab ? media(acab) : null,
    fornecedores_medio: media((l) => l.grupo === "pc_fornecedores", -1),
    compras_fornecedores: an.filter((l) => l.grupo === "pc_fornecedores").reduce((a, l) => a + Math.abs(l.creditos), 0),
    estoque_inicial: soma(est, "saldo_anterior"),
    estoque_final: soma(est, "saldo_atual"),
  };
}

// ---------------------------------------------------------------- balanço

export function balanco(linhas: Linha[], resumo: Resumo): Balanco {
  const topo = new Map<string, string>(); // raiz → bloco
  for (const l of linhas.filter((x) => x.nivel === 1)) {
    const d = sem(l.descricao);
    if (/COMPENSAC/.test(d)) continue;
    const b = blocoDe(d, l.classificacao);
    if (b !== "resultado") topo.set(l.classificacao, b);
  }
  const raiz = (c: string) => c.split(".")[0];
  const ativo: LinhaBp[] = [];
  const passivo: LinhaBp[] = [];
  for (const l of linhas) {
    const b = topo.get(raiz(l.classificacao));
    if (!b || l.nivel > 3) continue;
    if (/COMPENSAC/.test(sem(l.descricao))) continue;
    const s = b === "ativo" ? 1 : -1;
    const atual = r2(s * l.saldo_atual),
      anterior = r2(s * l.saldo_anterior);
    if (Math.abs(atual) < 0.5 && Math.abs(anterior) < 0.5) continue;
    (b === "ativo" ? ativo : passivo).push({ classificacao: l.classificacao, rotulo: l.descricao, nivel: l.nivel, atual, anterior });
  }
  // resultado do exercício ainda nas contas de resultado (não encerrado) entra no PL
  const resAnt = -r2(linhas.filter((l) => l.analitica && isResultado(l)).reduce((a, l) => a + l.saldo_anterior, 0));
  const resAt = resumo.ano.lucro_liquido;
  if (Math.abs(resAt) >= 0.5 || Math.abs(resAnt) >= 0.5)
    passivo.push({
      classificacao: "",
      rotulo: "Resultado do exercício em curso (lucro ou prejuízo ainda não encerrado)",
      nivel: 2,
      atual: resAt,
      anterior: resAnt,
    });
  const tot = (xs: LinhaBp[], extra = { atual: 0, anterior: 0 }) => ({
    atual: r2(xs.filter((x) => x.nivel === 1).reduce((a, x) => a + x.atual, 0) + extra.atual),
    anterior: r2(xs.filter((x) => x.nivel === 1).reduce((a, x) => a + x.anterior, 0) + extra.anterior),
  });
  return {
    ativo,
    passivo,
    total_ativo: tot(ativo),
    total_passivo: tot(passivo, { atual: resAt, anterior: resAnt }),
  };
}

const GRUPOS_RESULTADO = new Set([
  "receita_bruta",
  "deducoes",
  "custos",
  "despesas_operacionais",
  "receitas_financeiras",
  "despesas_financeiras",
  "outras_receitas",
  "outras_despesas",
  "ir_csll",
]);
const isResultado = (l: Linha) => !!l.grupo && GRUPOS_RESULTADO.has(l.grupo);

// ---------------------------------------------------------------- DFC (método indireto)

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

/** Linhas da DFC que o contador pode escolher para uma conta (além do caixa e do resultado). */
export const LINHAS_DFC: { id: string; nome: string }[] = [
  { id: "caixa", nome: "Caixa e equivalentes (não entra nos fluxos)" },
  { id: "resultado", nome: "Conta de resultado (vai no lucro do período)" },
  ...Object.entries(ROTULOS)
    .filter(([k]) => k !== "lucro")
    .map(([id, [sec, nome]]) => ({
      id,
      nome: `${sec === "operacional" ? "Operacional" : sec === "investimento" ? "Investimento" : "Financiamento"} · ${nome}`,
    })),
];

/** Linha automática da DFC para uma conta analítica, pelas regras do Hub. */
export function linhaDfcAuto(l: Linha): string {
  const d = sem(l.descricao);
  const socio = /SOCIO|MUTUO|PARTES RELACIONADAS|COLIGAD|CONTROLAD|EMPRESAS LIGADAS/.test(d);
  switch (l.grupo) {
    case "ac_disponivel":
      return "caixa";
    case "ac_clientes":
      return "clientes";
    case "ac_estoques":
      return "estoques";
    case "ac_outros":
      return socio ? "emprestimos_concedidos" : "outros_ativos";
    case "anc_rlp":
      return socio || /EMPRESTIMO/.test(d) ? "emprestimos_concedidos" : "outros_ativos";
    case "anc_permanente":
      return /DEPRECIAC|AMORTIZAC|EXAUST/.test(d) ? "depreciacao" : "imobilizado";
    case "pc_fornecedores":
      return "fornecedores";
    case "pc_obrigacoes":
      return "obrigacoes";
    case "pc_outros":
    case "pnc_outros":
      return socio ? "socios" : "outros_passivos";
    case "pc_emprestimos":
    case "pnc_emprestimos":
      return "emprestimos";
    case "pl":
      return /LUCRO|PREJUIZO|RESULTADO|DIVIDENDO|DISTRIBUI/.test(d) ? "lucros" : "capital";
    default:
      return isResultado(l) ? "resultado" : "lucros";
  }
}

export type MapaDfc = { classificacao: string; linha: string }[];

/** Linha da DFC de uma conta: escolha salva (prefixo mais longo, cliente antes do padrão) ou regra automática. */
export function linhaDfc(l: Linha, mapa: MapaDfc = []): string {
  let melhor: { classificacao: string; linha: string } | undefined;
  for (const m of mapa)
    if (
      (l.classificacao === m.classificacao || l.classificacao.startsWith(m.classificacao + ".")) &&
      (!melhor || m.classificacao.length >= melhor.classificacao.length)
    )
      melhor = m;
  return melhor?.linha ?? linhaDfcAuto(l);
}

export function dfc(linhas: Linha[], resumo: Resumo, mapa: MapaDfc = []): Dfc {
  const an = linhas.filter((l) => l.analitica);
  const acc = new Map<string, number>();
  const add = (k: string, v: number) => acc.set(k, (acc.get(k) ?? 0) + v);
  let caixaIni = 0,
    caixaFim = 0;
  const lucro = resumo.mes.lucro_liquido;
  let fluxoResultado = 0;
  for (const l of an) {
    const f = -(l.saldo_atual - l.saldo_anterior); // diminuição de ativo / aumento de passivo = entrada de caixa
    const k = linhaDfc(l, mapa);
    if (k === "caixa") {
      caixaIni += l.saldo_anterior;
      caixaFim += l.saldo_atual;
    } else if (k === "resultado") fluxoResultado += f;
    else add(k, f);
  }
  add("lucro", lucro);
  add("lucros", fluxoResultado - lucro); // encerramentos do resultado dentro do período
  const sec = (s: "operacional" | "investimento" | "financiamento") =>
    Object.entries(ROTULOS)
      .filter(([k, [x]]) => x === s && (k === "lucro" || Math.abs(acc.get(k) ?? 0) >= 0.5))
      .map(([k, [, rotulo]]) => ({ chave: k, rotulo, valor: r2(acc.get(k) ?? 0) }));
  const operacional = sec("operacional"),
    investimento = sec("investimento"),
    financiamento = sec("financiamento");
  const t = (xs: LinhaFluxo[]) => r2(xs.reduce((a, x) => a + x.valor, 0));
  const fco = t(operacional),
    fci = t(investimento),
    fcf = t(financiamento);
  const variacao = r2(caixaFim - caixaIni);
  return {
    operacional,
    investimento,
    financiamento,
    fco,
    fci,
    fcf,
    caixa_inicial: r2(caixaIni),
    caixa_final: r2(caixaFim),
    variacao,
    depreciacao: r2(acc.get("depreciacao") ?? 0),
    fechado: Math.abs(fco + fci + fcf - variacao) < 1,
  };
}

/** Soma DREs mensais (acumulado do ano a partir dos meses). */
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

/** Soma DFCs mensais (acumulado do ano). */
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

// ---------------------------------------------------------------- cruzamento DRE × DFC

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

// ---------------------------------------------------------------- termômetro

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

export function montar(linhas: Linha[], resumo: Resumo, indices: Indices, periodo: Periodo, mapaDfc: MapaDfc = []): Demonstracoes {
  const b = balanco(linhas, resumo);
  const f = dfc(linhas, resumo, mapaDfc);
  return { periodo, balanco: b, dfc: f, cruzamento: cruzar(resumo.mes, f), saude: saude(resumo, indices, f) };
}

/** Linhas da DRE em formato de demonstração. */
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
