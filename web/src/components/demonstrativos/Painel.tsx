"use client";

import { useMemo, useState } from "react";
import { Barras, COR, Cascata, Evolucao, Faisca } from "./Graficos";
import { INDICES_INFO, brl, fmtIndice, mdParaHtml, nomeGrupo } from "@/lib/balancete";
import type { Alerta, Conferencia, Indices, Linha, Resumo } from "@/lib/balancete";

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

export const mesAno = (c: string) => {
  const [a, m] = c.split("-");
  return `${["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][Number(m) - 1]}/${a.slice(2)}`;
};

export const mesExtenso = (c: string) =>
  new Date(c.slice(0, 7) + "-15T12:00:00Z").toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

function Kpi({ rotulo, valor, sub, negativo }: { rotulo: string; valor: string; sub?: string; negativo?: boolean }) {
  return (
    <div className="cartao p-4">
      <div className="text-xs text-neutral-500">{rotulo}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${negativo ? "text-[var(--perigo)]" : "text-[var(--marca)]"}`}>{valor}</div>
      {sub && <div className="mt-0.5 text-xs text-neutral-500">{sub}</div>}
    </div>
  );
}

/** Painel principal: resultado, cascata, evolução, despesas, balanço. */
export function PainelResumo({ atual, historico }: { atual: BalanceteReg; historico: BalanceteReg[] }) {
  const [periodo, setPeriodo] = useState<"mes" | "ano">("mes");
  const r = atual.resumo;
  const d = periodo === "mes" ? r.mes : r.ano;
  const i = atual.indices;
  const ult = useMemo(
    () => [...historico].sort((a, b) => a.competencia.localeCompare(b.competencia)).filter((b) => b.competencia <= atual.competencia).slice(-12),
    [historico, atual.competencia],
  );
  const mesmoMesAnoAnterior = historico.find(
    (b) => b.competencia === `${Number(atual.competencia.slice(0, 4)) - 1}${atual.competencia.slice(4)}`,
  );
  const anterior = ult.length > 1 ? ult[ult.length - 2] : null;
  const variacao = (a: number, b?: number) =>
    b ? `${a >= b ? "▲" : "▼"} ${Math.abs(((a - b) / Math.abs(b)) * 100).toFixed(1).replace(".", ",")}% sobre ${anterior ? mesAno(anterior.competencia) : ""}` : undefined;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[var(--marca)]">Resultado de {mesExtenso(atual.competencia)}</h2>
        <div className="flex rounded-lg border border-[var(--borda)] bg-white p-0.5 text-sm print:hidden">
          {(["mes", "ano"] as const).map((p) => (
            <button key={p} className={`rounded-md px-3 py-1 ${periodo === p ? "bg-[var(--marca)] text-white" : ""}`} onClick={() => setPeriodo(p)}>
              {p === "mes" ? "Mês" : "Acumulado no ano"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Receita bruta" valor={brl(d.receita_bruta)} sub={periodo === "mes" ? variacao(r.mes.receita_bruta, anterior?.resumo.mes.receita_bruta) : undefined} />
        <Kpi rotulo={d.lucro_liquido >= 0 ? "Lucro líquido" : "Prejuízo"} valor={brl(d.lucro_liquido)} negativo={d.lucro_liquido < 0} sub={periodo === "mes" ? variacao(r.mes.lucro_liquido, anterior?.resumo.mes.lucro_liquido) : undefined} />
        <Kpi rotulo="Margem líquida" valor={fmtIndice(d.receita_liquida ? d.lucro_liquido / d.receita_liquida : null, "%")} negativo={d.lucro_liquido < 0} />
        <Kpi rotulo="Impostos sobre a receita e o lucro" valor={brl(d.deducoes + d.ir_csll)} sub={d.receita_bruta ? `${fmtIndice((d.deducoes + d.ir_csll) / d.receita_bruta, "%")} da receita bruta` : undefined} />
      </div>

      {atual.comentario && (
        <div className="cartao border-l-4 !border-l-[var(--destaque)] p-4">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">O que aconteceu na sua empresa em {mesExtenso(atual.competencia)}</div>
          <p className="whitespace-pre-wrap text-sm">{atual.comentario}</p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="cartao p-4">
          <h3 className="mb-2 font-semibold">Da receita ao lucro ({periodo === "mes" ? "mês" : "ano"})</h3>
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
          <h3 className="mb-2 font-semibold">Evolução mensal</h3>
          {ult.length < 2 ? (
            <p className="py-10 text-center text-sm text-neutral-500">A curva aparece a partir do segundo mês publicado.</p>
          ) : (
            <Evolucao
              meses={ult.map((b) => mesAno(b.competencia))}
              series={[
                { nome: "Receita bruta", cor: COR.receita, valores: ult.map((b) => b.resumo.mes.receita_bruta) },
                { nome: "Custos e despesas", cor: COR.despesa, valores: ult.map((b) => b.resumo.mes.custos + b.resumo.mes.despesas_operacionais) },
                { nome: "Lucro líquido", cor: COR.lucro, valores: ult.map((b) => b.resumo.mes.lucro_liquido) },
              ]}
            />
          )}
          {mesmoMesAnoAnterior && (
            <p className="mt-2 text-xs text-neutral-500">
              Mesmo mês do ano anterior: receita {brl(mesmoMesAnoAnterior.resumo.mes.receita_bruta)}, lucro {brl(mesmoMesAnoAnterior.resumo.mes.lucro_liquido)}.
            </p>
          )}
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="cartao p-4">
          <h3 className="mb-3 font-semibold">Maiores custos e despesas ({periodo === "mes" ? "mês" : "ano"})</h3>
          {d.despesas_por_conta.length ? (
            <Barras itens={d.despesas_por_conta.slice(0, 8).map((x) => ({ rotulo: x.conta, valor: x.valor }))} />
          ) : (
            <p className="text-sm text-neutral-500">Sem custos ou despesas no período.</p>
          )}
        </section>
        <section className="cartao p-4">
          <h3 className="mb-3 font-semibold">Balanço resumido</h3>
          <div className="grid grid-cols-2 gap-x-6 text-sm">
            <div className="space-y-1">
              <Linha2 r="Disponível" v={r.disponivel} />
              <Linha2 r="Clientes a receber" v={r.clientes} />
              <Linha2 r="Estoques" v={r.estoques} />
              <Linha2 r="Outros circulantes" v={r.ac_outros} />
              <Linha2 r="Ativo circulante" v={r.ac} forte />
              <Linha2 r="Longo prazo e permanente" v={r.anc} />
              <Linha2 r="Ativo total" v={r.ativo_total} forte />
            </div>
            <div className="space-y-1">
              <Linha2 r="Fornecedores" v={r.fornecedores} />
              <Linha2 r="Empréstimos (curto prazo)" v={r.pc_emprestimos} />
              <Linha2 r="Impostos e encargos" v={r.pc_obrigacoes} />
              <Linha2 r="Outros" v={r.pc_outros} />
              <Linha2 r="Passivo circulante" v={r.pc} forte />
              <Linha2 r="Passivo de longo prazo" v={r.pnc} />
              <Linha2 r="Patrimônio líquido + resultado" v={r.pl + r.resultado_exercicio} forte />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
            {(["liquidez_corrente", "endividamento_geral", "capital_giro"] as const).map((k) => {
              const info = INDICES_INFO.find((x) => x.id === k)!;
              const v = i[k];
              const ruim = v !== null && info.alerta?.(v);
              return (
                <div key={k} className={`rounded-lg p-2 ${ruim ? "bg-red-50" : "bg-[var(--fundo)]"}`}>
                  <div className="text-neutral-500">{info.nome}</div>
                  <div className={`text-base font-semibold ${ruim ? "text-[var(--perigo)]" : ""}`}>{fmtIndice(v, info.formato)}</div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

function Linha2({ r, v, forte }: { r: string; v: number; forte?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${forte ? "border-t border-[var(--borda)] pt-1 font-semibold" : "text-neutral-700"}`}>
      <span>{r}</span>
      <span className={`tabular-nums ${v < 0 ? "text-[var(--perigo)]" : ""}`}>{brl(v)}</span>
    </div>
  );
}

