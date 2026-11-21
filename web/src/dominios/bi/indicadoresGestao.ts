// BI de Gestão: indicadores principais da gestão, calculados da DRE, do fluxo de caixa e dos saldos dos bancos do mesmo
// período (sem consulta nova ao banco). Cada um com faixa (vermelho/amarelo/verde), régua e a conta de origem em texto,
// para quem não é da área. Premissas sinalizadas: sem depreciação no plano gerencial, o EBITDA é o resultado
// operacional; ponto de equilíbrio com pessoal e administrativas como fixos. Testado em indicadoresGestao.test.ts.
import type { NivelMargem } from "./margens";
import type { Matriz } from "./relatorio";
import { totalDe } from "./relatorio";

export interface IndicadorGestao {
  id: "ebitda" | "cobertura_juros" | "folga_equilibrio" | "folego_caixa" | "conversao_caixa";
  titulo: string;
  /** Valor na unidade do indicador (fração, vezes ou meses); null quando não dá para calcular. */
  valor: number | null;
  unidade: "pct" | "vezes" | "meses";
  nivel: NivelMargem | null;
  /** Limites: abaixo de `baixa` vermelho; até `boa` amarelo; acima verde (na unidade do indicador). */
  baixa: number;
  boa: number;
  /** Frase curta em linguagem simples, com o número em reais. */
  frase: string;
  /** Como foi calculado (vai no PDF e na dica). */
  conta: string;
  /** Premissa que o leitor precisa saber, quando houver. */
  premissa?: string;
}

const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const um = (v: number, casas = 1) => v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

export function nivel(v: number | null, baixa: number, boa: number): NivelMargem | null {
  if (v === null || !Number.isFinite(v)) return null;
  return v < baixa ? "baixa" : v <= boa ? "media" : "boa";
}

export function fmtIndicador(i: IndicadorGestao): string {
  if (i.valor === null || !Number.isFinite(i.valor)) return "–";
  if (i.unidade === "pct") return pct(i.valor);
  if (i.unidade === "vezes") return `${um(i.valor)}×`;
  return `${um(i.valor)} ${Math.abs(i.valor) >= 1 && Math.abs(i.valor) < 2 ? "mês" : "meses"}`;
}

/** Linhas de saída operacional do fluxo (pagamentos). */
const SAIDAS = ["pag_fornecedores", "pag_pessoal", "pag_impostos", "pag_despesas"];

/**
 * Calcula os indicadores. `saldoFinal` = saldo dos bancos no fim do período (null sem saldos); `meses` = meses do
 * período já decorridos (para as médias mensais).
 */
export function indicadoresGestao(dre: Matriz, dfc: Matriz, saldoFinal: number | null, meses: number): IndicadorGestao[] {
  const receita = totalDe(dre, "receita_liquida");
  const operacional = totalDe(dre, "resultado_operacional");
  const juros = -totalDe(dre, "despesas_financeiras");
  const custos = -totalDe(dre, "custos");
  const comerciais = -totalDe(dre, "despesas_comerciais");
  const fixos = -(totalDe(dre, "despesas_pessoal") + totalDe(dre, "despesas_administrativas"));
  const caixaOperacional = totalDe(dfc, "fluxo_operacional");
  const saidasMes = meses > 0 ? -SAIDAS.reduce((a, c) => a + totalDe(dfc, c), 0) / meses : 0;
  const m = Math.max(meses, 1);

  const margemEbitda = receita ? operacional / receita : null;
  const cobertura = juros > 0 ? operacional / juros : null;
  const mc = receita ? (receita - custos - comerciais) / receita : null;
  const equilibrioMes = mc && mc > 0 ? fixos / m / mc : null;
  const receitaMes = receita / m;
  const folga = equilibrioMes ? receitaMes / equilibrioMes - 1 : null;
  const folego = saldoFinal !== null && saidasMes > 0 ? saldoFinal / saidasMes : null;
  const conversao = operacional > 0 ? caixaOperacional / operacional : null;

  const montar = (i: Omit<IndicadorGestao, "nivel">): IndicadorGestao => ({ ...i, nivel: nivel(i.valor, i.baixa, i.boa) });
  return [
    montar({
      id: "ebitda",
      titulo: "Margem EBITDA",
      valor: margemEbitda,
      unidade: "pct",
      baixa: 0.05,
      boa: 0.12,
      frase: `A operação gerou ${reais(operacional)} antes de juros e IR (${reais(operacional / m)} por mês).`,
      conta: "Resultado operacional ÷ receita líquida",
      premissa: "O plano gerencial não tem depreciação: o EBITDA é o resultado operacional.",
    }),
    montar({
      id: "cobertura_juros",
      titulo: "Cobertura de juros",
      valor: cobertura,
      unidade: "vezes",
      baixa: 1.5,
      boa: 3,
      frase:
        cobertura === null
          ? "Sem juros no período."
          : `A operação paga ${um(cobertura)} vezes os juros e tarifas do período (${reais(juros)}).`,
      conta: "Resultado operacional ÷ despesas financeiras",
    }),
    montar({
      id: "folga_equilibrio",
      titulo: "Folga sobre o ponto de equilíbrio",
      valor: folga,
      unidade: "pct",
      baixa: 0,
      boa: 0.2,
      frase:
        equilibrioMes === null
          ? "Sem margem de contribuição positiva: não há ponto de equilíbrio."
          : `Precisa vender ${reais(equilibrioMes)} por mês para empatar; vendeu ${reais(receitaMes)} em média.`,
      conta: "Ponto de equilíbrio = (pessoal + administrativas) ÷ margem de contribuição; folga = receita média ÷ equilíbrio − 1",
      premissa: "Pessoal e administrativas tratados como custo fixo; custos e despesas comerciais como variáveis.",
    }),
    montar({
      id: "folego_caixa",
      titulo: "Fôlego de caixa",
      valor: folego,
      unidade: "meses",
      baixa: 1,
      boa: 3,
      frase:
        folego === null
          ? "Os saldos dos bancos do último mês ainda não chegaram do Omie."
          : `Com ${reais(saldoFinal ?? 0)} nos bancos, paga ${um(Math.max(folego, 0))} meses das saídas da operação (${reais(saidasMes)}/mês).`,
      conta: "Saldo dos bancos no fim ÷ média mensal de pagamentos da operação",
    }),
    montar({
      id: "conversao_caixa",
      titulo: "Conversão em caixa",
      valor: conversao,
      unidade: "pct",
      baixa: 0.5,
      boa: 0.9,
      frase:
        conversao === null
          ? "Sem resultado operacional positivo no período."
          : `De cada R$ 100 de resultado operacional, ${reais(Math.max(conversao, -9.99) * 100)} viraram caixa (${reais(caixaOperacional)}).`,
      conta: "Caixa das operações (fluxo) ÷ resultado operacional (DRE)",
    }),
  ];
}

/** Régua genérica: 0 até o dobro do limite bom (ou um pouco acima do valor); negativo no começo. */
export function reguaIndicador(i: IndicadorGestao): { fimBaixa: number; fimMedia: number; marca: number } {
  const v = i.valor ?? 0;
  const topo = Math.max(i.boa * 2, v * 1.1, 0.01);
  const pos = (x: number) => Math.min(100, Math.max(0, (x / topo) * 100));
  return { fimBaixa: pos(i.baixa), fimMedia: pos(i.boa), marca: pos(v) };
}
