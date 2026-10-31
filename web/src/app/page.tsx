"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Icone } from "@/components/Icone";
import { PrazoBadge, PrioridadeDot } from "@/components/Badges";
import { CORES_RITMO, RitmoSemanal } from "@/components/RitmoSemanal";
import type { SemanaRitmo } from "@/components/RitmoSemanal";
import { useOrg } from "@/lib/org";
import { supabase } from "@/lib/supabase";
import { hojeISO, somarDias } from "@/lib/datas";
import { caminho } from "@/lib/caminho";
import { traduzirErro } from "@/lib/erros";
import type { Prioridade, Status } from "@/lib/types";
import { fmtData } from "@/lib/formato/datas";

export default function Inicio() {
  return (
    <AppShell modulo="hub">
      <Hub />
    </AppShell>
  );
}

interface MinhaTarefa {
  id: string;
  titulo: string;
  prazo: string | null;
  status: Status;
  prioridade: Prioridade;
  cliente_id: string | null;
  concluida_em: string | null;
}

const ABERTAS: Status[] = ["a_fazer", "em_andamento", "aguardando"];

function saudacao(fuso: string) {
  const h = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: fuso }));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

const segunda = (iso: string) => {
  const d = new Date(iso + "T12:00:00Z").getUTCDay(); // 0 = domingo
  return somarDias(iso, d === 0 ? -6 : 1 - d);
};