/** Grade de índices com a curva dos últimos meses e a faixa de alerta. */
export function GradeIndices({ atual, historico }: { atual: BalanceteReg; historico: BalanceteReg[] }) {
  const ult = [...historico].sort((a, b) => a.competencia.localeCompare(b.competencia)).filter((b) => b.competencia <= atual.competencia).slice(-12);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {INDICES_INFO.map((info) => {
        const v = atual.indices[info.id];
        const ruim = v !== null && v !== undefined && info.alerta?.(v as number);
        return (
          <div key={info.id} className={`cartao p-4 ${ruim ? "!border-red-200" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-medium">{info.nome}</div>
                <div className={`text-2xl font-semibold tabular-nums ${ruim ? "text-[var(--perigo)]" : "text-[var(--marca)]"}`}>{fmtIndice(v as number, info.formato)}</div>
              </div>
              <Faisca valores={ult.map((b) => (b.indices[info.id] as number | null) ?? null)} alerta={!!ruim} />
            </div>
            <p className="mt-1 text-xs text-neutral-600">{info.leitura}.</p>
            {ruim && <p className="mt-1 text-xs font-medium text-[var(--perigo)]">⚠ Fora da faixa de referência da MDC</p>}
          </div>
        );
      })}
    </div>
  );
}

/** Balancete em árvore, com busca e comparação com o mês anterior. */
export function ArvoreBalancete({
  linhas,
  anteriores,
  editarGrupo,
}: {
  linhas: LinhaReg[];
  anteriores?: Map<string, number>;
  editarGrupo?: (l: LinhaReg) => React.ReactNode;
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
  const fmt = (v: number) => (v === 0 ? "—" : Math.abs(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 print:hidden">
        <input className="entrada w-64" placeholder="Buscar conta…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <button className="btn" onClick={() => setFechados(new Set(linhas.filter((l) => l.nivel === 2 && !l.analitica).map((l) => l.classificacao)))}>
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
                  <td className="whitespace-nowrap text-right tabular-nums">{fmt(l.saldo_anterior)}{nat(l.saldo_anterior)}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">{fmt(l.debitos)}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">{fmt(l.creditos)}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">{fmt(l.saldo_atual)}{nat(l.saldo_atual)}</td>
                  {anteriores && (
                    <td className={`whitespace-nowrap text-right tabular-nums text-xs ${dv && Math.abs(dv) > 0.5 ? "" : "text-neutral-400"}`}>
                      {dv === null ? "novo" : Math.abs(dv) < 0.5 ? "—" : `${dv > 0 ? "+" : "−"}${fmt(dv)}${ant ? ` (${((Math.abs(dv) / Math.abs(ant)) * 100).toFixed(0)}%)` : ""}`}
                    </td>
                  )}
                  {editarGrupo && <td>{l.analitica ? editarGrupo(l) : <span className="text-xs text-neutral-400">{nomeGrupo(l.grupo)}</span>}</td>}
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
        <li key={k} className={`rounded-lg border p-3 text-sm ${a.nivel === "alto" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`chip ${a.nivel === "alto" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}>{a.nivel === "alto" ? "Risco alto" : "Atenção"}</span>
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
          <img src="/icone-hub-mdc.svg" alt="" className="h-10 w-10 rounded-md" />
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

export { brl };
