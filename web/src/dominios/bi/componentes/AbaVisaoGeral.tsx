// Visão geral: os números principais do período (DRE e caixa) e o resultado × a geração de caixa mês a mês.
"use client";

import { useCallback } from "react";
import { brl } from "@/lib/formato/moeda";
import { useConsulta } from "@/lib/useConsulta";
import { EstadoVazio } from "@/components/ui/EstadoVazio";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { Icone } from "@/components/ui/Icone";
import { Indicador } from "@/components/ui/Indicador";
import { fmtVariacao, serie } from "../comparar";
import { lerRelatorio } from "../dados";
import { margem, temMovimento, totalDe } from "../relatorio";
import { GraficoBarras, GraficoCascata } from "./GraficoBarras";
import { acumulado, cascata } from "../graficos";
import { textoEliminacao } from "./contexto";
import type { ContextoBi } from "./contexto";

const pctReceita = (v: number | null) => (v === null ? undefined : `${fmtVariacao(v).replace("+", "")} da receita líquida`);

export function AbaVisaoGeral({ c }: { c: ContextoBi }) {
  const dados = useConsulta(
    useCallback(async () => {
      const [dre, dfc] = await Promise.all([
        lerRelatorio("dre", c.ids, c.de, c.ate, c.elimina),
        lerRelatorio("dfc", c.ids, c.de, c.ate, c.elimina),
      ]);
      return { dre, dfc };
    }, [c.ids, c.de, c.ate, c.elimina]),
  );
  if (dados.erro)
    return (
      <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
        {dados.erro}
      </p>
    );
  if (!dados.dados) return <Esqueleto />;
  const { dre, dfc } = dados.dados;
  if (!temMovimento(dre) && !temMovimento(dfc))
    return (
      <EstadoVazio icone="grafico" titulo="Nada lançado neste período">
        Não há notas, contas ou lançamentos das empresas escolhidas entre {c.rotuloPeriodo}. Troque o período.
      </EstadoVazio>
    );

  const resultado = totalDe(dre, "resultado_liquido");
  const caixaOp = totalDe(dfc, "fluxo_operacional");
  const variacao = totalDe(dfc, "variacao_caixa");
  const naoClass = Math.abs(totalDe(dre, "nao_classificado")) + Math.abs(totalDe(dfc, "nao_classificado"));
  const meses = [...new Set([...dre.meses, ...dfc.meses])].sort();

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--texto-suave)]">
        {c.quem} · {c.rotuloPeriodo}
        {textoEliminacao(c)}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Indicador titulo="Receita líquida" icone="seta-entrada" valor={brl(totalDe(dre, "receita_liquida"))} />
        <Indicador
          titulo="Lucro bruto"
          icone="grafico"
          valor={brl(totalDe(dre, "lucro_bruto"))}
          detalhe={pctReceita(margem(dre, "lucro_bruto"))}
          tom={totalDe(dre, "lucro_bruto") < 0 ? "vermelho" : "neutro"}
        />
        <Indicador
          titulo="Resultado líquido"
          icone="tendencia"
          valor={brl(resultado)}
          detalhe={pctReceita(margem(dre, "resultado_liquido"))}
          tom={resultado < 0 ? "vermelho" : "verde"}
        />
        <Indicador titulo="Caixa das operações" icone="moeda" valor={brl(caixaOp)} tom={caixaOp < 0 ? "vermelho" : "neutro"} />
        <Indicador titulo="Variação do caixa" icone="banco" valor={brl(variacao)} tom={variacao < 0 ? "vermelho" : "neutro"} />
      </div>

      {naoClass > 0.005 && (
        <p className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          <Icone nome="alerta" className="mt-0.5 h-4 w-4 shrink-0" />
          Há valores em &quot;Não classificado&quot; (categorias do Omie ainda sem conta no relatório). Os números ficam certos depois que a
          equipe MDC classificar as categorias.
        </p>
      )}

      <GraficoBarras
        titulo="Resultado (DRE) × geração de caixa (DFC), mês a mês"
        meses={meses}
        series={[
          { nome: "Resultado líquido", cor: "#0B2820", valores: serie(dre, "resultado_liquido", meses) },
          { nome: "Caixa das operações", cor: "#C9A24D", valores: serie(dfc, "fluxo_operacional", meses) },
        ]}
        linhas={[{ nome: "Resultado acumulado", cor: "#8A6A2A", valores: acumulado(serie(dre, "resultado_liquido", meses)) }]}
      />
      <GraficoCascata titulo="Da receita ao resultado (DRE do período)" degraus={cascata(dre)} />
      <GraficoBarras
        titulo="Receita líquida mês a mês"
        meses={meses}
        series={[{ nome: "Receita líquida", cor: "#2F6B4F", valores: serie(dre, "receita_liquida", meses) }]}
      />
      <p className="text-xs text-[var(--texto-suave)]">
        Resultado é pela data do fato (competência); caixa é pela data do pagamento. Lucro com caixa negativo costuma ser prazo de
        recebimento longo, estoque ou pagamento de dívida.
      </p>
    </div>
  );
}
