"use client";

import { useEffect, useMemo, useState } from "react";
import { Barras, COR, Cascata, CicloCaixa, ColunasPareadas, Composicao, Evolucao, Faisca, Pilha100, STATUS, Termometro } from "./Graficos";
import { INDICES_INFO, mdParaHtml, nomeGrupo } from "@/lib/balancete";
import type { Alerta, Conferencia, Indices, Linha, Resumo } from "@/lib/balancete";
import { somarDfc, somarDre } from "@/lib/demonstracoes";
import { TIPOS_PERIODO, agregar, serieAgrupada } from "@/lib/periodos";
import type { TipoPeriodo } from "@/lib/periodos";
import type { Demonstracoes, Dfc } from "@/lib/demonstracoes";
import { caminho } from "@/lib/caminho";
import { MAIOR_MELHOR, tendenciaLinear } from "@/lib/tendencia";
import type { Tendencia } from "@/lib/tendencia";
import { brl } from "@/lib/formato/moeda";
import { fmtIndice, fmtNumero } from "@/lib/formato/numero";
import { fmtData, mesExtenso } from "@/lib/formato/datas";

// paletas validadas (dataviz): composição da receita e do balanço — sempre com rótulo direto
export const PAL_RECEITA = { impostos: "#6250d6", custos: "#C0892A", despesas: "#D55181", financeiro: "#2a78d6", lucro: "#1B8263" };
export const PAL_ATIVO = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
export const PAL_PASSIVO = ["#6250d6", "#e34948", "#008300", "#eda100", "#1B8263"];

export interface BalanceteReg {
  id: string;
  org_id: string;
  cliente_id: string;
  competencia: string;
  status: "rascunho" | "publicado";
  arquivo_nome: string | null;
  resumo: Resumo;
  indices: Indices;
  alertas: Alerta[];
  conferencias: Conferencia[];
  comentario: string | null;
  importado_em: string;
  publicado_em: string | null;
  demonstracoes?: Demonstracoes | null;
  periodo_inicio?: string | null;
  periodo_fim?: string | null;
}

export interface LinhaReg extends Linha {
  id: number;
}

export interface ParecerReg {
  id: string;
  balancete_id: string;
  versao: number;
  status: "rascunho" | "publicado";
  texto: string;
  contador_nome: string | null;
  contador_crc: string | null;
  publicado_em: string | null;
}

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

/** Acumulado do ano: DRE e DFC somando os meses quando todos estão gravados. */
export function acumulado(atual: BalanceteReg, historico: BalanceteReg[]) {
  const doAno = historico.filter((b) => b.competencia.slice(0, 4) === atual.competencia.slice(0, 4) && b.competencia <= atual.competencia);
  const completo = doAno.length === Number(atual.competencia.slice(5, 7)) && (atual.demonstracoes?.periodo.dias ?? 31) <= 31;
  return {
    completo,
    dre: completo ? somarDre(doAno.map((b) => b.resumo.mes)) : atual.resumo.ano,
    dfc: completo ? somarDfc(doAno.map((b) => b.demonstracoes?.dfc).filter((x): x is Dfc => !!x)) : (atual.demonstracoes?.dfc ?? null),
  };
}

/** Período escolhido (lembrado neste navegador). */
export function useSeletorPeriodo(): [TipoPeriodo, (t: TipoPeriodo) => void] {
  const [tipo, setTipo] = useState<TipoPeriodo>("mensal");
  useEffect(() => {
    try {
      const v = localStorage.getItem("mdc-periodo-demonstrativos") as TipoPeriodo | null;
      if (v && TIPOS_PERIODO.some((x) => x.id === v)) setTipo(v);
    } catch {
      /* sem armazenamento */
    }
  }, []);
  const mudar = (t: TipoPeriodo) => {
    setTipo(t);
    try {
      localStorage.setItem("mdc-periodo-demonstrativos", t);
    } catch {
      /* sem armazenamento */
    }
  };
  return [tipo, mudar];
}

