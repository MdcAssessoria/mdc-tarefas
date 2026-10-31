// Conferências do balancete (fechamento, equação do balanço, competência, contas sem grupo) e fragilidades
// encontradas, com evidência, risco e recomendação.
// Convenção dos saldos: devedor = positivo, credor = negativo.
import { brl } from "@/lib/formato/moeda";
import { fmtIndice } from "@/lib/formato/numero";
import { fmtCompetencia } from "@/lib/formato/datas";
import type { Indices } from "./indices";
import { sem } from "./leitura";
import type { Resumo } from "./resumo";
import type { Linha } from "./tipos";

/** Valores dos textos de análise em reais inteiros, sem centavos. */
const reais = (v: number | null | undefined) => brl(v, { centavos: false });

export interface Conferencia {
  nome: string;
  ok: boolean;
  detalhe: string;
}
export interface Alerta {
  area: string;
  nivel: "alto" | "medio";
  texto: string;
  evidencia: string;
  recomendacao: string;
}

export function conferir(r: Resumo, linhas: Linha[], competencia: string | null): Conferencia[] {
  const dif = Math.abs(r.debitos - r.creditos);
  // com sinal (devedor +, credor −), a soma de todas as contas analíticas é zero quando ativo = passivo + PL + resultado
  const difBal = Math.abs(linhas.filter((l) => l.analitica).reduce((a, l) => a + l.saldo_atual, 0));
  const semGrupo = linhas.filter((l) => l.analitica && !l.grupo).length;
  return [
    { nome: "Balancete fechado (débitos = créditos)", ok: dif < 1, detalhe: dif < 1 ? "ok" : `diferença de ${reais(dif)}` },
    { nome: "Ativo = passivo + PL + resultado do ano", ok: difBal < 1, detalhe: difBal < 1 ? "ok" : `diferença de ${reais(difBal)}` },
    {
      nome: "Competência identificada",
      ok: !!competencia,
      detalhe: competencia ? fmtCompetencia(competencia) : "informe o mês",
    },
    { nome: "Todas as contas com grupo gerencial", ok: semGrupo === 0, detalhe: semGrupo ? `${semGrupo} conta(s) sem grupo` : "ok" },
  ];
}

