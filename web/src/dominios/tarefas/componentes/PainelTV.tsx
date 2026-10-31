"use client";

import { useEffect, useRef, useState } from "react";
import { useOrgOpcional } from "@/dominios/organizacao/OrgProvider";
import { useLogo } from "@/lib/marca";
import type { Organizacao } from "@/dominios/organizacao/tipos";
import { nomeCliente } from "@/dominios/clientes/nome";

export interface Kpis {
  abertas: number;
  vencem_hoje: number;
  atrasadas: number;
  proximos_7_dias: number;
  em_andamento: number;
  concluidas_hoje: number;
  concluidas_mes: number;
  pct_no_prazo_mes: number | null;
}
export interface LinhaSetor {
  setor_id: string;
  nome: string;
  cor: string;
  abertas: number;
  atrasadas: number;
  concluidas_mes: number;
}
export interface LinhaResp {
  user_id: string;
  nome: string;
  abertas: number;
  atrasadas: number;
  concluidas_mes: number;
}
export interface Vencimento {
  id: string;
  titulo: string;
  prioridade: string;
  prazo: string;
  dias: number;
  cliente_curto: string | null;
  setor: string | null;
  setor_cor: string | null;
  responsavel: string | null;
}
export interface Concluida {
  id: string;
  titulo: string;
  responsavel_id: string | null;
  cliente_id: string | null;
  concluida_em: string;
}
export interface DadosPainel {
  kpis: Kpis | null;
  setores: LinhaSetor[];
  responsaveis: LinhaResp[];
  vencimentos: Vencimento[];
  concluidas: Concluida[];
}

const VERDE = "var(--marca)";
const OURO = "var(--destaque)";
const TEXTO_SUAVE = "#C6D3CC";
const VERMELHO = "#F97066";
const AMBAR = "#FDB022";

function Relogio({ fuso }: { fuso: string }) {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 10_000);
    return () => clearInterval(t);
  }, []);
  const hora = agora.toLocaleTimeString("pt-BR", { timeZone: fuso, hour: "2-digit", minute: "2-digit" });
  const bruto = agora.toLocaleDateString("pt-BR", { timeZone: fuso, weekday: "long", day: "numeric", month: "long" });
  const data = bruto.charAt(0).toUpperCase() + bruto.slice(1);
  return (
    <div className="text-right leading-tight">
      <div className="font-light text-white" style={{ fontSize: "2.6vw" }}>
        {hora}
      </div>
      <div style={{ color: TEXTO_SUAVE, fontSize: "0.95vw" }}>{data}</div>
    </div>
  );
}

function Kpi({ rotulo, valor, cor, sub }: { rotulo: string; valor: number | string; cor?: string; sub?: string }) {
  return (
    <div
      className="flex flex-col justify-between rounded-[0.8vw] border px-[1.2vw] py-[1vw]"
      style={{ borderColor: "rgba(226,193,126,.18)", background: "rgba(255,255,255,.04)" }}
    >
      <div className="uppercase tracking-wider" style={{ color: TEXTO_SUAVE, fontSize: "0.85vw" }}>
        {rotulo}
      </div>
      <div className="font-semibold tabular-nums leading-none" style={{ color: cor ?? "#fff", fontSize: "4.2vw" }}>
        {valor}
      </div>
      <div style={{ color: TEXTO_SUAVE, fontSize: "0.85vw", minHeight: "1.2vw" }}>{sub}</div>
    </div>
  );
}

function rotulo(d: number) {
  if (d < 0) return { txt: d === -1 ? "1 dia atrasada" : `${-d} dias atrasada`, cor: VERMELHO };
  if (d === 0) return { txt: "Hoje", cor: AMBAR };
  if (d === 1) return { txt: "Amanhã", cor: "#fff" };
  return { txt: `Em ${d} dias`, cor: TEXTO_SUAVE };
}

/** Lista que rola sozinha quando não cabe na tela (pausa no topo e no fim). */
function RolagemAutomatica({ children, chave }: { children: React.ReactNode; chave: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let pausa = 120; // ~4 s
    let dir = 1;
    const t = setInterval(() => {
      if (el.scrollHeight <= el.clientHeight + 2) return;
      if (pausa > 0) return void pausa--;
      el.scrollTop += dir;
      if (dir > 0 && el.scrollTop + el.clientHeight >= el.scrollHeight - 1) {
        pausa = 120;
        dir = -8;
      } else if (dir < 0 && el.scrollTop <= 0) {
        pausa = 120;
        dir = 1;
      }
    }, 33);
    return () => clearInterval(t);
  }, [chave]);
  return (
    <div ref={ref} className="min-h-0 flex-1 overflow-hidden">
      {children}
    </div>
  );
}