export function SeletorPeriodo({ tipo, aoMudar }: { tipo: TipoPeriodo; aoMudar: (t: TipoPeriodo) => void }) {
  return (
    <div className="flex rounded-lg border border-[var(--borda)] bg-white p-0.5 text-sm print:hidden" role="group" aria-label="Período">
      {TIPOS_PERIODO.map((p) => (
        <button
          key={p.id}
          className={`rounded-md px-3 py-1 ${tipo === p.id ? "bg-[var(--marca)] text-white" : ""}`}
          onClick={() => aoMudar(p.id)}
        >
          {p.nome}
        </button>
      ))}
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
  const r = ag.resumo;
  const i = ag.indices;
  const d = ag.dre;
  const f = ag.dfc;
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
  const fin = d.despesas_financeiras - d.receitas_financeiras - d.outras;
  const ult = grupos;

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
              style={{ color: saudeP.nota >= 75 ? STATUS.bom.cor : saudeP.nota >= 50 ? STATUS.atencao.cor : STATUS.critico.cor }}
            >
              {saudeP.faixa}
            </div>
            <p className="mt-1 text-[11px] text-neutral-500">Média de cinco pilares, avaliados pela MDC a cada fechamento.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {saudeP.pilares.map((p) => {
              const st = STATUS[p.status];
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
          valor={brl(d.receita_bruta, { centavos: false })}
          serie={serie((g) => g.dre.receita_bruta)}
          sub={!multi ? variacao(d.receita_bruta, anteriorGrupo?.dre.receita_bruta) : undefined}
        />
        <Kpi
          rotulo={d.lucro_liquido >= 0 ? "Lucro líquido" : "Prejuízo"}
          valor={brl(d.lucro_liquido, { centavos: false })}
          negativo={d.lucro_liquido < 0}
          serie={serie((g) => g.dre.lucro_liquido)}
          sub={d.receita_liquida ? `margem de ${fmtIndice(d.lucro_liquido / d.receita_liquida, "%")}` : undefined}
        />
        <Kpi
          rotulo="Dinheiro em caixa, bancos e aplicações"
          valor={brl(r.disponivel, { centavos: false })}
          negativo={r.disponivel < 0}
          serie={serie((g) => g.disponivel)}
          sub={f ? `${f.variacao >= 0 ? "▲ entrou" : "▼ saiu"} ${brl(Math.abs(f.variacao), { centavos: false })} no período` : undefined}
        />
        <Kpi
          rotulo="Caixa gerado pela operação"
          valor={f ? brl(f.fco, { centavos: false }) : "—"}
          negativo={!!f && f.fco < 0}
          serie={serie((g) => g.fco)}
          sub={
            f && d.lucro_liquido > 0
              ? `${fmtIndice(f.fco / d.lucro_liquido, "%")} do lucro virou caixa`
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

      {d.receita_bruta > 0 && (
        <section className="cartao p-4">
          <h3 className="font-semibold">Para onde foi cada R$ 100 vendidos ({rotuloPeriodo})</h3>
          <p className="mb-3 text-xs text-neutral-500">Toda a receita bruta dividida entre impostos, custos, despesas e o que sobrou.</p>
          <Pilha100
            partes={[
              { rotulo: "Impostos (venda + IR/CSLL)", valor: d.deducoes + d.ir_csll, cor: PAL_RECEITA.impostos },
              { rotulo: "Custos", valor: d.custos, cor: PAL_RECEITA.custos },
              { rotulo: "Despesas operacionais", valor: d.despesas_operacionais, cor: PAL_RECEITA.despesas },
              { rotulo: "Juros e outras despesas líquidas", valor: Math.max(0, fin), cor: PAL_RECEITA.financeiro },
              { rotulo: "Lucro", valor: Math.max(0, d.lucro_liquido), cor: PAL_RECEITA.lucro },
            ]}
          />
          {d.lucro_liquido < 0 && (
            <p className="mt-2 text-xs font-medium text-[var(--perigo)]">
              Os gastos superaram a receita em {brl(-d.lucro_liquido, { centavos: false })}: faltaram R${" "}
              {((-d.lucro_liquido / d.receita_bruta) * 100).toFixed(1).replace(".", ",")} para cada R$ 100 vendidos.
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
              { rotulo: "Receita bruta", valor: d.receita_bruta, total: true },
              { rotulo: "Deduções e impostos", valor: -d.deducoes },
              { rotulo: "Custos", valor: -d.custos },
              { rotulo: "Despesas operacionais", valor: -d.despesas_operacionais },
              { rotulo: "Resultado financeiro e outros", valor: d.receitas_financeiras - d.despesas_financeiras + d.outras },
              { rotulo: "IRPJ e CSLL", valor: -d.ir_csll },
              { rotulo: "Lucro líquido", valor: d.lucro_liquido, total: true },
            ]}
          />
        </section>
        <section className="cartao p-4">
          <h3 className="font-semibold">Do caixa inicial ao final ({rotuloPeriodo})</h3>
          <p className="mb-2 text-xs text-neutral-500">De onde veio e para onde foi o dinheiro.</p>
          {f ? (
            <Cascata
              passos={[
                { rotulo: "Caixa inicial", valor: f.caixa_inicial, total: true },
                { rotulo: "Operação do negócio", valor: f.fco },
                { rotulo: "Investimentos em bens", valor: f.fci },
                { rotulo: "Bancos e sócios", valor: f.fcf },
                { rotulo: "Caixa final", valor: f.caixa_final, total: true },
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
          {ult.length < 2 ? (
            <p className="py-10 text-center text-sm text-neutral-500">A curva aparece a partir do segundo mês.</p>
          ) : (
            <Evolucao
              meses={ult.map((g) => g.rotulo)}
              series={[
                { nome: "Receita bruta", cor: COR.receita, valores: ult.map((g) => g.dre.receita_bruta) },
                { nome: "Custos e despesas", cor: COR.despesa, valores: ult.map((g) => g.dre.custos + g.dre.despesas_operacionais) },
                { nome: "Lucro líquido", cor: COR.lucro, valores: ult.map((g) => g.dre.lucro_liquido) },
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
          {ult.length < 2 || !ult.some((g) => g.fco !== null) ? (
            <p className="py-10 text-center text-sm text-neutral-500">A comparação aparece a partir do segundo mês.</p>
          ) : (
            <ColunasPareadas
              meses={ult.map((g) => g.rotulo)}
              series={[
                { nome: "Lucro líquido (DRE)", cor: COR.lucro, valores: ult.map((g) => g.dre.lucro_liquido) },
                { nome: "Caixa da operação (DFC)", cor: COR.receita, valores: ult.map((g) => g.fco) },
              ]}
            />
          )}
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="cartao p-4">
          <h3 className="mb-1 font-semibold">Ciclo do dinheiro</h3>
          <p className="mb-3 text-xs text-neutral-500">Quantos dias o dinheiro fica preso entre comprar, vender e receber.</p>
          {i.pmr != null ? (
            <CicloCaixa pme={i.pme ?? null} pmr={i.pmr} pmp={i.pmp ?? null} />
          ) : (
            <p className="text-sm text-neutral-500">Sem receita para calcular os prazos.</p>
          )}
        </section>
        <section className="cartao p-4">
          <h3 className="mb-3 font-semibold">Balanço em uma imagem</h3>
          <Composicao
            ativo={[
              { rotulo: "Caixa, bancos e aplicações", valor: r.disponivel, cor: PAL_ATIVO[0] },
              { rotulo: "Clientes a receber", valor: r.clientes, cor: PAL_ATIVO[1] },
              { rotulo: "Estoques", valor: r.estoques, cor: PAL_ATIVO[2] },
              { rotulo: "Outros de curto prazo", valor: r.ac_outros, cor: PAL_ATIVO[3] },
              { rotulo: "Longo prazo e imobilizado", valor: r.anc, cor: PAL_ATIVO[4] },
            ]}
            passivo={[
              { rotulo: "Fornecedores", valor: r.fornecedores, cor: PAL_PASSIVO[0] },
              { rotulo: "Bancos (empréstimos)", valor: r.pc_emprestimos + r.pnc_emprestimos, cor: PAL_PASSIVO[1] },
              { rotulo: "Impostos e encargos", valor: r.pc_obrigacoes, cor: PAL_PASSIVO[2] },
              { rotulo: "Outras dívidas", valor: r.pc_outros + r.pnc - r.pnc_emprestimos, cor: PAL_PASSIVO[3] },
              { rotulo: "Patrimônio dos sócios", valor: r.pl + r.resultado_exercicio, cor: PAL_PASSIVO[4] },
            ]}
          />
        </section>
      </div>

      <section className="cartao p-4">
        <h3 className="mb-3 font-semibold">Maiores custos e despesas ({rotuloPeriodo})</h3>
        {d.despesas_por_conta.length ? (
          <Barras itens={d.despesas_por_conta.slice(0, 10).map((x) => ({ rotulo: x.conta, valor: x.valor }))} />
        ) : (
          <p className="text-sm text-neutral-500">Sem custos ou despesas no período.</p>
        )}
      </section>
    </div>
  );
}

/** Grade de índices com a curva dos últimos meses e a faixa de alerta. */
export function GradeIndices({ atual, historico }: { atual: BalanceteReg; historico: BalanceteReg[] }) {
  const ult = [...historico]
    .sort((a, b) => a.competencia.localeCompare(b.competencia))
    .filter((b) => b.competencia <= atual.competencia)
    .slice(-12);
  const SECOES: { titulo: string; sub: string; ids: string[] }[] = [
    {
      titulo: "Liquidez",
      sub: "capacidade de pagar as contas",
      ids: ["liquidez_corrente", "liquidez_seca", "liquidez_imediata", "liquidez_geral", "capital_giro"],
    },
    { titulo: "Endividamento", sub: "quanto depende de terceiros", ids: ["endividamento_geral", "composicao_endividamento"] },
    {
      titulo: "Rentabilidade",
      sub: "quanto sobra do que vende",
      ids: ["margem_bruta", "margem_operacional", "margem_liquida", "roe", "carga_tributaria"],
    },
    {
      titulo: "Prazos médios e ciclo",
      sub: "quanto tempo o dinheiro fica preso",
      ids: ["pmr", "pmp", "pme", "pmv", "ciclo_operacional", "ciclo_financeiro"],
    },
  ];
  const multi = (atual.demonstracoes?.periodo.dias ?? 31) > 31;
  const [tipo, setTipo] = useSeletorPeriodo();
  const ag = agregar(atual, historico, multi ? "mensal" : tipo);
  const i = ag.indices;
  // série mensal contínua (mês sem balancete = vazio), só balancetes mensais: a reta usa o mês do calendário
  const serie = serieMensal(ult);
  const tend = new Map<string, Tendencia | null>(
    INDICES_INFO.map((x) => [
      x.id,
      tendenciaLinear(
        serie.map((b) => (b ? (b.indices[x.id] as number | null) : null)),
        MAIOR_MELHOR[x.id] ?? true,
      ),
    ]),
  );
  return (
    <div className="space-y-6">
      <ResumoTendencia tend={tend} meses={serie.length} />
      {!multi && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-neutral-600">
            {tipo === "mensal"
              ? "Índices do mês."
              : `Índices de ${ag.rotulo}: margens sobre a DRE do período, liquidez e endividamento no fechamento, prazos pela média dos meses.`}
          </p>
          <SeletorPeriodo tipo={tipo} aoMudar={setTipo} />
        </div>
      )}
      {SECOES.map((sec) => (
        <section key={sec.titulo}>
          <h3 className="mb-2 font-semibold text-[var(--marca)]">
            {sec.titulo} <span className="text-xs font-normal text-neutral-500">· {sec.sub}</span>
          </h3>
          {sec.titulo.startsWith("Prazos") && i.pmr != null && (
            <div className="cartao mb-3 p-4">
              <CicloCaixa pme={i.pme ?? null} pmr={i.pmr} pmp={i.pmp ?? null} />
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {INDICES_INFO.filter((x) => sec.ids.includes(x.id)).map((info) => {
              const v = i[info.id];
              const ruim = v !== null && v !== undefined && info.alerta?.(v as number);
              return (
                <div key={info.id} className={`cartao p-4 ${ruim ? "!border-red-200" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium">{info.nome}</div>
                      <div className={`text-2xl font-semibold tabular-nums ${ruim ? "text-[var(--perigo)]" : "text-[var(--marca)]"}`}>
                        {fmtIndice(v as number, info.formato)}
                      </div>
                    </div>
                    <Faisca
                      valores={serie.map((b) => (b ? ((b.indices[info.id] as number | null) ?? null) : null))}
                      alerta={!!ruim}
                      reta={tend.get(info.id) ? { a: tend.get(info.id)!.intercepto, b: tend.get(info.id)!.inclinacao } : null}
                    />
                  </div>
                  <p className="mt-1 text-xs text-neutral-600">{info.leitura}.</p>
                  <LinhaTendencia t={tend.get(info.id) ?? null} formato={info.formato} />
                  {ruim && <p className="mt-1 text-xs font-medium text-[var(--perigo)]">⚠ Fora da faixa de referência da MDC</p>}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Coloca os balancetes mensais na linha do tempo, mês a mês, com vazio nos meses sem balancete. */
function serieMensal(lista: BalanceteReg[]): (BalanceteReg | null)[] {
  const mensais = lista.filter((b) => (b.demonstracoes?.periodo.dias ?? 31) <= 31);
  if (!mensais.length) return [];
  const idx = (c: string) => Number(c.slice(0, 4)) * 12 + Number(c.slice(5, 7)) - 1;
  const ini = idx(mensais[0].competencia);
  const out: (BalanceteReg | null)[] = Array(idx(mensais[mensais.length - 1].competencia) - ini + 1).fill(null);
  for (const b of mensais) out[idx(b.competencia) - ini] = b;
  return out;
}

const SENTIDO = {
  melhora: { icone: "▲", cor: "#067647", nome: "melhorando" },
  piora: { icone: "▼", cor: "#B42318", nome: "piorando" },
  estavel: { icone: "●", cor: "#5D6661", nome: "sem tendência clara" },
} as const;

function fmtVariacao(v: number, f: "x" | "%" | "R$" | "dias") {
  const s = v >= 0 ? "+" : "−";
  const a = Math.abs(v);
  if (f === "%") return `${s}${(a * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} p.p.`;
  if (f === "dias") return `${s}${a.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dia${a >= 1.95 ? "s" : ""}`;
  if (f === "R$") return `${s}${brl(a, { centavos: false })}`;
  return `${s}${fmtNumero(a)}`;
}

/** Tendência linear do índice: sentido, ritmo mensal, aderência (R²) e projeção de 3 meses. */
function LinhaTendencia({ t, formato }: { t: Tendencia | null; formato: "x" | "%" | "R$" | "dias" }) {
  if (!t) return <p className="mt-2 text-[11px] text-neutral-400">Tendência linear: precisa de 3 meses com valor.</p>;
  const s = SENTIDO[t.sentido];
  return (
    <p
      className="mt-2 border-t border-[var(--borda)] pt-2 text-[11px] leading-snug text-neutral-600"
      title={`Reta de mínimos quadrados sobre ${t.n} meses. R² ${t.r2.toFixed(2)}.`}
    >
      <span className="font-semibold" style={{ color: s.cor }}>
        {s.icone} Tendência linear: {s.nome}
      </span>{" "}
      · {fmtVariacao(t.inclinacao, formato)}/mês · R² {t.r2.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} · projeção em 3 meses:{" "}
      <b>{fmtIndice(t.projecao3, formato)}</b>
    </p>
  );
}

/** Quadro geral: quantos índices melhoram, pioram ou estão estáveis pela reta dos últimos meses. */
function ResumoTendencia({ tend, meses }: { tend: Map<string, Tendencia | null>; meses: number }) {
  const itens = INDICES_INFO.map((x) => ({ info: x, t: tend.get(x.id) ?? null })).filter((x) => x.t);
  if (itens.length === 0) return null;
  const grupo = (s: Tendencia["sentido"]) => itens.filter((x) => x.t!.sentido === s);
  const piora = grupo("piora").sort((a, b) => b.t!.r2 - a.t!.r2);
  const melhora = grupo("melhora").sort((a, b) => b.t!.r2 - a.t!.r2);
  const nome = (n: string) => n.replace(/^[A-Z]{3} · /, "");
  return (
    <section className="cartao p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-[var(--marca)]">Tendência linear dos índices</h3>
        <span className="text-xs text-neutral-500">
          reta de mínimos quadrados sobre os últimos {meses} meses · linha tracejada nos minigráficos
        </span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {(["melhora", "piora", "estavel"] as const).map((k) => (
          <div key={k} className="rounded-lg border border-[var(--borda)] p-3">
            <div className="text-2xl font-semibold tabular-nums" style={{ color: SENTIDO[k].cor }}>
              {SENTIDO[k].icone} {grupo(k).length}
            </div>
            <div className="text-xs text-neutral-600">{k === "estavel" ? "sem tendência clara" : `índices ${SENTIDO[k].nome}`}</div>
          </div>
        ))}
      </div>
      {(piora.length > 0 || melhora.length > 0) && (
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          {piora.length > 0 && (
            <p>
              <b className="text-[#B42318]">Piorando:</b>{" "}
              {piora
                .slice(0, 5)
                .map((x) => nome(x.info.nome))
                .join(", ")}
              .
            </p>
          )}
          {melhora.length > 0 && (
            <p>
              <b className="text-[#067647]">Melhorando:</b>{" "}
              {melhora
                .slice(0, 5)
                .map((x) => nome(x.info.nome))
                .join(", ")}
              .
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/** Balancete em árvore, com busca e comparação com o mês anterior. */
export function ArvoreBalancete({
  linhas,
  anteriores,
  editarGrupo,
  editarDfc,
}: {
  linhas: LinhaReg[];
  anteriores?: Map<string, number>;
  editarGrupo?: (l: LinhaReg) => React.ReactNode;
  editarDfc?: (l: LinhaReg) => React.ReactNode;
}) {
  const [busca, setBusca] = useState("");
  const [fechados, setFechados] = useState<Set<string>>(new Set());
  const q = busca.trim().toLowerCase();
  const visiveis = linhas.filter((l) => {
    if (q) return l.descricao.toLowerCase().includes(q) || l.classificacao.startsWith(q);
    return ![...fechados].some((f) => l.classificacao !== f && l.classificacao.startsWith(f + "."));
  });
  const temFilhos = (l: LinhaReg) => !l.analitica;
  const nat = (v: number) => (v === 0 ? "" : v > 0 ? " D" : " C");
  const fmt = (v: number) => (v === 0 ? "—" : fmtNumero(Math.abs(v)));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 print:hidden">
        <input className="entrada w-64" placeholder="Buscar conta…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <button
          className="btn"
          onClick={() => setFechados(new Set(linhas.filter((l) => l.nivel === 2 && !l.analitica).map((l) => l.classificacao)))}
        >
          Recolher
        </button>
        <button className="btn" onClick={() => setFechados(new Set())}>
          Expandir tudo
        </button>
      </div>
      <div className="cartao overflow-x-auto">
        <table className="tabela text-[13px]">
          <thead>
            <tr>
              <th>Classificação</th>
              <th>Conta</th>
              <th className="text-right">Saldo anterior</th>
              <th className="text-right">Débitos</th>
              <th className="text-right">Créditos</th>
              <th className="text-right">Saldo atual</th>
              {anteriores && <th className="text-right">Variação</th>}
              {editarGrupo && <th>Grupo gerencial</th>}
              {editarDfc && <th>Linha na DFC</th>}
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l) => {
              const ant = anteriores?.get(l.classificacao);
              const dv = ant !== undefined ? l.saldo_atual - ant : null;
              const fechado = fechados.has(l.classificacao);
              return (
                <tr key={l.id} className={l.analitica ? "" : "bg-[var(--fundo)] font-medium"}>
                  <td className="whitespace-nowrap text-neutral-500">{l.classificacao}</td>
                  <td style={{ paddingLeft: 10 + (l.nivel - 1) * 14 }}>
                    {temFilhos(l) && !q ? (
                      <button
                        className="mr-1 text-neutral-400"
                        onClick={() =>
                          setFechados((s) => {
                            const n = new Set(s);
                            if (n.has(l.classificacao)) n.delete(l.classificacao);
                            else n.add(l.classificacao);
                            return n;
                          })
                        }
                        aria-label={fechado ? "Abrir" : "Recolher"}
                      >
                        {fechado ? "▸" : "▾"}
                      </button>
                    ) : null}
                    {l.descricao}
                  </td>
                  <td className="whitespace-nowrap text-right tabular-nums">
                    {fmt(l.saldo_anterior)}
                    {nat(l.saldo_anterior)}
                  </td>
                  <td className="whitespace-nowrap text-right tabular-nums">{fmt(l.debitos)}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">{fmt(l.creditos)}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">
                    {fmt(l.saldo_atual)}
                    {nat(l.saldo_atual)}
                  </td>
                  {anteriores && (
                    <td
                      className={`whitespace-nowrap text-right tabular-nums text-xs ${dv && Math.abs(dv) > 0.5 ? "" : "text-neutral-400"}`}
                    >
                      {dv === null
                        ? "novo"
                        : Math.abs(dv) < 0.5
                          ? "—"
                          : `${dv > 0 ? "+" : "−"}${fmt(dv)}${ant ? ` (${((Math.abs(dv) / Math.abs(ant)) * 100).toFixed(0)}%)` : ""}`}
                    </td>
                  )}
                  {editarGrupo && (
                    <td>{l.analitica ? editarGrupo(l) : <span className="text-xs text-neutral-400">{nomeGrupo(l.grupo)}</span>}</td>
                  )}
                  {editarDfc && <td>{l.analitica ? editarDfc(l) : null}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Lista de fragilidades com evidência, risco e recomendação. */
export function ListaAlertas({ alertas }: { alertas: Alerta[] }) {
  if (!alertas.length) return <p className="text-sm text-emerald-700">Nenhuma fragilidade relevante nas verificações deste balancete.</p>;
  return (
    <ul className="space-y-2">
      {alertas.map((a, k) => (
        <li
          key={k}
          className={`rounded-lg border p-3 text-sm ${a.nivel === "alto" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className={`chip ${a.nivel === "alto" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}>
              {a.nivel === "alto" ? "Risco alto" : "Atenção"}
            </span>
            <b>{a.texto}</b>
            <span className="text-xs text-neutral-500">{a.area}</span>
          </div>
          <div className="mt-1 text-neutral-700">Evidência: {a.evidencia}</div>
          <div className="text-neutral-700">Recomendação: {a.recomendacao}</div>
        </li>
      ))}
    </ul>
  );
}

/** Parecer renderizado com o cabeçalho e a assinatura da MDC (também usado na impressão/PDF). */
export function VisaoParecer({ texto, empresa, cnpj }: { texto: string; empresa: string; cnpj?: string | null }) {
  return (
    <article className="parecer cartao p-6 print:border-0 print:p-0">
      <header className="mb-4 flex items-center justify-between gap-3 border-b-2 border-[var(--destaque)] pb-3">
        <div className="flex items-center gap-3">
          <img src={caminho("/icone-hub-mdc.svg")} alt="" className="h-10 w-10 rounded-md" />
          <div>
            <div className="font-semibold text-[var(--marca)]">MDC Assessoria Contábil</div>
            <div className="text-xs text-neutral-500">Assessoria Contábil, Tributária e Gestão Financeira · mdcassessoria.com</div>
          </div>
        </div>
        <div className="text-right text-xs text-neutral-600">
          {empresa}
          {cnpj && <div>{cnpj}</div>}
        </div>
      </header>
      <div className="prosa" dangerouslySetInnerHTML={{ __html: mdParaHtml(texto) }} />
      <footer className="mt-6 border-t border-[var(--borda)] pt-2 text-[11px] text-neutral-500">
        MDC Assessoria Ltda · CNPJ 48.140.121/0001-65 · Bragança Paulista/SP · (11) 98859-8041 · edvaldo@mdcassessoria.com
      </footer>
    </article>
  );
}
