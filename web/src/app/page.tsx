"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Icone } from "@/components/Icone";
import { PrazoBadge, PrioridadeDot } from "@/components/Badges";
import { useOrg } from "@/lib/org";
import { supabase } from "@/lib/supabase";
import { hojeISO } from "@/lib/datas";
import { caminho } from "@/lib/caminho";
import { traduzirErro } from "@/lib/erros";
import { PAPEIS_APP } from "@/lib/types";
import type { HubApp, Prioridade, Status } from "@/lib/types";

export default function Inicio() {
  return (
    <AppShell modulo="hub">
      <Hub />
    </AppShell>
  );
}

interface Resumo {
  tarefasAtrasadas?: number;
  tarefasHoje?: number;
  tarefasSemana?: number;
  processosParados?: number;
  atendimentosNovos?: number;
  vencimentos30?: number;
  balancetesRascunho?: number;
}

interface MinhaTarefa {
  id: string;
  titulo: string;
  prazo: string | null;
  status: Status;
  prioridade: Prioridade;
  cliente_id: string | null;
}

function saudacao(fuso: string) {
  const h = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: fuso }));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

function Hub() {
  const { org, eu, apps, pode, papel, clientePorId } = useOrg();
  const [r, setR] = useState<Resumo>({});
  const [fila, setFila] = useState<MinhaTarefa[] | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const hoje = hojeISO(org.fuso);

  useEffect(() => {
    if (papel === "tv") window.location.replace(caminho("/tv"));
  }, [papel]);

  // indicadores do dia (só do que a pessoa pode ver), todos em paralelo
  useEffect(() => {
    const sb = supabase();
    const em7 = new Date(Date.parse(hoje) + 7 * 864e5).toISOString().slice(0, 10);
    const em30 = new Date(Date.parse(hoje) + 30 * 864e5).toISOString().slice(0, 10);
    const parado = new Date(Date.now() - 5 * 864e5).toISOString();
    const conta = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
    (async () => {
      const novo: Resumo = {};
      const pedidos: Promise<void>[] = [];
      const add = (k: keyof Resumo, q: PromiseLike<{ count: number | null }>) => pedidos.push(conta(q).then((n) => void (novo[k] = n)));
      const abertas = () =>
        sb.from("tarefas").select("id", { count: "exact", head: true }).eq("org_id", org.id).in("status", ["a_fazer", "em_andamento", "aguardando"]);
      if (pode("tarefas")) {
        add("tarefasAtrasadas", abertas().lt("prazo", hoje));
        add("tarefasHoje", abertas().eq("prazo", hoje));
        add("tarefasSemana", abertas().gt("prazo", hoje).lte("prazo", em7));
      }
      if (pode("societario"))
        add(
          "processosParados",
          sb.from("soc_fases").select("id", { count: "exact", head: true }).eq("org_id", org.id)
            .in("status", ["em_andamento", "aguardando_cliente", "aguardando_orgao"]).lt("mudou_em", parado),
        );
      if (pode("atendimento"))
        add("atendimentosNovos", sb.from("portal_conversas").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("status", "novo"));
      if (pode("vencimentos"))
        add("vencimentos30", sb.from("venc_itens").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("status", "ativo").lte("vence_em", em30));
      if (pode("demonstrativos"))
        add("balancetesRascunho", sb.from("portal_balancetes").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("status", "rascunho"));
      await Promise.all(pedidos);
      setR(novo);
    })();
  }, [org.id, hoje, pode]);

  // a fila da pessoa: atrasadas e as dos próximos 7 dias
  const carregarFila = useCallback(async () => {
    if (!pode("tarefas")) return setFila([]);
    const em7 = new Date(Date.parse(hoje) + 7 * 864e5).toISOString().slice(0, 10);
    const { data } = await supabase()
      .from("tarefas")
      .select("id,titulo,prazo,status,prioridade,cliente_id")
      .eq("org_id", org.id)
      .eq("responsavel_id", eu.user_id)
      .in("status", ["a_fazer", "em_andamento", "aguardando"])
      .lte("prazo", em7)
      .order("prazo")
      .limit(8);
    setFila((data as MinhaTarefa[]) ?? []);
  }, [org.id, eu.user_id, hoje, pode]);

  useEffect(() => {
    carregarFila();
  }, [carregarFila]);

  async function concluir(t: MinhaTarefa) {
    setFila((f) => f?.filter((x) => x.id !== t.id) ?? f);
    const { error } = await supabase().from("tarefas").update({ status: "concluida" }).eq("id", t.id);
    if (error) {
      setAviso(traduzirErro(error));
      carregarFila();
    } else {
      setAviso(`Concluída: ${t.titulo}`);
      setTimeout(() => setAviso(null), 4000);
    }
  }

  const liberadas = apps.filter((a) => a.papel && a.status !== "em_breve");
  const embreve = papel === "admin" ? apps.filter((a) => a.status === "em_breve") : [];
  const primeiroNome = eu.nome.split(" ")[0];
  const data = new Date(hoje + "T12:00:00Z").toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

  const livro: { rotulo: string; valor?: number; href: string; alerta?: boolean }[] = [
    { rotulo: "tarefas atrasadas", valor: r.tarefasAtrasadas, href: "/tarefas", alerta: true },
    { rotulo: "vencem hoje", valor: r.tarefasHoje, href: "/tarefas" },
    { rotulo: "nos próximos 7 dias", valor: r.tarefasSemana, href: "/tarefas" },
    { rotulo: "atendimentos novos", valor: r.atendimentosNovos, href: "/atendimento", alerta: true },
    { rotulo: "vencimentos em 30 dias", valor: r.vencimentos30, href: "/vencimentos", alerta: true },
    { rotulo: "fases paradas há 5 dias", valor: r.processosParados, href: "/societario", alerta: true },
    { rotulo: "balancetes a publicar", valor: r.balancetesRascunho, href: "/demonstrativos" },
  ].filter((i) => i.valor !== undefined);

  return (
    <div className="space-y-9">
      <header className="flex flex-wrap items-end justify-between gap-4 pt-2">
        <div>
          <p className="text-[14px] text-[var(--texto-suave)]">{data.charAt(0).toUpperCase() + data.slice(1)}</p>
          <h1 className="font-display mt-1 text-[40px] font-medium leading-[1.05] text-[var(--marca)] sm:text-[48px]">
            {saudacao(org.fuso)}, {primeiroNome}
          </h1>
        </div>
        {pode("tarefas") && (
          <Link href="/tarefas?nova=1" className="btn-primario">
            <Icone nome="mais" className="h-4 w-4" /> Nova tarefa
          </Link>
        )}
      </header>

      {/* livro do dia: os números que pedem ação, lado a lado como colunas de um razão */}
      {livro.length > 0 && (
        <section aria-label="Resumo do dia" className="overflow-hidden rounded-2xl border border-[var(--borda)] bg-white">
          <div className="grid grid-cols-2 divide-x divide-y divide-[var(--borda)] sm:grid-cols-3 lg:flex lg:divide-y-0">
            {livro.map((i) => {
              const quente = i.alerta && (i.valor ?? 0) > 0;
              return (
                <Link key={i.rotulo} href={i.href} className="group relative min-w-0 flex-1 px-5 py-4 transition-colors hover:bg-[var(--fundo)]">
                  {quente && <span className="absolute inset-x-0 top-0 h-[3px] bg-[var(--perigo)]" aria-hidden="true" />}
                  <div className={`font-display num text-[38px] font-medium leading-none ${quente ? "text-[var(--perigo)]" : "text-[var(--marca)]"}`}>{i.valor}</div>
                  <div className="mt-2 text-[13px] leading-snug text-[var(--texto-suave)] group-hover:text-[var(--marca)]">{i.rotulo}</div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <div className={`grid grid-cols-1 gap-8 ${pode("tarefas") ? "lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]" : ""}`}>
        {pode("tarefas") && (
          <section aria-labelledby="fila" className="min-w-0">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 id="fila" className="text-[17px] font-semibold text-[var(--marca)]">
                Sua fila
              </h2>
              <Link href="/tarefas" className="text-[13px] text-[var(--destaque-escuro)] hover:underline">
                Ver todas as suas tarefas
              </Link>
            </div>
            {aviso && <p className="mb-2 rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-900">{aviso}</p>}
            <div className="overflow-hidden rounded-2xl border border-[var(--borda)] bg-white">
              {fila === null ? (
                <p className="px-5 py-8 text-[14px] text-[var(--texto-suave)]">Carregando sua fila…</p>
              ) : fila.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <p className="font-display text-[22px] text-[var(--marca)]">Fila em dia</p>
                  <p className="mt-1 text-[14px] text-[var(--texto-suave)]">Nada atrasado nem vencendo nos próximos 7 dias com você.</p>
                </div>
              ) : (
                <ul className="divide-y divide-[var(--borda)]">
                  {fila.map((t) => {
                    const c = clientePorId(t.cliente_id);
                    return (
                      <li key={t.id} className="group flex items-center gap-3 px-4 py-3 hover:bg-[var(--fundo)]/60">
                        <button
                          onClick={() => concluir(t)}
                          className="grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-[var(--borda)] text-transparent transition-colors hover:border-[var(--sucesso)] hover:text-[var(--sucesso)]"
                          aria-label={`Concluir ${t.titulo}`}
                          title="Concluir"
                        >
                          <Icone nome="check" className="h-3.5 w-3.5" />
                        </button>
                        <Link href={c ? `/tarefas?cliente=${c.id}` : "/tarefas"} className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <PrioridadeDot p={t.prioridade} />
                            <span className="truncate text-[14px] font-medium">{t.titulo}</span>
                          </div>
                          <div className="truncate pl-[18px] text-[12px] text-[var(--texto-suave)]">{c ? c.nome_fantasia || c.razao_social : "Interna"}</div>
                        </Link>
                        <PrazoBadge prazo={t.prazo} status={t.status} fuso={org.fuso} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        )}

        <section aria-labelledby="ferramentas" className="min-w-0">
          <h2 id="ferramentas" className="mb-3 text-[17px] font-semibold text-[var(--marca)]">
            Ferramentas
          </h2>
          {liberadas.length === 0 ? (
            <p className="rounded-2xl border border-[var(--borda)] bg-white p-6 text-[14px] text-[var(--texto-suave)]">
              Nenhuma ferramenta liberada para você ainda. Fale com o administrador do Hub.
            </p>
          ) : (
            <ul className={`grid grid-cols-1 gap-2 ${pode("tarefas") ? "" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
              {liberadas.map((a) => (
                <li key={a.slug}>
                  <Ferramenta app={a} />
                </li>
              ))}
            </ul>
          )}
          {embreve.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-2 text-[13px] text-[var(--texto-suave)]">Em construção (visível só para administradores)</h3>
              <ul className="flex flex-wrap gap-2">
                {embreve.map((a) => (
                  <li key={a.slug} className="flex items-center gap-2 rounded-full border border-dashed border-[var(--borda)] bg-white px-3 py-1.5 text-[13px] text-[var(--texto-suave)]">
                    <Icone nome={a.icone} className="h-4 w-4" />
                    {a.nome}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Ferramenta({ app }: { app: HubApp }) {
  const corpo = (
    <>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--marca)] text-[var(--destaque)] transition-transform group-hover:scale-[1.04]">
        <Icone nome={app.icone} className="h-[22px] w-[22px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="font-semibold text-[var(--texto)] group-hover:text-[var(--marca)]">{app.slug === "comercial" ? "CRM Comercial" : app.nome}</span>
          {app.externo && <Icone nome="externo" className="h-3.5 w-3.5 text-[var(--texto-suave)]" />}
        </span>
        <span className="block truncate text-[13px] text-[var(--texto-suave)]">{app.descricao}</span>
      </span>
      {app.papel && (
        <span className="shrink-0 rounded-full bg-[var(--fundo)] px-2.5 py-0.5 text-[12px] text-[var(--texto-suave)]" title="Seu nível nesta ferramenta">
          {PAPEIS_APP.find((p) => p.id === app.papel)?.nome}
        </span>
      )}
    </>
  );
  const cls = "group flex items-center gap-4 rounded-2xl border border-[var(--borda)] bg-white px-4 py-3 transition-colors hover:border-[var(--destaque-escuro)]";
  return app.externo ? (
    <a href={app.rota} target="_blank" rel="noopener" className={cls}>
      {corpo}
    </a>
  ) : (
    <Link href={app.rota} className={cls}>
      {corpo}
    </Link>
  );
}
