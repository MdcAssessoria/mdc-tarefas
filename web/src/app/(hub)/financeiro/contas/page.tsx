// Tela Contas do MDC · Pessoal no celular (desenho de 14/11/2026): abas A pagar / A receber / Pagas no mês, cada conta
// numa linha agrupada por quando vence (Atrasadas, Hoje, 7 dias, depois), com Pagar/Recebi à mão. Fora da família
// (equipe da MDC) esta rota leva à lista completa de Contas a pagar.
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { brl } from "@/lib/formato/moeda";
import { Icone } from "@/components/ui/Icone";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { agruparAbertas, falta, limitesDoMes, quitada } from "@/dominios/pessoal/app";
import type { ContaApp, GrupoContas } from "@/dominios/pessoal/app";
import { useFinancasFamilia } from "@/dominios/pessoal/componentes/app/dados";
import { LinhaConta } from "@/dominios/pessoal/componentes/app/LinhaConta";
import { PagarConta } from "@/dominios/pessoal/componentes/app/PagarConta";

type Aba = "pagar" | "receber" | "pagas";
const ABAS: { id: Aba; nome: string }[] = [
  { id: "pagar", nome: "A pagar" },
  { id: "receber", nome: "A receber" },
  { id: "pagas", nome: "Pagas no mês" },
];
const TOM_GRUPO: Record<string, string> = { atrasada: "text-red-700", hoje: "text-amber-800" };

export default function ContasDaFamilia() {
  const { pessoal } = useOrg();
  const router = useRouter();
  useEffect(() => {
    if (!pessoal) router.replace("/financeiro/pagar");
  }, [pessoal, router]);
  return pessoal ? <Contas /> : null;
}

function Contas() {
  const { pode } = useOrg();
  const fin = useFinancasFamilia();
  const { hoje } = fin;
  const [aba, setAba] = useState<Aba>("pagar");
  const [aberta, setAberta] = useState<ContaApp | null>(null);
  const contas = fin.dados?.contas ?? [];
  const podePagar = pode("financeiro", "operar");

  let grupos: GrupoContas[];
  let resumo: string;
  if (aba === "pagas") {
    const { de, ate } = limitesDoMes(hoje);
    const pagas = contas
      .filter((c) => quitada(c) && c.quitado_em && c.quitado_em.slice(0, 10) >= de && c.quitado_em.slice(0, 10) <= ate)
      .sort((a, b) => (b.quitado_em ?? "").localeCompare(a.quitado_em ?? ""));
    grupos = pagas.length ? [{ quando: "hoje", titulo: "Pagas e recebidas", total: pagas.reduce((t, c) => t + c.valor, 0), contas: pagas }] : [];
    resumo = pagas.length ? `${pagas.length} conta(s) resolvida(s) este mês` : "Nada pago ainda este mês";
  } else {
    grupos = agruparAbertas(contas, aba, hoje);
    const total = grupos.reduce((t, g) => t + g.contas.reduce((s, c) => s + falta(c), 0), 0);
    resumo = `${aba === "pagar" ? "Falta pagar" : "Falta receber"} ${brl(total)}`;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-[26px] text-[var(--marca)] sm:text-3xl">Contas</h1>
        <Link href={aba === "receber" ? "/financeiro/receber" : "/financeiro/pagar"} className="btn !min-h-10 text-sm">
          <Icone nome="lista" className="h-4 w-4" />
          Lista completa
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#E9E5D9] p-1" role="tablist" aria-label="Quais contas ver">
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={aba === a.id}
            onClick={() => setAba(a.id)}
            className={`min-h-10 rounded-lg text-sm font-semibold transition ${aba === a.id ? "bg-white text-[var(--marca)] shadow-sm" : "text-neutral-600"}`}
          >
            {a.nome}
          </button>
        ))}
      </div>

      {fin.erro && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {fin.erro}
        </p>
      )}

      {!fin.dados ? (
        <Esqueleto />
      ) : (
        <>
          <p className="text-sm text-neutral-600">{resumo}</p>
          {grupos.length ? (
            grupos.map((g) => (
              <section key={g.titulo}>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <h2 className={`text-[13px] font-bold uppercase tracking-wide ${TOM_GRUPO[g.quando] ?? "text-[var(--marca)]"}`}>{g.titulo}</h2>
                  <span className="num text-[13px] text-neutral-500">{brl(g.total)}</span>
                </div>
                <ul className="rounded-[18px] border border-[var(--borda)] bg-white px-3.5">
                  {g.contas.map((c) => (
                    <LinhaConta
                      key={c.id}
                      c={c}
                      hoje={hoje}
                      botao={podePagar && !quitada(c) && (c.tipo === "receber" || g.quando === "atrasada" || g.quando === "hoje")}
                      aoAbrir={() => setAberta(c)}
                      aoPagar={() => setAberta(c)}
                    />
                  ))}
                </ul>
              </section>
            ))
          ) : (
            <div className="rounded-[18px] border border-dashed border-[var(--borda)] p-6 text-center text-sm text-neutral-600">
              <Icone nome="check" className="mx-auto mb-2 h-8 w-8 text-emerald-700" />
              {aba === "pagas" ? "Quando você pagar uma conta, ela aparece aqui." : "Nada em aberto aqui. Toque no + para lançar uma conta."}
            </div>
          )}
        </>
      )}

      {aberta && fin.dados && <PagarConta conta={aberta} bancos={fin.dados.bancos} hoje={hoje} podePagar={podePagar} aoFechar={() => setAberta(null)} />}
    </div>
  );
}
