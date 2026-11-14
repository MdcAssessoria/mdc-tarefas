// Barra de baixo do MDC · Pessoal no celular (desenho de 14/11/2026): Hoje, Contas, + (lançar), Tarefas e Família,
// sempre ao alcance do polegar. O + abre a folha "O que você quer lançar?". No computador a barra some e vale o menu
// lateral; o + fica como botão flutuante. Também mostra os avisos rápidos ("Aluguel: paga").
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { Icone } from "@/components/ui/Icone";
import type { NomeIcone } from "@/components/ui/Icone";
import { useFinancasFamilia } from "./dados";
import { LancamentoRapido } from "./LancamentoRapido";
import { FalarLancamento } from "./FalarLancamento";
import { AvisoRapido } from "./avisoRapido";

const ITENS: { href: string; nome: string; icone: NomeIcone; ativo: (r: string) => boolean }[] = [
  { href: "/", nome: "Hoje", icone: "casa", ativo: (r) => r === "/" },
  { href: "/financeiro/contas", nome: "Contas", icone: "carteira", ativo: (r) => r.startsWith("/financeiro") },
  { href: "/tarefas", nome: "Tarefas", icone: "check", ativo: (r) => r.startsWith("/tarefas") },
  { href: "/familia", nome: "Família", icone: "pessoas", ativo: (r) => r.startsWith("/familia") },
];

export function BarraPessoal() {
  const rota = usePathname() || "/";
  const { pode } = useOrg();
  const [folha, setFolha] = useState(false);
  const [lancar, setLancar] = useState<"pagar" | "receber" | "falar" | null>(null);
  const podeLancar = pode("financeiro", "operar");
  const itens = ITENS.filter((i) => (i.href === "/tarefas" ? pode("tarefas") : i.href.startsWith("/financeiro") ? pode("financeiro") : true));
  const item = (i: (typeof ITENS)[number]) => {
    const on = i.ativo(rota);
    return (
      <Link
        key={i.href}
        href={i.href}
        aria-current={on ? "page" : undefined}
        className={`flex min-h-12 flex-col items-center justify-center gap-0.5 text-[11px] ${on ? "font-bold text-[var(--marca)]" : "font-medium text-neutral-500"}`}
      >
        <Icone nome={i.icone} className={`h-6 w-6 ${on ? "text-[var(--marca)]" : ""}`} />
        {i.nome}
      </Link>
    );
  };
  const metade = Math.ceil(itens.length / 2);

  return (
    <>
      <nav
        aria-label="Telas do app"
        className="fixed inset-x-0 bottom-0 z-40 grid border-t border-[var(--borda)] bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),10px)] pt-1.5 backdrop-blur print:hidden lg:hidden"
        style={{ gridTemplateColumns: `repeat(${itens.length + (podeLancar ? 1 : 0)}, minmax(0, 1fr))` }}
      >
        {itens.slice(0, metade).map(item)}
        {podeLancar && (
          <button
            type="button"
            onClick={() => setFolha(true)}
            aria-label="Lançar gasto, entrada ou tarefa"
            className="-mt-7 grid h-14 w-14 place-items-center justify-self-center rounded-2xl bg-[var(--marca)] text-[var(--destaque)] shadow-[0_8px_18px_rgba(11,40,32,.3)] transition active:scale-95"
          >
            <Icone nome="mais" className="h-7 w-7" />
          </button>
        )}
        {itens.slice(metade).map(item)}
      </nav>

      {podeLancar && (
        <button
          type="button"
          onClick={() => setFolha(true)}
          className="btn-primario fixed bottom-6 right-6 z-40 hidden min-h-12 shadow-lg print:hidden lg:inline-flex"
        >
          <Icone nome="mais" className="h-5 w-5" />
          Lançar
        </button>
      )}

      {folha && <FolhaLancar aoFechar={() => setFolha(false)} aoEscolher={(t) => {
            setFolha(false);
            setLancar(t);
          }} />}
      {lancar && <Lancador tipo={lancar} aoFechar={() => setLancar(null)} />}
      <AvisoRapido />
    </>
  );
}