function Hub() {
  const { org, eu, pode, papel, clientePorId } = useOrg();
  const hoje = hojeISO(org.fuso);
  const [abertas, setAbertas] = useState<MinhaTarefa[] | null>(null);
  const [feitas, setFeitas] = useState<MinhaTarefa[]>([]);
  const [semanasAtras, setSemanasAtras] = useState(8);
  const [semanaSel, setSemanaSel] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const temTarefas = pode("tarefas");

  useEffect(() => {
    if (papel === "tv") window.location.replace(caminho("/tv"));
  }, [papel]);

  const inicioJanela = useMemo(() => somarDias(segunda(hoje), -7 * (semanasAtras - 1)), [hoje, semanasAtras]);

  const carregar = useCallback(async () => {
    if (!temTarefas) return setAbertas([]);
    const sb = supabase();
    const campos = "id,titulo,prazo,status,prioridade,cliente_id,concluida_em";
    const [a, f] = await Promise.all([
      sb
        .from("tarefas")
        .select(campos)
        .eq("org_id", org.id)
        .eq("responsavel_id", eu.user_id)
        .in("status", ABERTAS)
        .order("prazo", { nullsFirst: false })
        .limit(1000),
      sb
        .from("tarefas")
        .select(campos)
        .eq("org_id", org.id)
        .eq("responsavel_id", eu.user_id)
        .eq("status", "concluida")
        .gte("concluida_em", inicioJanela + "T03:00:00Z")
        .order("concluida_em", { ascending: false })
        .limit(2000),
    ]);
    if (a.error) return setAviso(traduzirErro(a.error));
    setAbertas((a.data as MinhaTarefa[]) ?? []);
    setFeitas((f.data as MinhaTarefa[]) ?? []);
  }, [temTarefas, org.id, eu.user_id, inicioJanela]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const diaLocal = useCallback((iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: org.fuso }), [org.fuso]);
  const noPrazo = useCallback((t: MinhaTarefa) => !t.prazo || !t.concluida_em || diaLocal(t.concluida_em) <= t.prazo, [diaLocal]);

  // números do dia, só da pessoa
  const n = useMemo(() => {
    const l = abertas ?? [];
    const em7 = somarDias(hoje, 7);
    const mes = hoje.slice(0, 7);
    const doMes = feitas.filter((t) => t.concluida_em && diaLocal(t.concluida_em).slice(0, 7) === mes);
    const doMesPrazo = doMes.filter((t) => t.prazo);
    return {
      atrasadas: l.filter((t) => t.prazo && t.prazo < hoje).length,
      hoje: l.filter((t) => t.prazo === hoje).length,
      semana: l.filter((t) => t.prazo && t.prazo > hoje && t.prazo <= em7).length,
      abertas: l.length,
      concluidasMes: doMes.length,
      pctPrazo: doMesPrazo.length ? Math.round((doMesPrazo.filter(noPrazo).length / doMesPrazo.length) * 100) : null,
    };
  }, [abertas, feitas, hoje, diaLocal, noPrazo]);

  // semanas: passadas (concluídas) + 4 à frente (previstas)
  const semanas = useMemo<SemanaRitmo[]>(() => {
    const atual = segunda(hoje);
    const lista: SemanaRitmo[] = [];
    for (let k = -(semanasAtras - 1); k <= 4; k++) {
      const ini = somarDias(atual, 7 * k);
      const fim = somarDias(ini, 6);
      const feitasSem = feitas.filter((t) => t.concluida_em && diaLocal(t.concluida_em) >= ini && diaLocal(t.concluida_em) <= fim);
      lista.push({
        inicio: ini,
        noPrazo: feitasSem.filter(noPrazo).length,
        atrasadas: feitasSem.filter((t) => !noPrazo(t)).length,
        previstas: (abertas ?? []).filter((t) => t.prazo && t.prazo >= (k === 0 ? hoje : ini) && t.prazo <= fim).length,
        atual: k === 0,
        futura: k > 0,
      });
    }
    return lista;
  }, [hoje, semanasAtras, feitas, abertas, diaLocal, noPrazo]);

  // abertas por cliente (onde está o meu trabalho)
  const porCliente = useMemo(() => {
    const m = new Map<string, { id: string | null; total: number; atrasadas: number }>();
    for (const t of abertas ?? []) {
      const k = t.cliente_id ?? "_interna";
      const v = m.get(k) ?? { id: t.cliente_id, total: 0, atrasadas: 0 };
      v.total++;
      if (t.prazo && t.prazo < hoje) v.atrasadas++;
      m.set(k, v);
    }
    return [...m.values()].sort((a, b) => b.atrasadas - a.atrasadas || b.total - a.total).slice(0, 7);
  }, [abertas, hoje]);

  // lista abaixo do gráfico: a semana clicada ou a fila (atrasadas + próximos 7 dias)
  const lista = useMemo(() => {
    if (semanaSel) {
      const fim = somarDias(semanaSel, 6);
      const sem = semanas.find((s) => s.inicio === semanaSel);
      const concl = feitas.filter((t) => t.concluida_em && diaLocal(t.concluida_em) >= semanaSel && diaLocal(t.concluida_em) <= fim);
      const prev = (abertas ?? []).filter((t) => t.prazo && t.prazo >= semanaSel && t.prazo <= fim);
      return sem?.futura ? prev : [...prev, ...concl];
    }
    const em7 = somarDias(hoje, 7);
    return (abertas ?? []).filter((t) => t.prazo && t.prazo <= em7).slice(0, 12);
  }, [semanaSel, semanas, feitas, abertas, hoje, diaLocal]);

  async function concluir(t: MinhaTarefa) {
    setAbertas((l) => l?.filter((x) => x.id !== t.id) ?? l);
    const { error } = await supabase().from("tarefas").update({ status: "concluida" }).eq("id", t.id);
    if (error) setAviso(traduzirErro(error));
    else setAviso(`Concluída: ${t.titulo}`);
    void carregar();
    setTimeout(() => setAviso(null), 4000);
  }

  const primeiroNome = eu.nome.split(" ")[0];
  const data = new Date(hoje + "T12:00:00Z").toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  const maxCli = Math.max(1, ...porCliente.map((c) => c.total));
  const nomeCli = (id: string | null) => {
    const c = clientePorId(id);
    return c ? c.nome_fantasia || c.razao_social : "Internas";
  };

  const livro: { rotulo: string; valor: string; href: string; quente?: boolean }[] = [
    { rotulo: "atrasadas", valor: String(n.atrasadas), href: "/tarefas", quente: n.atrasadas > 0 },
    { rotulo: "vencem hoje", valor: String(n.hoje), href: "/tarefas" },
    { rotulo: "nos próximos 7 dias", valor: String(n.semana), href: "/tarefas" },
    { rotulo: "abertas com você", valor: String(n.abertas), href: "/tarefas" },
    {
      rotulo: n.pctPrazo === null ? "concluídas no mês" : `concluídas no mês · ${n.pctPrazo}% no prazo`,
      valor: String(n.concluidasMes),
      href: "/tarefas/relatorio",
    },
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4 pt-2">
        <div>
          <p className="text-[14px] text-[var(--texto-suave)]">{data.charAt(0).toUpperCase() + data.slice(1)}</p>
          <h1 className="font-display mt-1 text-[40px] font-medium leading-[1.05] text-[var(--marca)] sm:text-[48px]">
            {saudacao(org.fuso)}, {primeiroNome}
          </h1>
        </div>
        {temTarefas && (
          <Link href="/tarefas?nova=1" className="btn-primario">
            <Icone nome="mais" className="h-4 w-4" /> Nova tarefa
          </Link>
        )}
      </header>

      {!temTarefas ? (
        <p className="max-w-xl rounded-2xl border border-[var(--borda)] bg-white p-6 text-[14px] text-[var(--texto-suave)]">
          Suas ferramentas estão no menu ao lado. Quando o módulo de Tarefas for liberado para você, o resumo do seu dia aparece aqui.
        </p>
      ) : (
        <>
          <section aria-label="Seu resumo" className="overflow-hidden rounded-2xl border border-[var(--borda)] bg-white">
            <div className="grid grid-cols-2 divide-x divide-y divide-[var(--borda)] sm:grid-cols-3 lg:flex lg:divide-y-0">
              {livro.map((i) => (
                <Link
                  key={i.rotulo}
                  href={i.href}
                  className="group relative min-w-0 flex-1 px-5 py-4 transition-colors hover:bg-[var(--fundo)]"
                >
                  {i.quente && <span className="absolute inset-x-0 top-0 h-[3px] bg-[var(--perigo)]" aria-hidden="true" />}
                  <div
                    className={`font-display num text-[38px] font-medium leading-none ${i.quente ? "text-[var(--perigo)]" : "text-[var(--marca)]"}`}
                  >
                    {abertas === null ? "·" : i.valor}
                  </div>
                  <div className="mt-2 text-[13px] leading-snug text-[var(--texto-suave)] group-hover:text-[var(--marca)]">{i.rotulo}</div>
                </Link>
              ))}
            </div>
          </section>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <section aria-labelledby="ritmo" className="min-w-0 rounded-2xl border border-[var(--borda)] bg-white p-5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 id="ritmo" className="text-[17px] font-semibold text-[var(--marca)]">
                    Seu ritmo por semana
                  </h2>
                  <p className="text-[13px] text-[var(--texto-suave)]">
                    Concluídas nas últimas semanas e o que vence nas próximas. Clique numa semana.
                  </p>
                </div>
                <div className="flex overflow-hidden rounded-lg border border-[var(--borda)] text-[13px]">
                  {[8, 16].map((k) => (
                    <button
                      key={k}
                      onClick={() => setSemanasAtras(k)}
                      className={`px-3 py-1 ${semanasAtras === k ? "bg-[var(--marca)] text-white" : "bg-white"}`}
                    >
                      {k} semanas
                    </button>
                  ))}
                </div>
              </div>
              <RitmoSemanal semanas={semanas} selecionada={semanaSel} aoSelecionar={setSemanaSel} />
              <div className="mt-1 flex flex-wrap gap-4 text-[12px] text-[var(--texto-suave)]">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CORES_RITMO.OK }} /> concluídas no prazo
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CORES_RITMO.ATRASO }} /> concluídas com atraso
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ border: `1.5px dashed ${CORES_RITMO.PREVISTA}` }} /> abertas que vencem
                </span>
              </div>
            </section>

            <section aria-labelledby="clientes" className="min-w-0 rounded-2xl border border-[var(--borda)] bg-white p-5">
              <h2 id="clientes" className="text-[17px] font-semibold text-[var(--marca)]">
                Onde está seu trabalho
              </h2>
              <p className="mb-3 text-[13px] text-[var(--texto-suave)]">Abertas com você por cliente. Vermelho = atrasadas.</p>
              {abertas === null ? (
                <p className="text-sm text-[var(--texto-suave)]">Carregando…</p>
              ) : porCliente.length === 0 ? (
                <p className="text-sm text-[var(--texto-suave)]">Nenhuma tarefa aberta com você.</p>
              ) : (
                <ul className="space-y-1">
                  {porCliente.map((c) => (
                    <li key={c.id ?? "_interna"}>
                      <Link
                        href={c.id ? `/tarefas?cliente=${c.id}` : "/tarefas"}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1.5 hover:bg-[var(--fundo)]"
                        title={`${nomeCli(c.id)}: ${c.total} aberta(s), ${c.atrasadas} atrasada(s)`}
                      >
                        <span className="truncate text-[14px]">{nomeCli(c.id)}</span>
                        <span className="num text-[13px] text-[var(--texto-suave)]">
                          {c.atrasadas > 0 && <b className="text-[var(--perigo)]">{c.atrasadas} · </b>}
                          {c.total}
                        </span>
                        <span className="col-span-2 flex h-1.5 overflow-hidden rounded-full bg-[var(--fundo)]">
                          <span className="h-full bg-[var(--perigo)]" style={{ width: `${(c.atrasadas / maxCli) * 100}%` }} />
                          <span className="h-full bg-[var(--marca)]" style={{ width: `${((c.total - c.atrasadas) / maxCli) * 100}%` }} />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section aria-labelledby="fila">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="fila" className="text-[17px] font-semibold text-[var(--marca)]">
                {semanaSel ? `Semana de ${fmtData(semanaSel)}` : "Sua fila"}
              </h2>
              <div className="flex gap-4 text-[13px]">
                {semanaSel && (
                  <button className="text-[var(--destaque-escuro)] hover:underline" onClick={() => setSemanaSel(null)}>
                    Voltar para a fila
                  </button>
                )}
                <Link href="/tarefas" className="text-[var(--destaque-escuro)] hover:underline">
                  Ver todas as suas tarefas
                </Link>
              </div>
            </div>
            {aviso && <p className="mb-2 rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-900">{aviso}</p>}
            <div className="overflow-hidden rounded-2xl border border-[var(--borda)] bg-white">
              {abertas === null ? (
                <p className="px-5 py-8 text-[14px] text-[var(--texto-suave)]">Carregando…</p>
              ) : lista.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <p className="font-display text-[22px] text-[var(--marca)]">{semanaSel ? "Nada nesta semana" : "Fila em dia"}</p>
                  <p className="mt-1 text-[14px] text-[var(--texto-suave)]">
                    {semanaSel
                      ? "Nenhuma tarefa sua concluída ou vencendo nesta semana."
                      : "Nada atrasado nem vencendo nos próximos 7 dias com você."}
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-[var(--borda)]">
                  {lista.map((t) => {
                    const c = clientePorId(t.cliente_id);
                    const feita = t.status === "concluida";
                    return (
                      <li key={t.id} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--fundo)]/60">
                        {feita ? (
                          <span
                            className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--sucesso)] text-white"
                            title="Concluída"
                          >
                            <Icone nome="check" className="h-3.5 w-3.5" />
                          </span>
                        ) : (
                          <button
                            onClick={() => concluir(t)}
                            className="grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-[var(--borda)] text-transparent transition-colors hover:border-[var(--sucesso)] hover:text-[var(--sucesso)]"
                            aria-label={`Concluir ${t.titulo}`}
                            title="Concluir"
                          >
                            <Icone nome="check" className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <Link href={c ? `/tarefas?cliente=${c.id}` : "/tarefas"} className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <PrioridadeDot p={t.prioridade} />
                            <span className={`truncate text-[14px] font-medium ${feita ? "text-[var(--texto-suave)] line-through" : ""}`}>
                              {t.titulo}
                            </span>
                          </div>
                          <div className="truncate pl-[18px] text-[12px] text-[var(--texto-suave)]">
                            {c ? c.nome_fantasia || c.razao_social : "Interna"}
                            {feita &&
                              t.concluida_em &&
                              ` · concluída em ${fmtData(diaLocal(t.concluida_em))}${noPrazo(t) ? "" : " (com atraso)"}`}
                          </div>
                        </Link>
                        {!feita && <PrazoBadge prazo={t.prazo} status={t.status} fuso={org.fuso} />}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
