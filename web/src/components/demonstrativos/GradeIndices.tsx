// Grade de índices financeiros do balancete: valor do período, minigráfico dos últimos meses, faixa de alerta
// da MDC e tendência linear (sentido, ritmo e projeção), com o quadro-resumo das tendências no topo.
"use client";

import { CicloCaixa, Faisca } from "./Graficos";
import { SENTIDO } from "./paletas";
import { SeletorPeriodo, useSeletorPeriodo } from "./SeletorPeriodo";
import { INDICES_INFO } from "@/dominios/demonstrativos/balancete/indices";
import { agregar } from "@/lib/periodos";
import { MAIOR_MELHOR, tendenciaLinear } from "@/lib/tendencia";
import type { Tendencia } from "@/lib/tendencia";
import { brl } from "@/lib/formato/moeda";
import { fmtIndice, fmtNumero } from "@/lib/formato/numero";
import type { BalanceteReg } from "@/dominios/demonstrativos/tipos";

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
