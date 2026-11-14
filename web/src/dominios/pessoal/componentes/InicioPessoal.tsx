// Início do MDC · Pessoal (desenho do app no celular, 14/11/2026): numa tela só, quanto sobra no mês e quanto já foi
// pago, o que pede atenção (atrasado ou vencendo hoje, com Pagar à mão), os próximos 7 dias e as tarefas de hoje.
// Resumo diário e "Você tem empresa?" ficam na tela Família. Regras puras em dominios/pessoal/app.ts.
"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { supabase } from "@/lib/supabase";
import { useConsulta } from "@/lib/useConsulta";
import { horaNoFuso, saudacao } from "@/lib/datas";
import { brl } from "@/lib/formato/moeda";
import { fmtData } from "@/lib/formato/datas";
import { Icone } from "@/components/ui/Icone";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { agruparAbertas, resumoDoMes } from "../app";
import type { ContaApp } from "../app";
import { useFinancasFamilia } from "./app/dados";
import { LinhaConta } from "./app/LinhaConta";
import { PagarConta } from "./app/PagarConta";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function InicioPessoal() {
  const { org, eu, pode } = useOrg();
  const fin = useFinancasFamilia();
  const { hoje } = fin;
  const [aberta, setAberta] = useState<ContaApp | null>(null);
  const podePagar = pode("financeiro", "operar");

  const tarefas = useConsulta(
    useCallback(async () => {
      if (!pode("tarefas")) return { total: 0, primeira: null as string | null };
      const r = await supabase()
        .from("tarefas")
        .select("titulo", { count: "exact" })
        .eq("org_id", org.id)
        .in("status", ["a_fazer", "em_andamento", "aguardando"])
        .order("prazo", { ascending: true, nullsFirst: false })
        .range(0, 0);
      if (r.error) throw r.error;
      return { total: r.count ?? 0, primeira: (r.data?.[0] as { titulo: string } | undefined)?.titulo ?? null };
    }, [org.id, pode]),
  );

  const contas = fin.dados?.contas ?? [];
  const resumo = resumoDoMes(contas, hoje);
  const pagar = agruparAbertas(contas, "pagar", hoje);
  const receber = agruparAbertas(contas, "receber", hoje);
  const atencao = pagar.filter((g) => g.quando === "atrasada" || g.quando === "hoje").flatMap((g) => g.contas);
  const proximos = [
    ...pagar.filter((g) => g.quando === "semana").flatMap((g) => g.contas),
    ...receber.filter((g) => g.quando !== "depois").flatMap((g) => g.contas),
  ]
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
    .slice(0, 5);
  const mes = MESES[Number(hoje.slice(5, 7)) - 1];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <p className="text-[13px] text-neutral-500">
          {fmtData(hoje)} · {org.nome}
        </p>
        <h1 className="font-display text-[28px] leading-tight text-[var(--marca)] sm:text-4xl">
          {saudacao(horaNoFuso(org.fuso))}, {eu.nome.split(/\s+/)[0]}
        </h1>
      </div>

      {fin.erro && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {fin.erro}
        </p>
      )}

      {pode("financeiro") &&
        (!fin.dados ? (
          <Esqueleto />
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-[22px] bg-[var(--marca)] p-5 text-[#C6D3CC] lg:col-span-2">
              <p className="text-[13px]">Sobra prevista em {mes}</p>
              <p className={`num mt-1 text-4xl font-semibold tracking-tight ${resumo.sobra < 0 ? "text-red-300" : "text-white"}`}>{brl(resumo.sobra)}</p>
              <div className="mt-4 flex justify-between text-[13px]">
                <span>Contas do mês já pagas</span>
                <b className="text-[var(--destaque)]">{resumo.percentualPago}%</b>
              </div>
              <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
                <div className="h-full rounded-full bg-[var(--destaque)] transition-[width] duration-700" style={{ width: `${resumo.percentualPago}%` }} />
              </div>
              <p className="mt-2 text-[13px]">
                Pagou {brl(resumo.pago)} de {brl(resumo.totalPagar)}
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-[15px] font-semibold text-[var(--marca)]">Precisa da sua atenção</h2>
              {atencao.length ? (
                <ul className="rounded-[18px] border border-[var(--borda)] bg-white px-3.5">
                  {atencao.map((c) => (
                    <LinhaConta key={c.id} c={c} hoje={hoje} botao={podePagar} aoAbrir={() => setAberta(c)} aoPagar={() => setAberta(c)} />
                  ))}
                </ul>
              ) : (
                <div className="flex items-center gap-3 rounded-[18px] bg-emerald-50 p-4">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-700 text-white">
                    <Icone nome="check" className="h-6 w-6" />
                  </span>
                  <span>
                    <b className="block text-emerald-900">Tudo em dia!</b>
                    <span className="text-[13px] text-emerald-800">Nada atrasado nem vencendo hoje.</span>
                  </span>
                </div>
              )}
            </section>

            <section>
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-[15px] font-semibold text-[var(--marca)]">Próximos 7 dias</h2>
                <Link href="/financeiro/contas" className="text-sm font-semibold text-[#8A6A2A]">
                  Ver todas
                </Link>
              </div>
              {proximos.length ? (
                <ul className="rounded-[18px] border border-[var(--borda)] bg-white px-3.5">
                  {proximos.map((c) => (
                    <LinhaConta key={c.id} c={c} hoje={hoje} botao={false} aoAbrir={() => setAberta(c)} aoPagar={() => setAberta(c)} />
                  ))}
                </ul>
              ) : (
                <p className="rounded-[18px] border border-dashed border-[var(--borda)] p-4 text-sm text-neutral-600">
                  Nada vence nos próximos 7 dias. Toque no <b>+</b> para lançar uma conta.
                </p>
              )}
            </section>
          </div>
        ))}

      {pode("tarefas") && tarefas.dados && (
        <Link href="/tarefas" className="flex items-center gap-3 rounded-[18px] border border-[var(--borda)] bg-white p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-800">
            <Icone nome="check" className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <b className="block text-[15px] text-neutral-900">{tarefas.dados.total ? `${tarefas.dados.total} tarefa(s) em aberto` : "Nenhuma tarefa em aberto"}</b>
            <span className="block truncate text-[13px] text-neutral-600">{tarefas.dados.primeira ?? "Toque para ver ou criar tarefas"}</span>
          </span>
          <Icone nome="expandir" className="h-5 w-5 text-neutral-400" />
        </Link>
      )}

      {aberta && fin.dados && <PagarConta conta={aberta} bancos={fin.dados.bancos} hoje={hoje} podePagar={podePagar} aoFechar={() => setAberta(null)} />}
    </div>
  );
}
