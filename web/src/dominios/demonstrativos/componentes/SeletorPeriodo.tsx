// Seletor de período do topo da análise (Ano · Visão · Qual período), com a completude em linguagem simples e a
// comparação com o mesmo período do ano anterior, e o hook usePeriodo que guarda a escolha (a visão fica lembrada
// neste navegador). Usado na tela do balancete da equipe e no Portal do cliente.
"use client";

import { useMemo, useState } from "react";
import {
  VISOES,
  anosDisponiveis,
  escolhaPadrao,
  mesmoPeriodoAnoAnterior,
  normalizar,
  opcoesDoAno,
  selecionar,
  trocarVisao,
  visoesDoAno,
} from "@/dominios/demonstrativos/selecaoPeriodo";
import type { Escolha, RegPeriodo, Selecao, Visao } from "@/dominios/demonstrativos/selecaoPeriodo";
import { CHAVES, useEstadoLembrado } from "@/lib/armazenamentoLocal";

export interface Periodo<T extends RegPeriodo> {
  escolha: Escolha | null;
  sel: Selecao<T> | null;
  anterior: Selecao<T> | null;
  mudar: (e: Escolha) => void;
  mudarVisao: (v: Visao) => void;
}

/**
 * Período escolhido sobre o histórico do cliente. Começa no período que contém `referencia` (a competência aberta)
 * ou no último com dado. `chave` muda quando troca o cliente/balancete e faz a escolha voltar ao padrão.
 */
export function usePeriodo<T extends RegPeriodo>(historico: T[], referencia: string | undefined, chave: string): Periodo<T> {
  const [visaoPref, setVisaoPref] = useEstadoLembrado<Visao>(CHAVES.periodoDemonstrativos, "mensal", (v) => VISOES.some((x) => x.id === v));
  const [manual, setManual] = useState<{ chave: string; e: Escolha } | null>(null);
  const escolha = useMemo(
    () => (manual && manual.chave === chave ? normalizar(historico, manual.e) : escolhaPadrao(historico, visaoPref, referencia)),
    [manual, chave, historico, visaoPref, referencia],
  );
  const sel = useMemo(() => (escolha ? selecionar(historico, escolha) : null), [historico, escolha]);
  const anterior = useMemo(() => (escolha ? mesmoPeriodoAnoAnterior(historico, escolha) : null), [historico, escolha]);
  return {
    escolha,
    sel,
    anterior,
    mudar: (e) => setManual({ chave, e }),
    mudarVisao: (v) => {
      setVisaoPref(v);
      const nova = escolha ? trocarVisao(historico, escolha, v) : null;
      if (nova) setManual({ chave, e: nova });
    },
  };
}

/** Barra do topo: Ano, Visão e Qual período; embaixo, quantos meses entraram e com o que está sendo comparado. */
export function SeletorPeriodo<T extends RegPeriodo>({
  historico,
  periodo,
  children,
}: {
  historico: T[];
  periodo: Periodo<T>;
  children?: React.ReactNode;
}) {
  const { escolha, sel, anterior } = periodo;
  if (!escolha) return null;
  const anos = anosDisponiveis(historico);
  const visoes = visoesDoAno(historico, escolha.ano);
  const opcoes = opcoesDoAno(historico, escolha.ano, escolha.visao);
  const soAcumulado = visoes.some((v) => !v.disponivel && v.motivo?.includes("de uma vez"));

  return (
    <section className="cartao space-y-3 p-3 print:hidden" aria-label="Escolha do período">
      <div className="flex flex-wrap items-end gap-3">
        <label className="campo min-w-[96px]">
          <span>Ano</span>
          <select
            aria-label="Ano"
            value={escolha.ano}
            onChange={(e) => periodo.mudar({ ...escolha, ano: Number(e.target.value) })}
            title="Só aparecem os anos que têm balancete importado"
          >
            {anos.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <div className="campo">
          <span id="rotulo-visao">Visão</span>
          <div
            className="flex flex-wrap rounded-lg border border-[var(--borda)] bg-white p-0.5 text-sm"
            role="group"
            aria-labelledby="rotulo-visao"
          >
            {visoes.map((v) => (
              <button
                key={v.id}
                type="button"
                disabled={!v.disponivel}
                aria-pressed={escolha.visao === v.id}
                title={v.motivo ? `Indisponível: ${v.motivo}.` : `Ver por ${v.nome.toLowerCase()}`}
                className={`rounded-md px-3 py-1 ${escolha.visao === v.id ? "bg-[var(--marca)] text-white" : ""} disabled:cursor-not-allowed disabled:text-neutral-300`}
                onClick={() => periodo.mudarVisao(v.id)}
              >
                {v.nome}
              </button>
            ))}
          </div>
        </div>
        <label className="campo min-w-[170px]">
          <span>Qual período</span>
          <select
            aria-label="Qual período"
            value={escolha.numero}
            onChange={(e) => periodo.mudar({ ...escolha, numero: Number(e.target.value) })}
            disabled={opcoes.length === 1}
          >
            {opcoes.map((o) => (
              <option key={o.numero} value={o.numero} disabled={!o.disponivel} title={o.motivo ?? undefined}>
                {o.nome}
                {o.disponivel ? "" : " · sem balancete"}
              </option>
            ))}
          </select>
        </label>
        {children && <div className="ml-auto flex flex-wrap items-end gap-2">{children}</div>}
      </div>

      {sel && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span
            className={`chip max-w-full whitespace-normal ${sel.completo ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}
            title={sel.completo ? "Todos os meses do período estão no Hub" : "Os números somam só os meses importados"}
          >
            {sel.completo ? "✓" : "!"} {sel.completude}
          </span>
          <span className="chip max-w-full whitespace-normal bg-[var(--fundo)] text-neutral-700">
            {anterior ? `Comparando com ${anterior.rotulo}` : `Sem o mesmo período de ${escolha.ano - 1} para comparar`}
          </span>
        </div>
      )}
      {soAcumulado && (
        <p className="text-xs text-neutral-600">
          Em {escolha.ano}, este cliente enviou o balancete do ano inteiro de uma vez: por isso Mês, Trimestre e Semestre ficam
          indisponíveis. Para ver mês a mês, importe os balancetes mensais desse ano.
        </p>
      )}
    </section>
  );
}
