"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Icone } from "@/components/Icone";
import { useOrg } from "@/lib/org";
import { supabase } from "@/lib/supabase";
import { hojeISO } from "@/lib/datas";
import type { HubApp } from "@/lib/types";

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
  processosAbertos?: number;
  processosParados?: number;
  atendimentosNovos?: number;
  vencimentos30?: number;
  balancetesRascunho?: number;
}

function Hub() {
  const { org, eu, apps, pode, papel } = useOrg();
  const [r, setR] = useState<Resumo>({});

  useEffect(() => {
    if (papel === "tv") window.location.replace("/tv");
  }, [papel]);

  useEffect(() => {
    const sb = supabase();
    const hoje = hojeISO(org.fuso);
    const em30 = new Date(Date.parse(hoje) + 30 * 864e5).toISOString().slice(0, 10);
    const parado = new Date(Date.now() - 5 * 864e5).toISOString();
    const conta = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
    (async () => {
      const novo: Resumo = {};
      if (pode("tarefas")) {
        const base = () =>
          sb.from("tarefas").select("id", { count: "exact", head: true }).eq("org_id", org.id)
            .in("status", ["a_fazer", "em_andamento", "aguardando"]);
        novo.tarefasAtrasadas = await conta(base().lt("prazo", hoje));
        novo.tarefasHoje = await conta(base().eq("prazo", hoje));
      }
      if (pode("societario")) {
        novo.processosAbertos = await conta(
          sb.from("soc_processos").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("status", "aberto"),
        );
        novo.processosParados = await conta(
          sb.from("soc_fases").select("id", { count: "exact", head: true }).eq("org_id", org.id)
            .in("status", ["em_andamento", "aguardando_cliente", "aguardando_orgao"]).lt("mudou_em", parado),
        );
      }
      if (pode("atendimento")) {
        novo.atendimentosNovos = await conta(
          sb.from("portal_conversas").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("status", "novo"),
        );
      }
      if (pode("vencimentos")) {
        novo.vencimentos30 = await conta(
          sb.from("venc_itens").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("status", "ativo").lte("vence_em", em30),
        );
      }
      if (pode("demonstrativos")) {
        novo.balancetesRascunho = await conta(
          sb.from("portal_balancetes").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("status", "rascunho"),
        );
      }
      setR(novo);
    })();
  }, [org.id, org.fuso, pode]);

  const liberadas = apps.filter((a) => a.papel && a.status !== "em_breve");
  const bloqueadas = apps.filter((a) => !a.papel && a.status !== "em_breve");
  const embreve = apps.filter((a) => a.status === "em_breve");
  const primeiroNome = eu.nome.split(" ")[0];

  const indicadores: { rotulo: string; valor?: number; href: string; alerta?: boolean }[] = [
    { rotulo: "Tarefas atrasadas", valor: r.tarefasAtrasadas, href: "/tarefas", alerta: true },
    { rotulo: "Vencem hoje", valor: r.tarefasHoje, href: "/tarefas" },
    { rotulo: "Processos societários abertos", valor: r.processosAbertos, href: "/societario" },
    { rotulo: "Fases paradas há 5+ dias", valor: r.processosParados, href: "/societario", alerta: true },
    { rotulo: "Atendimentos novos", valor: r.atendimentosNovos, href: "/atendimento", alerta: true },
    { rotulo: "Vencimentos em 30 dias", valor: r.vencimentos30, href: "/vencimentos", alerta: true },
    { rotulo: "Balancetes a publicar", valor: r.balancetesRascunho, href: "/demonstrativos" },
  ].filter((i) => i.valor !== undefined);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--marca)]">Olá, {primeiroNome}</h1>
          <p className="text-sm text-neutral-600">Suas ferramentas e o que pede atenção hoje.</p>
        </div>
        {papel === "admin" && (
          <Link href="/hub/acessos" className="btn">
            <Icone nome="pessoas" className="h-4 w-4" /> Pessoas e acessos
          </Link>
        )}
      </div>

      {indicadores.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
          {indicadores.map((i) => (
            <Link key={i.rotulo} href={i.href} className="cartao p-3 hover:border-[var(--destaque-escuro)]">
              <div
                className={`text-2xl font-semibold tabular-nums ${
                  i.alerta && (i.valor ?? 0) > 0 ? "text-[var(--perigo)]" : "text-[var(--marca)]"
                }`}
              >
                {i.valor}
              </div>
              <div className="text-xs text-neutral-600">{i.rotulo}</div>
            </Link>
          ))}
        </div>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">Suas ferramentas</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {liberadas.map((a) => (
            <CartaoApp key={a.slug} app={a} />
          ))}
        </div>
      </section>

      {bloqueadas.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">Disponíveis com liberação</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {bloqueadas.map((a) => (
              <CartaoApp key={a.slug} app={a} bloqueado />
            ))}
          </div>
        </section>
      )}

      {embreve.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">Em construção</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {embreve.map((a) => (
              <CartaoApp key={a.slug} app={a} bloqueado />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function CartaoApp({ app, bloqueado }: { app: HubApp; bloqueado?: boolean }) {
  const corpo = (
    <div className={`cartao flex h-full gap-3 p-4 ${bloqueado ? "opacity-60" : "hover:border-[var(--destaque-escuro)]"}`}>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--marca)] text-[var(--destaque)]">
        <Icone nome={app.icone} className="h-6 w-6" />
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{app.nome}</span>
          {app.status === "beta" && <span className="chip bg-amber-50 text-amber-800">beta</span>}
          {app.status === "em_breve" && <span className="chip bg-neutral-100 text-neutral-600">em breve</span>}
          {app.externo && !bloqueado && <Icone nome="externo" className="h-3.5 w-3.5 text-neutral-400" />}
        </div>
        <p className="mt-0.5 text-sm text-neutral-600">{app.descricao}</p>
        {bloqueado && app.status !== "em_breve" && (
          <p className="mt-1 text-xs text-neutral-500">Peça a liberação ao administrador.</p>
        )}
      </div>
    </div>
  );
  if (bloqueado) return corpo;
  return (
    <a href={app.rota} target={app.externo ? "_blank" : undefined} rel={app.externo ? "noopener" : undefined}>
      {corpo}
    </a>
  );
}