/** Carrega tipos de gasto e contas só quando a pessoa abre o lançamento. */
function Lancador({ tipo, aoFechar }: { tipo: "pagar" | "receber" | "falar"; aoFechar: () => void }) {
  const { dados, cliente, hoje } = useFinancasFamilia();
  if (!dados || !cliente) return null;
  if (tipo === "falar") return <FalarLancamento cliente={cliente} categorias={dados.categorias} bancos={dados.bancos} hoje={hoje} aoFechar={aoFechar} />;
  return <LancamentoRapido tipoInicial={tipo} cliente={cliente} categorias={dados.categorias} bancos={dados.bancos} hoje={hoje} aoFechar={aoFechar} />;
}

function FolhaLancar({ aoFechar, aoEscolher }: { aoFechar: () => void; aoEscolher: (t: "pagar" | "receber" | "falar") => void }) {
  const router = useRouter();
  const { pode } = useOrg();
  const opcao = (icone: NomeIcone, titulo: string, dica: string, tom: string, acao: () => void) => (
    <button
      type="button"
      onClick={acao}
      className="flex min-h-28 flex-col gap-2.5 rounded-2xl border border-[var(--borda)] bg-white p-4 text-left transition active:scale-[.97]"
    >
      <span className={`grid h-11 w-11 place-items-center rounded-xl ${tom}`}>
        <Icone nome={icone} className="h-6 w-6" />
      </span>
      <span>
        <b className="block text-base text-[var(--marca)]">{titulo}</b>
        <span className="text-[13px] text-neutral-600">{dica}</span>
      </span>
    </button>
  );
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="O que você quer lançar?">
      <button type="button" aria-label="Fechar" className="absolute inset-0 bg-[rgba(11,40,32,.45)]" onClick={aoFechar} />
      <section className="surgir absolute inset-x-0 bottom-0 mx-auto max-w-lg rounded-t-[26px] bg-[#F6F4EE] px-5 pb-[max(env(safe-area-inset-bottom),24px)] pt-2.5 shadow-2xl lg:bottom-6 lg:rounded-[26px]">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[#CFC9B8]" />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-2xl text-[var(--marca)]">O que você quer lançar?</h2>
          <button type="button" aria-label="Fechar" onClick={aoFechar} className="grid h-11 w-11 place-items-center rounded-xl text-[var(--marca)]">
            <Icone nome="fechar" className="h-6 w-6" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => aoEscolher("falar")}
          className="mb-2.5 flex w-full items-center gap-3 rounded-2xl bg-[var(--marca)] p-4 text-left text-white transition active:scale-[.98]"
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/10 text-[var(--destaque)]">
            <Icone nome="microfone" className="h-6 w-6" />
          </span>
          <span>
            <b className="block text-base">Falar</b>
            <span className="text-[13px] text-[#C6D3CC]">&quot;Paguei a luz 230 ontem&quot; · o app monta para você</span>
          </span>
        </button>
        <div className="grid grid-cols-2 gap-2.5">
          {opcao("seta-saida", "Um gasto", "Mercado, luz, escola…", "bg-red-50 text-red-700", () => aoEscolher("pagar"))}
          {opcao("seta-entrada", "Uma entrada", "Salário, aluguel, Pix…", "bg-emerald-50 text-emerald-800", () => aoEscolher("receber"))}
          {pode("tarefas") && opcao("check", "Uma tarefa", "Para você ou a casa", "bg-sky-50 text-sky-800", () => {
            aoFechar();
            router.push("/tarefas");
          })}
          {opcao("importar", "Extrato do banco", "Arquivo do app do banco", "bg-amber-50 text-amber-900", () => {
            aoFechar();
            router.push("/financeiro/extratos");
          })}
        </div>
      </section>
    </div>
  );
}
