// BI de Gestão: rascunho do parecer gerencial (mesmo formato do parecer do balancete, dominios/demonstrativos/parecer.ts):
// seções técnicas com fundamento, cada uma seguida de "Em linguagem simples". Usa só os números já calculados no BI
// (DRE, fluxo de caixa, resultado × caixa, saldos dos bancos, indicadores). Trechos [Revisar…] pedem o julgamento do
// contador antes de assinar. Testado em parecer.test.ts.
import type { Conciliacao } from "./conciliacao";
import { fraseDoAlerta } from "./conciliacao";
import type { ContaBanco } from "./detalhe";
import type { Indicadores } from "./indicadores";
import { cicloFinanceiro, inadimplencia } from "./indicadores";
import type { IndicadorGestao } from "./indicadoresGestao";
import { fmtIndicador } from "./indicadoresGestao";
import { calcularMargens, fmtMargem, NOME_DO_NIVEL } from "./margens";
import type { Matriz } from "./relatorio";
import { totalDe } from "./relatorio";
import { LINHA_EMPRESA } from "@/lib/identidade";
import type { ResumoSaldos } from "./saldos";

const reais = (v: number) =>
  (Math.round(v) === 0 ? 0 : v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const dias = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const pct = (v: number | null) =>
  v === null || !Number.isFinite(v) ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const variacao = (a: number, b: number | null) =>
  b
    ? ` (${a >= b ? "+" : "−"}${Math.abs(((a - b) / Math.abs(b)) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% sobre o período anterior)`
    : "";

export interface EntradaParecerBi {
  quem: string;
  /** "01/01/2026 a 30/11/2026" */
  periodo: string;
  elimina: boolean;
  dre: Matriz;
  dfc: Matriz;
  /** DRE do período anterior de mesmo tamanho (para a variação); null sem dados. */
  dreAnterior: Matriz | null;
  /** Contas do plano da DRE (bi_relatorio_contas) para os maiores gastos. */
  contasDre: ContaBanco[];
  conc: Conciliacao;
  saldos: ResumoSaldos | null;
  ind: Indicadores;
  gestao: IndicadorGestao[];
  /** Meses do período ainda sem extrato do banco (fluxo pelas baixas de títulos). */
  mesesSemExtrato: number;
  contador: string;
  crc: string;
}

/** Os maiores gastos do período por conta do plano (valores positivos, do maior para o menor). */
export function maioresGastos(contas: ContaBanco[], n = 5): { nome: string; valor: number }[] {
  const soma = new Map<string, { nome: string; valor: number }>();
  for (const c of contas) {
    if (!["custos", "despesas_pessoal", "despesas_administrativas", "despesas_comerciais", "despesas_financeiras"].includes(c.linha))
      continue;
    const k = c.conta ?? c.nome;
    const a = soma.get(k) ?? { nome: c.conta ? `${c.conta} ${c.nome}` : c.nome, valor: 0 };
    a.valor -= Number(c.valor);
    soma.set(k, a);
  }
  return [...soma.values()]
    .filter((x) => x.valor > 0.5)
    .sort((a, b) => b.valor - a.valor)
    .slice(0, n);
}

export function rascunhoParecerBi(e: EntradaParecerBi): string {
  const L: string[] = [];
  const simples = (t: string) => L.push(`> **Em linguagem simples:** ${t}`, "");
  const d = (c: string) => totalDe(e.dre, c);
  const f = (c: string) => totalDe(e.dfc, c);
  const receitaBruta = d("receita_bruta");
  const receitaLiq = d("receita_liquida");
  const resultado = d("resultado_liquido");
  const nc = d("nao_classificado");
  const margens = calcularMargens(e.dre);
  const g = Object.fromEntries(e.gestao.map((x) => [x.id, x]));
  const lucroTxt = resultado >= 0 ? `lucro de ${reais(resultado)}` : `prejuízo de ${reais(-resultado)}`;
  const alertas = e.conc.linhas.filter((l) => l.nivel !== "ok").sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca));
  const inad = inadimplencia(e.ind);
  const ciclo = cicloFinanceiro(e.ind);

  L.push(`# Parecer gerencial — ${e.periodo}`);
  L.push(`**${e.quem}**${e.elimina ? " · consolidado, sem as operações entre as empresas do grupo" : ""}`);
  L.push("");

  L.push("## 1. Objeto, base e alcance");
  L.push(
    `Este parecer analisa o desempenho e o caixa de ${e.quem} no período de ${e.periodo}, a partir dos registros do sistema de gestão da empresa (Omie): ` +
      "notas fiscais, contas a pagar e a receber e extratos das contas correntes, organizados no plano de contas gerencial da MDC.",
  );
  L.push(
    "Referências: regime de competência na DRE (NBC TG 00 – Estrutura Conceitual; Lei nº 6.404/1976, art. 177); fluxo de caixa pelo método direto, com a conciliação do resultado com o caixa das operações " +
      "(NBC TG 03 – Demonstração dos Fluxos de Caixa); EBITDA (LAJIDA) como medida não contábil, nos termos da Resolução CVM nº 156/2022, usada aqui como referência gerencial.",
  );
  L.push(
    "Alcance: análise gerencial, não contábil. Não substitui as demonstrações da escrituração contábil nem constitui auditoria (NBC TA) ou revisão (NBC TR 2400). " +
      "A fidedignidade dos lançamentos no sistema de gestão é de responsabilidade da administração da empresa.",
  );
  simples(
    "este documento lê os números do sistema da empresa e explica se ela ganhou dinheiro, se o dinheiro entrou no banco e onde estão os riscos. É uma leitura da MDC, não uma auditoria.",
  );

  L.push("## 2. Síntese");
  L.push(
    `A receita bruta foi de ${reais(receitaBruta)}${variacao(receitaBruta, e.dreAnterior ? totalDe(e.dreAnterior, "receita_bruta") : null)}, com ${lucroTxt}` +
      (margens ? ` e margem líquida de ${fmtMargem(margens[2].valor)}` : "") +
      `. O caixa das operações foi de ${reais(f("fluxo_operacional"))} e a variação total do caixa, de ${reais(f("variacao_caixa"))}.` +
      (e.saldos ? ` Os bancos fecharam o período com ${reais(e.saldos.final)}.` : ""),
  );
  L.push("");
  for (const x of e.gestao)
    L.push(
      x.valor === null || !Number.isFinite(x.valor)
        ? `- **${x.titulo}:** ${x.frase}`
        : `- **${x.titulo}: ${fmtIndicador(x)}**${x.nivel ? ` (${NOME_DO_NIVEL[x.nivel].toLowerCase()})` : ""} — ${x.frase}`,
    );
  L.push("");
  simples(
    `${resultado >= 0 ? "a empresa deu lucro" : "a empresa teve prejuízo"} no período` +
      (e.saldos
        ? ` e ${e.saldos.final >= 0 ? "terminou com dinheiro nos bancos" : "terminou com os bancos no negativo (cheque especial ou conta garantida)"}`
        : "") +
      ".",
  );

  L.push("## 3. Desempenho (DRE gerencial)");
  L.push(
    `Da receita bruta de ${reais(receitaBruta)}, ${reais(-(d("deducoes") + d("devolucoes")))} foram impostos sobre a venda e devoluções, resultando em receita líquida de ${reais(receitaLiq)}. ` +
      `Os custos somaram ${reais(-d("custos"))}` +
      (margens ? ` (margem bruta de ${fmtMargem(margens[0].valor)})` : "") +
      `; pessoal, ${reais(-d("despesas_pessoal"))}; administrativas, ${reais(-d("despesas_administrativas"))}; comerciais, ${reais(-d("despesas_comerciais"))}. ` +
      `O resultado operacional foi de ${reais(d("resultado_operacional"))}` +
      (margens ? ` (margem de ${fmtMargem(margens[1].valor)})` : "") +
      `, e as despesas financeiras líquidas, de ${reais(-(d("despesas_financeiras") + d("receitas_financeiras")))}.`,
  );
  const gastos = maioresGastos(e.contasDre);
  if (gastos.length) L.push("", `Maiores gastos: ${gastos.map((x) => `${x.nome} (${reais(x.valor)})`).join("; ")}.`);
  if (Math.abs(nc) >= 1)
    L.push(
      "",
      `**Atenção:** ${reais(Math.abs(nc))} estão em "Não classificado" (categorias do Omie sem conta do plano); os números acima podem mudar depois da classificação.`,
    );
  L.push("");
  simples(
    receitaBruta > 0
      ? `de cada R$ 100 vendidos, R$ ${Math.round((-d("custos") / receitaBruta) * 100)} foram para custos, R$ ${Math.round((-(d("despesas_pessoal") + d("despesas_administrativas") + d("despesas_comerciais")) / receitaBruta) * 100)} para as despesas e ` +
          `${resultado >= 0 ? `sobraram R$ ${Math.round((resultado / receitaBruta) * 100)} de lucro` : `faltaram R$ ${Math.round((-resultado / receitaBruta) * 100)}`}.`
      : "não houve receita no período.",
  );

  L.push("## 4. Caixa e confronto com o resultado");
  L.push(
    `Pelo fluxo de caixa, as operações ${f("fluxo_operacional") >= 0 ? "geraram" : "consumiram"} ${reais(Math.abs(f("fluxo_operacional")))}; investimentos, ${reais(f("investimentos"))}; ` +
      `financiamentos e parcelamentos, ${reais(f("financiamentos"))}; sócios, ${reais(f("socios"))}. ` +
      `Pela conciliação exigida para o método direto (NBC TG 03), o resultado de ${reais(e.conc.resultado)} se transforma em ${reais(e.conc.caixaOperacional)} de caixa das operações, e os movimentos só de caixa somam ${reais(e.conc.soCaixa)}.`,
  );
  if (alertas.length) {
    L.push("", "Variações relevantes entre o resultado e o caixa (a partir de 10% e acima de R$ 5 mil):");
    for (const a of alertas) L.push(`- ${fraseDoAlerta(a, reais)}`);
  } else L.push("", "Não há variação relevante entre o resultado e o caixa por grupo de contas.");
  if (e.saldos) {
    L.push(
      "",
      `Saldos dos bancos: ${reais(e.saldos.inicial)} no início e ${reais(e.saldos.final)} no fim (${reais(e.saldos.variacaoBanco)}).` +
        (e.saldos.diferenca !== null && Math.abs(e.saldos.diferenca) >= 1
          ? ` A diferença de ${reais(e.saldos.diferenca)} para a variação do fluxo corresponde a movimentos do banco sem lançamento identificado${e.elimina ? " e a operações entre as empresas do grupo identificadas só de um lado" : ""}.`
          : " O fluxo fecha com a variação dos bancos."),
    );
  }
  if (e.mesesSemExtrato > 0)
    L.push(
      "",
      `[Revisar: ${e.mesesSemExtrato} mês(es) do período ainda sem o extrato do banco; neles o fluxo vem das baixas dos títulos e pode não fechar com o banco.]`,
    );
  L.push("");
  simples(
    "a DRE mostra se a empresa ganhou ou perdeu; o fluxo de caixa mostra se o dinheiro entrou no banco. Lucro sem caixa costuma ser venda a prazo ainda não recebida, estoque ou dívida paga.",
  );

  L.push("## 5. Prazos, contas em aberto e inadimplência");
  L.push(
    `Prazo médio de recebimento de ${dias(e.ind.pmr)} dias e de pagamento de ${dias(e.ind.pmp)} dias (ciclo financeiro sem estoque de ${dias(ciclo)} dias). ` +
      `Em aberto: ${reais(Number(e.ind.receber.aberto ?? 0))} a receber (vencido ${reais(Number(e.ind.receber.vencido ?? 0))}, inadimplência de ${pct(inad)}) ` +
      `e ${reais(Number(e.ind.pagar.aberto ?? 0))} a pagar (vencido ${reais(Number(e.ind.pagar.vencido ?? 0))}).`,
  );
  L.push("");
  simples(
    ciclo === null
      ? "não foi possível calcular os prazos neste período."
      : ciclo <= 0
        ? "a empresa recebe dos clientes antes de pagar os fornecedores, o que ajuda o caixa."
        : `entre pagar os fornecedores e receber dos clientes passam cerca de ${dias(ciclo)} dias; nesse intervalo a empresa usa dinheiro próprio ou de banco.`,
  );

  L.push("## 6. Pontos de atenção e recomendações");
  const pontos: string[] = [];
  if (g.cobertura_juros?.nivel === "baixa")
    pontos.push(
      `Cobertura de juros de ${fmtIndicador(g.cobertura_juros)}: o resultado da operação mal cobre o custo financeiro. Recomenda-se renegociar taxas e prazos e reduzir o uso de antecipação de recebíveis.`,
    );
  if (g.folego_caixa?.nivel === "baixa")
    pontos.push(
      `Fôlego de caixa de ${fmtIndicador(g.folego_caixa)}: o saldo dos bancos não cobre um mês de saídas da operação. Recomenda-se projeção de caixa semanal e priorização de pagamentos.`,
    );
  if (g.folga_equilibrio?.nivel === "baixa")
    pontos.push(
      "A receita está abaixo do ponto de equilíbrio: o volume de vendas não paga a estrutura fixa. Recomenda-se rever preços, mix e despesas fixas.",
    );
  if ((inad ?? 0) > 0.1)
    pontos.push(`Inadimplência de ${pct(inad)} do a receber: recomenda-se régua de cobrança e revisão de crédito dos maiores devedores.`);
  if (Math.abs(nc) >= 1)
    pontos.push(
      `${reais(Math.abs(nc))} sem classificação no plano: a equipe MDC deve classificar as categorias na aba Classificação antes de usar os números para decisão.`,
    );
  for (const a of alertas.filter((x) => x.nivel === "alerta").slice(0, 3))
    pontos.push(`Resultado × caixa — ${a.nome}: ${a.explica}; conferir.`);
  if (!pontos.length) pontos.push("As verificações aplicadas não apontaram riscos relevantes no período.");
  pontos.forEach((p, k) => L.push(`${k + 1}. ${p}`));
  L.push("- [Revisar: contexto da empresa (sazonalidade, contratos novos, renegociações) que explique os números.]");
  L.push("");

  L.push("## 7. Premissas");
  for (const x of e.gestao) if (x.premissa) L.push(`- ${x.titulo}: ${x.premissa}`);
  L.push("- Faixas de referência dos indicadores definidas pela MDC para pequenas e médias empresas; não são normas.");
  L.push("- Receita e impostos sobre a venda pelas notas fiscais autorizadas; custos e despesas pelos títulos, na data de emissão.");
  L.push("");

  L.push("## 8. Responsabilidade técnica");
  L.push(`${e.contador || "[Revisar: nome do contador]"} — Contador, CRC ${e.crc || "[Revisar: CRC]"}`);
  L.push(LINHA_EMPRESA);
  L.push("");
  L.push(
    "_Parecer gerencial emitido com base nos registros do sistema de gestão da empresa e nas informações fornecidas pela administração, observado o Código de Ética Profissional do Contador (NBC PG 01)._",
  );
  return L.join("\n");
}
