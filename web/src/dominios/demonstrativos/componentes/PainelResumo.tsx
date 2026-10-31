// Painel principal de um balancete para leigos: termômetro de saúde, indicadores, composição da receita,
// cascatas da DRE e do caixa, evolução, ciclo do dinheiro, balanço em uma imagem e maiores despesas.
"use client";

import { useMemo } from "react";
import { Barras, Cascata, CicloCaixa, ColunasPareadas, Composicao, Evolucao, Faisca, Pilha100, STATUS_SAUDE, Termometro } from "./Graficos";
import { COR, PAL_ATIVO, PAL_PASSIVO, PAL_RECEITA } from "./paletas";
import { SeletorPeriodo, useSeletorPeriodo } from "./SeletorPeriodo";
import { TIPOS_PERIODO, agregar, serieAgrupada } from "@/dominios/demonstrativos/periodos";
import type { TipoPeriodo } from "@/dominios/demonstrativos/periodos";
import { brl } from "@/lib/formato/moeda";
import { fmtIndice } from "@/lib/formato/numero";
import { fmtData, mesExtenso } from "@/lib/formato/datas";
import type { BalanceteReg } from "@/dominios/demonstrativos/tipos";

function Kpi({
  rotulo,
  valor,
  sub,
  negativo,
  serie,
  dica,
}: {
  rotulo: string;
  valor: string;
  sub?: string;
  negativo?: boolean;
  serie?: (number | null)[];
  dica?: string;
}) {
  return (
    <div className="cartao p-4" title={dica}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs text-neutral-500">{rotulo}</div>
        {serie && <Faisca valores={serie} alerta={negativo} />}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${negativo ? "text-[var(--perigo)]" : "text-[var(--marca)]"}`}>{valor}</div>
      {sub && <div className="mt-0.5 text-xs text-neutral-500">{sub}</div>}
      {dica && <div className="mt-1 text-[11px] leading-snug text-neutral-500">{dica}</div>}
    </div>
  );
}

/** Painel principal para leigo: termômetro, KPIs, composição da receita, cascatas da DRE e do caixa, evolução, ciclo e balanço. */
export function PainelResumo({ atual, historico }: { atual: BalanceteReg; historico: BalanceteReg[] }) {
  const demo = atual.demonstracoes ?? null;
  const multi = (demo?.periodo.dias ?? 31) > 31;
  const [tipo, setTipo] = useSeletorPeriodo();
  const t: TipoPeriodo = multi ? "mensal" : tipo;
  const ag = useMemo(() => agregar(atual, historico, t), [atual, historico, t]);
  const resumo = ag.resumo;
  const indices = ag.indices;
  const dre = ag.dre;
  const dfc = ag.dfc;
  const saudeP = ag.saude;
  const comentarios = ag.cruzamento?.comentarios ?? demo?.cruzamento.comentarios ?? [];
  const grupos = useMemo(() => serieAgrupada(historico, t, atual.competencia), [historico, t, atual.competencia]);
  const mesmoPeriodoAnoAnterior = useMemo(() => {
    const c = `${Number(atual.competencia.slice(0, 4)) - 1}${atual.competencia.slice(4)}`;
    const reg = historico.find((b) => b.competencia === c);
    return reg ? agregar(reg, historico, t) : null;
  }, [historico, atual.competencia, t]);
  const anteriorGrupo = grupos.length > 1 ? grupos[grupos.length - 2] : null;
  const variacao = (a: number, b?: number | null) =>
    b
      ? `${a >= b ? "▲" : "▼"} ${Math.abs(((a - b) / Math.abs(b)) * 100)
          .toFixed(1)
          .replace(".", ",")}% sobre ${anteriorGrupo?.rotulo ?? ""}`
      : undefined;
  const serie = (fn: (g: (typeof grupos)[number]) => number | null | undefined) =>
    grupos.length > 1 ? grupos.map((g) => fn(g) ?? null) : undefined;
  const rotuloPeriodo = multi ? "período do balancete" : t === "mensal" ? "mês" : ag.rotulo;
  const fin = dre.despesas_financeiras - dre.receitas_financeiras - dre.outras;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[var(--marca)]">
          Como está a empresa ·{" "}
          {multi && demo
            ? `${fmtData(demo.periodo.inicio)} a ${fmtData(demo.periodo.fim)}`
            : t === "mensal"
              ? mesExtenso(atual.competencia)
              : ag.rotulo}
        </h2>
        {!multi && <SeletorPeriodo tipo={tipo} aoMudar={setTipo} />}
      </div>
      {!multi && t !== "mensal" && (!ag.completo || ag.parcial) && (
        <p className="-mt-3 text-xs text-amber-800">
          {!ag.completo ? `Faltam meses deste período no Hub: somados ${ag.meses.length} mês(es). ` : ""}
          {ag.parcial ? "Período ainda em andamento: os números vão até o mês selecionado." : ""}
        </p>
      )}

      {saudeP && (
        <section className="cartao grid gap-4 p-4 lg:grid-cols-[260px_1fr]">
          <div className="text-center">
            <h3 className="font-semibold">Termômetro de saúde financeira</h3>
            <Termometro nota={saudeP.nota} faixa={saudeP.faixa} />
            <div
              className="text-sm font-semibold"
              style={{
                color: saudeP.nota >= 75 ? STATUS_SAUDE.bom.cor : saudeP.nota >= 50 ? STATUS_SAUDE.atencao.cor : STATUS_SAUDE.critico.cor,
              }}
            >
              {saudeP.faixa}
            </div>
            <p className="mt-1 text-[11px] text-neutral-500">Média de cinco pilares, avaliados pela MDC a cada fechamento.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {saudeP.pilares.map((p) => {
              const st = STATUS_SAUDE[p.status];
              return (
                <div key={p.id} className="rounded-lg border p-3" style={{ background: st.fundo, borderColor: st.cor + "33" }}>
                  <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: st.cor }}>
                    <span
                      className="flex h-5 w-5 items-center justify-center rounded-full text-xs text-white"
                      style={{ background: st.cor }}
                      aria-hidden
                    >
                      {st.icone}
                    </span>
                    {p.nome} <span className="ml-auto text-[11px] font-medium">{st.rotulo}</span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-700">{p.frase}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          rotulo={`Receita bruta (${t === "mensal" ? "mês" : TIPOS_PERIODO.find((x) => x.id === t)!.nome.toLowerCase()})`}
          valor={brl(dre.receita_bruta, { centavos: false })}
          serie={serie((g) => g.dre.receita_bruta)}
          sub={!multi ? variacao(dre.receita_bruta, anteriorGrupo?.dre.receita_bruta) : undefined}
        />
        <Kpi
          rotulo={dre.lucro_liquido >= 0 ? "Lucro líquido" : "Prejuízo"}
          valor={brl(dre.lucro_liquido, { centavos: false })}
          negativo={dre.lucro_liquido < 0}
          serie={serie((g) => g.dre.lucro_liquido)}
          sub={dre.receita_liquida ? `margem de ${fmtIndice(dre.lucro_liquido / dre.receita_liquida, "%")}` : undefined}
        />
        <Kpi
          rotulo="Dinheiro em caixa, bancos e aplicações"
          valor={brl(resumo.disponivel, { centavos: false })}
          negativo={resumo.disponivel < 0}
          serie={serie((g) => g.disponivel)}
          sub={
            dfc ? `${dfc.variacao >= 0 ? "▲ entrou" : "▼ saiu"} ${brl(Math.abs(dfc.variacao), { centavos: false })} no período` : undefined
          }
        />
        <Kpi
          rotulo="Caixa gerado pela operação"
          valor={dfc ? brl(dfc.fco, { centavos: false }) : "—"}
          negativo={!!dfc && dfc.fco < 0}
          serie={serie((g) => g.fco)}
          sub={
            dfc && dre.lucro_liquido > 0
              ? `${fmtIndice(dfc.fco / dre.lucro_liquido, "%")} do lucro virou caixa`
              : "dinheiro que a atividade principal colocou (ou tirou) do caixa"
          }
        />
      </div>

      {atual.comentario && (
        <div className="cartao border-l-4 !border-l-[var(--destaque)] p-4">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            O que aconteceu na sua empresa em {mesExtenso(atual.competencia)}
          </div>
          <p className="whitespace-pre-wrap text-sm">{atual.comentario}</p>
        </div>
      )}

      {dre.receita_bruta > 0 && (
        <section className="cartao p-4">
          <h3 className="font-semibold">Para onde foi cada R$ 100 vendidos ({rotuloPeriodo})</h3>
          <p className="mb-3 text-xs text-neutral-500">Toda a receita bruta dividida entre impostos, custos, despesas e o que sobrou.</p>
          <Pilha100
            partes={[
              { rotulo: "Impostos (venda + IR/CSLL)", valor: dre.deducoes + dre.ir_csll, cor: PAL_RECEITA.impostos },
              { rotulo: "Custos", valor: dre.custos, cor: PAL_RECEITA.custos },
              { rotulo: "Despesas operacionais", valor: dre.despesas_operacionais, cor: PAL_RECEITA.despesas },
              { rotulo: "Juros e outras despesas líquidas", valor: Math.max(0, fin), cor: PAL_RECEITA.financeiro },
              { rotulo: "Lucro", valor: Math.max(0, dre.lucro_liquido), cor: PAL_RECEITA.lucro },
            ]}
          />
          {dre.lucro_liquido < 0 && (
            <p className="mt-2 text-xs font-medium text-[var(--perigo)]">
              Os gastos superaram a receita em {brl(-dre.lucro_liquido, { centavos: false })}: faltaram R${" "}
              {((-dre.lucro_liquido / dre.receita_bruta) * 100).toFixed(1).replace(".", ",")} para cada R$ 100 vendidos.
            </p>
          )}
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="cartao p-4">
          <h3 className="font-semibold">Da receita ao lucro ({rotuloPeriodo})</h3>
          <p className="mb-2 text-xs text-neutral-500">Verde soma, dourado subtrai, azul é o total.</p>
          <Cascata
            passos={[
              { rotulo: "Receita bruta", valor: dre.receita_bruta, total: true },
              { rotulo: "Deduções e impostos", valor: -dre.deducoes },
              { rotulo: "Custos", valor: -dre.custos },
              { rotulo: "Despesas operacionais", valor: -dre.despesas_operacionais },
              { rotulo: "Resultado financeiro e outros", valor: dre.receitas_financeiras - dre.despesas_financeiras + dre.outras },
              { rotulo: "IRPJ e CSLL", valor: -dre.ir_csll },
              { rotulo: "Lucro líquido", valor: dre.lucro_liquido, total: true },
            ]}
          />
        </section>
        <section className="cartao p-4">
          <h3 className="font-semibold">Do caixa inicial ao final ({rotuloPeriodo})</h3>
          <p className="mb-2 text-xs text-neutral-500">De onde veio e para onde foi o dinheiro.</p>
          {dfc ? (
            <Cascata
              passos={[
                { rotulo: "Caixa inicial", valor: dfc.caixa_inicial, total: true },
                { rotulo: "Operação do negócio", valor: dfc.fco },
                { rotulo: "Investimentos em bens", valor: dfc.fci },
                { rotulo: "Bancos e sócios", valor: dfc.fcf },
                { rotulo: "Caixa final", valor: dfc.caixa_final, total: true },
              ]}
            />
          ) : (
            <p className="py-10 text-center text-sm text-neutral-500">Reprocesse o balancete para gerar o fluxo de caixa.</p>
          )}
        </section>
      </div>

      {comentarios.length > 0 && (
        <section className="cartao p-4">
          <h3 className="mb-3 font-semibold">Lucro × caixa: o que explica a diferença ({rotuloPeriodo})</h3>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {comentarios.map((c, k) => (
              <div
                key={k}
                className={`rounded-lg border p-3 text-sm ${c.tom === "positivo" ? "border-emerald-200 bg-emerald-50" : c.tom === "atencao" ? "border-amber-200 bg-amber-50" : "border-[var(--borda)] bg-[var(--fundo)]"}`}
              >
                <div className="font-semibold">{c.titulo}</div>
                <p className="mt-1 text-xs leading-relaxed text-neutral-700">{c.texto}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="cartao p-4">
          <h3 className="mb-2 font-semibold">Evolução {t === "mensal" ? "mensal" : t === "anual" ? "anual" : t} do resultado</h3>
          {grupos.length < 2 ? (
            <p className="py-10 text-center text-sm text-neutral-500">A curva aparece a partir do segundo mês.</p>
          ) : (
            <Evolucao
              meses={grupos.map((g) => g.rotulo)}
              series={[
                { nome: "Receita bruta", cor: COR.receita, valores: grupos.map((g) => g.dre.receita_bruta) },
                { nome: "Custos e despesas", cor: COR.despesa, valores: grupos.map((g) => g.dre.custos + g.dre.despesas_operacionais) },
                { nome: "Lucro líquido", cor: COR.lucro, valores: grupos.map((g) => g.dre.lucro_liquido) },
              ]}
            />
          )}
          {mesmoPeriodoAnoAnterior && (
            <p className="mt-2 text-xs text-neutral-500">
              Mesmo período do ano anterior ({mesmoPeriodoAnoAnterior.rotulo}): receita{" "}
              {brl(mesmoPeriodoAnoAnterior.dre.receita_bruta, { centavos: false })}, lucro{" "}
              {brl(mesmoPeriodoAnoAnterior.dre.lucro_liquido, { centavos: false })}.
            </p>
          )}
        </section>
        <section className="cartao p-4">
          <h3 className="mb-2 font-semibold">Lucro × caixa da operação, {t === "mensal" ? "mês a mês" : "por período"}</h3>
          {grupos.length < 2 || !grupos.some((g) => g.fco !== null) ? (
            <p className="py-10 text-center text-sm text-neutral-500">A comparação aparece a partir do segundo mês.</p>
          ) : (
            <ColunasPareadas
              meses={grupos.map((g) => g.rotulo)}
              series={[
                { nome: "Lucro líquido (DRE)", cor: COR.lucro, valores: grupos.map((g) => g.dre.lucro_liquido) },
                { nome: "Caixa da operação (DFC)", cor: COR.receita, valores: grupos.map((g) => g.fco) },
              ]}
            />
          )}
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="cartao p-4">
          <h3 className="mb-1 font-semibold">Ciclo do dinheiro</h3>
          <p className="mb-3 text-xs text-neutral-500">Quantos dias o dinheiro fica preso entre comprar, vender e receber.</p>
          {indices.pmr != null ? (
            <CicloCaixa pme={indices.pme ?? null} pmr={indices.pmr} pmp={indices.pmp ?? null} />
          ) : (
            <p className="text-sm text-neutral-500">Sem receita para calcular os prazos.</p>
          )}
        </section>
        <section className="cartao p-4">
          <h3 className="mb-3 font-semibold">Balanço em uma imagem</h3>
          <Composicao
            ativo={[
              { rotulo: "Caixa, bancos e aplicações", valor: resumo.disponivel, cor: PAL_ATIVO[0] },
              { rotulo: "Clientes a receber", valor: resumo.clientes, cor: PAL_ATIVO[1] },
              { rotulo: "Estoques", valor: resumo.estoques, cor: PAL_ATIVO[2] },
              { rotulo: "Outros de curto prazo", valor: resumo.ac_outros, cor: PAL_ATIVO[3] },
              { rotulo: "Longo prazo e imobilizado", valor: resumo.anc, cor: PAL_ATIVO[4] },
            ]}
            passivo={[
              { rotulo: "Fornecedores", valor: resumo.fornecedores, cor: PAL_PASSIVO[0] },
              { rotulo: "Bancos (empréstimos)", valor: resumo.pc_emprestimos + resumo.pnc_emprestimos, cor: PAL_PASSIVO[1] },
              { rotulo: "Impostos e encargos", valor: resumo.pc_obrigacoes, cor: PAL_PASSIVO[2] },
              { rotulo: "Outras dívidas", valor: resumo.pc_outros + resumo.pnc - resumo.pnc_emprestimos, cor: PAL_PASSIVO[3] },
              { rotulo: "Patrimônio dos sócios", valor: resumo.pl + resumo.resultado_exercicio, cor: PAL_PASSIVO[4] },
            ]}
          />
        </section>
      </div>

      <section className="cartao p-4">
        <h3 className="mb-3 font-semibold">Maiores custos e despesas ({rotuloPeriodo})</h3>
        {dre.despesas_por_conta.length ? (
          <Barras itens={dre.despesas_por_conta.slice(0, 10).map((x) => ({ rotulo: x.conta, valor: x.valor }))} />
        ) : (
          <p className="text-sm text-neutral-500">Sem custos ou despesas no período.</p>
        )}
      </section>
    </div>
  );
}
