// Início do MDC · Pessoal: saudação, resumo do dia das finanças (atrasadas, vence hoje, próximos 7 dias, a receber),
// tarefas em aberto e atalhos para lançar. Lê só a família da aba (RLS do banco); a regra do resumo é dominios/pessoal/resumo.
"use client";

import Link from "next/link";
import { useCallback } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { supabase } from "@/lib/supabase";
import { useConsulta } from "@/lib/useConsulta";
import { hojeISO, horaNoFuso, saudacao, somarDias } from "@/lib/datas";
import { brl } from "@/lib/formato/moeda";
import { fmtData } from "@/lib/formato/datas";
import { Icone } from "@/components/ui/Icone";
import type { NomeIcone } from "@/components/ui/Icone";
import { Esqueleto } from "@/components/ui/Esqueleto";
import { resumoDoDia, valorEmAberto } from "../resumo";
import type { GrupoResumo, TituloResumo } from "../resumo";

const ATALHOS: { href: string; nome: string; dica: string; icone: NomeIcone }[] = [
  { href: "/financeiro/pagar", nome: "Conta a pagar", dica: "Luz, escola, cartão, aluguel…", icone: "seta-saida" },
  { href: "/financeiro/receber", nome: "Valor a receber", dica: "Salário, aluguel recebido…", icone: "seta-entrada" },
  { href: "/financeiro/extratos", nome: "Importar extrato", dica: "Arquivo OFX ou planilha do banco", icone: "importar" },
  { href: "/familia", nome: "Convidar alguém", dica: "Quem mora com você", icone: "pessoas" },
];

export function InicioPessoal() {
  const { org, eu, pode } = useOrg();
  const hoje = hojeISO(org.fuso);
  const cliente = org.gestao_cliente_id ?? null;

  const consulta = useConsulta(
    useCallback(async () => {
      const sb = supabase();
      const [t, k] = await Promise.all([
        cliente && pode("financeiro")
          ? sb
              .from("fin_titulos")
              .select("id, tipo, descricao, vencimento, valor, valor_pago")
              .eq("org_id", org.id)
              .eq("cliente_id", cliente)
              .eq("situacao", "aberto")
              .lte("vencimento", somarDias(hoje, 7))
              .order("vencimento")
              .range(0, 999)
          : Promise.resolve({ data: [], error: null }),
        pode("tarefas")
          ? sb
              .from("tarefas")
              .select("id", { count: "exact", head: true })
              .eq("org_id", org.id)
              .in("status", ["a_fazer", "em_andamento", "aguardando"])
          : Promise.resolve({ count: 0, error: null }),
      ]);
      if (t.error) throw t.error;
      if (k.error) throw k.error;
      return { resumo: resumoDoDia((t.data ?? []) as TituloResumo[], hoje), tarefas: k.count ?? 0 };
    }, [org.id, cliente, hoje, pode]),
  );

  const primeiroNome = eu.nome.split(/\s+/)[0];
  const r = consulta.dados?.resumo;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-neutral-500">{fmtData(hoje)}</p>
        <h1 className="font-display text-3xl text-[var(--marca)] sm:text-4xl">
          {saudacao(horaNoFuso(org.fuso))}, {primeiroNome}
        </h1>
        <p className="mt-1 text-neutral-600">Este é o resumo das finanças da {org.nome}.</p>
      </div>

      {consulta.erro && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {consulta.erro}
        </p>
      )}

      {!consulta.dados ? (
        <Esqueleto />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Cartao titulo="Atrasadas" icone="alerta" grupo={r!.atrasadas} tom="erro" vazio="Nenhuma conta atrasada." />
          <Cartao titulo="Vencem hoje" icone="relogio" grupo={r!.hoje} tom="atencao" vazio="Nada vence hoje." />
          <Cartao titulo="Próximos 7 dias" icone="calendario" grupo={r!.proximos7} tom="neutro" vazio="Nada vence esta semana." />
          <Cartao titulo="A receber em 7 dias" icone="seta-entrada" grupo={r!.receber7} tom="ok" vazio="Nada a receber esta semana." />
        </div>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold text-[var(--marca)]">Lançar agora</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {ATALHOS.filter((a) => (a.href.startsWith("/financeiro") ? pode("financeiro", "operar") : true)).map((a) => (
            <Link key={a.href} href={a.href} className="cartao flex items-start gap-3 p-4 transition-shadow hover:shadow-md">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--marca)] text-[var(--destaque)]">
                <Icone nome={a.icone} className="h-5 w-5" />
              </span>
              <span>
                <b className="block text-[var(--marca)]">{a.nome}</b>
                <span className="text-sm text-neutral-600">{a.dica}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        {pode("financeiro") && (
          <Link href="/financeiro" className="btn">
            <Icone nome="grafico" className="h-4 w-4" />
            Ver o painel das finanças
          </Link>
        )}
        {pode("tarefas") && (
          <Link href="/tarefas" className="btn">
            <Icone nome="check" className="h-4 w-4" />
            Tarefas em aberto{consulta.dados ? `: ${consulta.dados.tarefas}` : ""}
          </Link>
        )}
      </div>
    </div>
  );
}

const TONS = {
  erro: "border-red-200 bg-red-50/60 text-red-800",
  atencao: "border-amber-200 bg-amber-50/60 text-amber-900",
  neutro: "border-[var(--borda)] bg-white text-[var(--marca)]",
  ok: "border-emerald-200 bg-emerald-50/60 text-emerald-800",
} as const;

function Cartao({
  titulo,
  icone,
  grupo,
  tom,
  vazio,
}: {
  titulo: string;
  icone: NomeIcone;
  grupo: GrupoResumo;
  tom: keyof typeof TONS;
  vazio: string;
}) {
  return (
    <section className={`min-w-0 rounded-2xl border p-4 ${TONS[tom]}`}>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Icone nome={icone} className="h-4 w-4" />
        {titulo}
      </div>
      <div className="num mt-2 text-2xl font-bold">{brl(grupo.total)}</div>
      {grupo.itens.length ? (
        <ul className="mt-3 space-y-1.5 text-sm text-neutral-700">
          {grupo.itens.slice(0, 4).map((t) => (
            <li key={t.id} className="flex justify-between gap-3">
              <span className="truncate">
                {t.descricao} <span className="text-neutral-500">· {fmtData(t.vencimento)}</span>
              </span>
              <span className="num shrink-0">{brl(valorEmAberto(t))}</span>
            </li>
          ))}
          {grupo.itens.length > 4 && <li className="text-neutral-500">e mais {grupo.itens.length - 4}</li>}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-neutral-600">{vazio}</p>
      )}
    </section>
  );
}