export function fragilidades(r: Resumo, i: Indices, linhas: Linha[], anterior?: Resumo | null): Alerta[] {
  const out: Alerta[] = [];
  const an = linhas.filter((l) => l.analitica);
  const d = (l: Linha) => sem(l.descricao);

  if (i.liquidez_corrente !== null && i.liquidez_corrente < 1)
    out.push({
      area: "Liquidez e capital de giro",
      nivel: "alto",
      texto: "Liquidez corrente abaixo de 1",
      evidencia: `AC ${reais(r.ac)} × PC ${reais(r.pc)} (${fmtIndice(i.liquidez_corrente, "x")})`,
      recomendacao: "Rever prazos com fornecedores e bancos e avaliar alongar dívidas de curto prazo.",
    });
  if (i.capital_giro < 0)
    out.push({
      area: "Liquidez e capital de giro",
      nivel: "alto",
      texto: "Capital de giro negativo",
      evidencia: reais(i.capital_giro),
      recomendacao: "Planejar o caixa dos próximos meses e evitar novos compromissos de curto prazo.",
    });
  for (const l of an.filter((x) => x.grupo === "ac_disponivel" && x.saldo_atual < -1))
    out.push({
      area: "Caixa",
      nivel: "alto",
      texto: `Saldo credor em ${l.descricao}`,
      evidencia: `${l.classificacao} · ${reais(l.saldo_atual)}`,
      recomendacao: "Conferir a conciliação: caixa ou banco credor indica estouro ou lançamento faltando.",
    });
  for (const l of an.filter(
    (x) =>
      x.grupo === "ac_disponivel" &&
      /CAIXA/.test(d(x)) &&
      x.debitos === 0 &&
      x.creditos === 0 &&
      x.saldo_atual > Math.max(20000, r.ativo_total * 0.1),
  ))
    out.push({
      area: "Caixa",
      nivel: "medio",
      texto: "Caixa alto sem movimento no mês",
      evidencia: `${l.descricao} · ${reais(l.saldo_atual)}`,
      recomendacao: "Confirmar a existência do dinheiro; saldo de caixa parado pode ser saldo fictício.",
    });
  if (r.pl + r.resultado_exercicio < 0)
    out.push({
      area: "Patrimônio líquido",
      nivel: "alto",
      texto: "Patrimônio líquido negativo (passivo a descoberto)",
      evidencia: reais(r.pl + r.resultado_exercicio),
      recomendacao: "Avaliar aporte de capital ou conversão de mútuos em capital.",
    });
  if (r.ano.lucro_liquido < 0)
    out.push({
      area: "Resultado",
      nivel: "medio",
      texto: "Prejuízo acumulado no ano",
      evidencia: reais(r.ano.lucro_liquido),
      recomendacao: "Revisar preços, custos e as despesas que mais cresceram.",
    });
  const socios = an.filter(
    (x) => x.grupo !== "pl" && /SOCIO|MUTUO|ADIANTAMENTO A SOCIO|CONTA CORRENTE.*SOCIO/.test(d(x)) && x.saldo_atual > 0,
  );
  const totSocios = socios.reduce((a, x) => a + x.saldo_atual, 0);
  if (totSocios > Math.max(10000, r.ativo_total * 0.05))
    out.push({
      area: "Contas com sócios",
      nivel: "medio",
      texto: "Valores a receber de sócios elevados",
      evidencia: `${socios.length} conta(s) · ${reais(totSocios)}`,
      recomendacao: "Regularizar por distribuição de lucros ou devolução; mútuo com sócio tem efeito tributário (IOF).",
    });
  if (i.pmr !== null && i.pmr > 60)
    out.push({
      area: "Recebimento",
      nivel: "medio",
      texto: "Prazo médio de recebimento alto",
      evidencia: `${i.pmr} dias`,
      recomendacao: "Revisar a carteira de clientes vencidos e a política de crédito.",
    });
  if (i.ciclo_financeiro != null && i.ciclo_financeiro > 60 && (i.pmr ?? 0) > 0)
    out.push({
      area: "Capital de giro",
      nivel: "medio",
      texto: "Ciclo financeiro longo",
      evidencia: `${i.ciclo_financeiro} dias (PMR ${i.pmr ?? "—"}${i.pme != null ? `, PME ${i.pme}` : ""}, PMP ${i.pmp ?? "—"})`,
      recomendacao: "Encurtar o prazo de recebimento ou alongar o de pagamento reduz a necessidade de capital de giro.",
    });
  if (anterior && r.pc_obrigacoes > anterior.pc_obrigacoes * 1.15 && r.pc_obrigacoes - anterior.pc_obrigacoes > 5000)
    out.push({
      area: "Obrigações fiscais e trabalhistas",
      nivel: "alto",
      texto: "Tributos e encargos a recolher acumulando",
      evidencia: `${reais(anterior.pc_obrigacoes)} → ${reais(r.pc_obrigacoes)}`,
      recomendacao: "Verificar guias não pagas e parcelamentos em atraso antes que virem dívida ativa.",
    });
  const temFolha = an.some((x) => /SALARIO|ORDENADO|PRO.?LABORE/.test(d(x)) && x.grupo === "despesas_operacionais" && x.saldo_atual > 0);
  const temProvFerias = an.some((x) => /PROVIS.*(FERIAS|13)/.test(d(x)) && x.saldo_atual !== 0);
  if (temFolha && !temProvFerias)
    out.push({
      area: "Provisões",
      nivel: "medio",
      texto: "Sem provisão de férias e 13º",
      evidencia: "há despesa de salários, mas nenhuma conta de provisão com saldo",
      recomendacao: "Lançar as provisões mensais de férias, 13º e encargos.",
    });
  const temImob = r.permanente > 0;
  const temDepr = an.some((x) => /DEPRECIAC|AMORTIZAC/.test(d(x)) && (x.debitos > 0 || x.creditos > 0));
  if (temImob && !temDepr && r.permanente > 20000)
    out.push({
      area: "Provisões",
      nivel: "medio",
      texto: "Imobilizado sem depreciação no mês",
      evidencia: `imobilizado ${reais(r.permanente)}`,
      recomendacao: "Conferir o cálculo e o lançamento da depreciação.",
    });
  const transit = an.filter((x) => /A CLASSIFICAR|TRANSITORIA|A IDENTIFICAR|PENDENTE/.test(d(x)) && Math.abs(x.saldo_atual) > 100);
  if (transit.length)
    out.push({
      area: "Contas transitórias",
      nivel: "medio",
      texto: "Saldo em contas a classificar",
      evidencia: transit.map((x) => `${x.descricao} ${reais(x.saldo_atual)}`).join("; "),
      recomendacao: "Identificar e reclassificar os lançamentos pendentes.",
    });
  for (const l of an.filter((x) => x.grupo === "ac_estoques" && x.saldo_atual < -1))
    out.push({
      area: "Estoques",
      nivel: "alto",
      texto: `Estoque negativo em ${l.descricao}`,
      evidencia: reais(l.saldo_atual),
      recomendacao: "Conferir notas de entrada e baixas de estoque.",
    });
  if (anterior && anterior.estoques > 0 && r.estoques > anterior.estoques * 1.3 && r.mes.receita_bruta <= anterior.mes.receita_bruta)
    out.push({
      area: "Estoques",
      nivel: "medio",
      texto: "Estoque crescendo sem crescer as vendas",
      evidencia: `${reais(anterior.estoques)} → ${reais(r.estoques)}`,
      recomendacao: "Avaliar compras e itens parados.",
    });
  if (
    anterior &&
    r.pc_emprestimos + r.pnc_emprestimos > (anterior.pc_emprestimos + anterior.pnc_emprestimos) * 1.1 &&
    r.mes.receita_bruta <= anterior.mes.receita_bruta
  )
    out.push({
      area: "Endividamento",
      nivel: "medio",
      texto: "Empréstimos crescendo mais que a receita",
      evidencia: `${reais(anterior.pc_emprestimos + anterior.pnc_emprestimos)} → ${reais(r.pc_emprestimos + r.pnc_emprestimos)}`,
      recomendacao: "Rever a necessidade e o custo dos financiamentos.",
    });
  if (i.composicao_endividamento !== null && i.composicao_endividamento > 0.8 && r.pc_emprestimos > 0)
    out.push({
      area: "Endividamento",
      nivel: "medio",
      texto: "Dívida concentrada no curto prazo",
      evidencia: fmtIndice(i.composicao_endividamento, "%"),
      recomendacao: "Negociar alongamento dos empréstimos.",
    });
  if (anterior && anterior.ano.receita_liquida > 0 && r.ano.receita_liquida > 0) {
    const mAnt = anterior.ano.lucro_liquido / anterior.ano.receita_liquida;
    const mAt = r.ano.lucro_liquido / r.ano.receita_liquida;
    if (mAt < mAnt - 0.03)
      out.push({
        area: "Resultado",
        nivel: "medio",
        texto: "Margem líquida em queda",
        evidencia: `${fmtIndice(mAnt, "%")} → ${fmtIndice(mAt, "%")}`,
        recomendacao: "Identificar as despesas que cresceram acima da receita.",
      });
  }
  return out;
}