export function PainelTV({
  org,
  dados,
  online,
  atualizadoEm,
  nomeMembro,
  nomeDoCliente,
}: {
  org: Organizacao;
  dados: DadosPainel | null;
  online: boolean;
  atualizadoEm: Date | null;
  nomeMembro?: (id: string | null) => string;
  nomeDoCliente?: (id: string | null) => string;
}) {
  const ctx = useOrgOpcional();
  const nm = nomeMembro ?? ctx?.nomeMembro ?? (() => "");
  const nc =
    nomeDoCliente ??
    ((id: string | null) => {
      const c = ctx?.clientePorId(id);
      return nomeCliente(c, "");
    });

  const k = dados?.kpis;
  const maxSetor = Math.max(1, ...(dados?.setores ?? []).map((s) => s.abertas));
  const equipe = [...(dados?.responsaveis ?? [])]
    .filter((r) => r.abertas + r.concluidas_mes > 0)
    .sort((a, b) => b.atrasadas - a.atrasadas || b.abertas - a.abertas);

  const logoSrc = useLogo(org.logo_url);
  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden px-[2vw] py-[1.5vw] text-white"
      style={{ background: VERDE, fontSize: "1.05vw", cursor: "none" }}
    >
      {/* Cabeçalho */}
      <header className="flex items-center gap-[1.2vw] pb-[1.2vw]">
        {logoSrc ? (
          <img
            src={logoSrc}
            alt=""
            style={{ height: "3.2vw" }}
            className="object-contain"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
        ) : null}
        <div>
          <div className="font-semibold" style={{ color: OURO, fontSize: "1.6vw" }}>
            {org.nome}
          </div>
          <div style={{ color: TEXTO_SUAVE, fontSize: "0.95vw" }}>Painel de tarefas e obrigações</div>
        </div>
        <div className="ml-auto flex items-center gap-[2vw]">
          <div className="flex items-center gap-[0.5vw]" style={{ color: TEXTO_SUAVE, fontSize: "0.85vw" }}>
            <span
              className={`inline-block rounded-full ${online ? "animate-pulse" : ""}`}
              style={{ width: "0.7vw", height: "0.7vw", background: online ? "#32D583" : "#98A2B3" }}
            />
            {online ? "Ao vivo" : "Reconectando"}
            {atualizadoEm && ` · ${atualizadoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
          </div>
          <Relogio fuso={org.fuso} />
        </div>
      </header>

      {/* KPIs */}
      <section className="grid grid-cols-5 gap-[1vw]" style={{ height: "17vh" }}>
        <Kpi rotulo="Atrasadas" valor={k?.atrasadas ?? "–"} cor={k?.atrasadas ? VERMELHO : "#fff"} />
        <Kpi rotulo="Vencem hoje" valor={k?.vencem_hoje ?? "–"} cor={k?.vencem_hoje ? AMBAR : "#fff"} />
        <Kpi rotulo="Próximos 7 dias" valor={k?.proximos_7_dias ?? "–"} />
        <Kpi rotulo="Em andamento" valor={k?.em_andamento ?? "–"} sub={k ? `${k.abertas} abertas no total` : ""} />
        <Kpi
          rotulo="Concluídas no mês"
          valor={k?.concluidas_mes ?? "–"}
          cor={OURO}
          sub={k ? `${k.concluidas_hoje} hoje${k.pct_no_prazo_mes !== null ? ` · ${Math.round(k.pct_no_prazo_mes)}% no prazo` : ""}` : ""}
        />
      </section>

      {/* Corpo */}
      <section className="mt-[1.2vw] grid min-h-0 flex-1 grid-cols-3 gap-[1.2vw]">
        <div
          className="col-span-2 flex min-h-0 flex-col rounded-[0.8vw] border p-[1.2vw]"
          style={{ borderColor: "rgba(226,193,126,.18)", background: "rgba(0,0,0,.12)" }}
        >
          <h2 className="pb-[0.8vw] font-medium" style={{ color: OURO, fontSize: "1.25vw" }}>
            Atenção: atrasadas e próximos 3 dias
          </h2>
          {dados && dados.vencimentos.length === 0 ? (
            <div className="grid flex-1 place-items-center" style={{ color: TEXTO_SUAVE, fontSize: "1.4vw" }}>
              Nada pendente nos próximos dias.
            </div>
          ) : (
            <RolagemAutomatica chave={String(dados?.vencimentos.length ?? 0)}>
              <table className="w-full" style={{ fontSize: "1.05vw" }}>
                <tbody>
                  {(dados?.vencimentos ?? []).map((v) => {
                    const r = rotulo(v.dias);
                    return (
                      <tr key={v.id} className="border-b" style={{ borderColor: "rgba(255,255,255,.07)" }}>
                        <td className="whitespace-nowrap py-[0.55vw] pr-[1vw] font-semibold" style={{ color: r.cor, width: "11vw" }}>
                          {r.txt}
                        </td>
                        <td className="py-[0.55vw] pr-[1vw]">
                          <div className="line-clamp-1 font-medium text-white">
                            {(v.prioridade === "urgente" || v.prioridade === "alta") && (
                              <span style={{ color: v.prioridade === "urgente" ? VERMELHO : AMBAR }}>● </span>
                            )}
                            {v.titulo}
                          </div>
                          <div className="line-clamp-1" style={{ color: TEXTO_SUAVE, fontSize: "0.9vw" }}>
                            {v.cliente_curto ?? "Interna"}
                          </div>
                        </td>
                        <td className="whitespace-nowrap py-[0.55vw] pr-[1vw]" style={{ width: "12vw" }}>
                          {v.setor && (
                            <span className="inline-flex items-center gap-[0.4vw]" style={{ color: TEXTO_SUAVE }}>
                              <span
                                className="inline-block rounded-full"
                                style={{ width: "0.6vw", height: "0.6vw", background: v.setor_cor ?? OURO }}
                              />
                              {v.setor}
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap py-[0.55vw] text-right" style={{ width: "11vw" }}>
                          {v.responsavel ?? <span style={{ color: VERMELHO }}>sem responsável</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </RolagemAutomatica>
          )}
        </div>

        <div className="flex min-h-0 flex-col gap-[1.2vw]">
          <div className="rounded-[0.8vw] border p-[1.2vw]" style={{ borderColor: "rgba(226,193,126,.18)", background: "rgba(0,0,0,.12)" }}>
            <h2 className="pb-[0.8vw] font-medium" style={{ color: OURO, fontSize: "1.25vw" }}>
              Por setor
            </h2>
            <div className="space-y-[0.8vw]">
              {(dados?.setores ?? []).map((s) => (
                <div key={s.setor_id}>
                  <div className="flex justify-between" style={{ fontSize: "0.95vw" }}>
                    <span>{s.nome}</span>
                    <span style={{ color: TEXTO_SUAVE }}>
                      {s.abertas} abertas
                      {s.atrasadas > 0 && <b style={{ color: VERMELHO }}> · {s.atrasadas} atrasadas</b>}
                    </span>
                  </div>
                  <div
                    className="mt-[0.3vw] flex overflow-hidden rounded-full"
                    style={{ height: "0.7vw", background: "rgba(255,255,255,.08)" }}
                  >
                    <div style={{ width: `${(s.atrasadas / maxSetor) * 100}%`, background: VERMELHO }} />
                    <div style={{ width: `${((s.abertas - s.atrasadas) / maxSetor) * 100}%`, background: s.cor }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            className="flex min-h-0 flex-1 flex-col rounded-[0.8vw] border p-[1.2vw]"
            style={{ borderColor: "rgba(226,193,126,.18)", background: "rgba(0,0,0,.12)" }}
          >
            <h2 className="pb-[0.6vw] font-medium" style={{ color: OURO, fontSize: "1.25vw" }}>
              Equipe
            </h2>
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-[1vw] pb-[0.3vw]" style={{ color: TEXTO_SUAVE, fontSize: "0.8vw" }}>
              <span />
              <span className="text-right">Abertas</span>
              <span className="text-right">Atrasadas</span>
              <span className="text-right">Feitas mês</span>
            </div>
            <RolagemAutomatica chave={String(equipe.length)}>
              {equipe.map((r) => (
                <div
                  key={r.user_id}
                  className="grid grid-cols-[1fr_auto_auto_auto] gap-x-[1vw] border-b py-[0.4vw] tabular-nums"
                  style={{ borderColor: "rgba(255,255,255,.07)", fontSize: "0.95vw" }}
                >
                  <span className="truncate">{r.nome}</span>
                  <span className="w-[4vw] text-right">{r.abertas}</span>
                  <span className="w-[5vw] text-right" style={{ color: r.atrasadas ? VERMELHO : TEXTO_SUAVE }}>
                    {r.atrasadas}
                  </span>
                  <span className="w-[5vw] text-right" style={{ color: OURO }}>
                    {r.concluidas_mes}
                  </span>
                </div>
              ))}
            </RolagemAutomatica>
          </div>
        </div>
      </section>

      {/* Rodapé: últimas concluídas */}
      <footer className="mt-[1vw] flex items-center gap-[1vw] overflow-hidden whitespace-nowrap" style={{ fontSize: "0.95vw" }}>
        <span className="shrink-0 font-medium" style={{ color: OURO }}>
          Concluídas agora há pouco
        </span>
        <div className="relative min-w-0 flex-1 overflow-hidden">
          <div className="tv-letreiro inline-block" style={{ color: TEXTO_SUAVE }}>
            {(dados?.concluidas ?? []).map((c) => (
              <span key={c.id} className="mr-[3vw]">
                <span style={{ color: "#32D583" }}>✓</span> {nm(c.responsavel_id) || "Equipe"} · {c.titulo}
                {nc(c.cliente_id) ? ` · ${nc(c.cliente_id)}` : ""}
              </span>
            ))}
          </div>
        </div>
      </footer>
      <style>{`
        .tv-letreiro { padding-left: 100%; animation: tv-letreiro 60s linear infinite; }
        @keyframes tv-letreiro { from { transform: translateX(0) } to { transform: translateX(-100%) } }
      `}</style>
    </div>
  );
}
