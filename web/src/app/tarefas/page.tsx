"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { TarefaEditor } from "@/components/TarefaEditor";
import { MultiSelecao } from "@/components/MultiSelecao";
import { PrazoBadge, PrioridadeDot, SetorChip } from "@/components/Badges";
import { useOrg } from "@/lib/org";
import { useTarefas } from "@/lib/useTarefas";
import { diasAte, fmtCompetencia } from "@/lib/datas";
import { STATUS } from "@/lib/types";
import type { Status, Tarefa } from "@/lib/types";
import { traduzirErro } from "@/lib/erros";
import { caminho } from "@/lib/caminho";

export default function PaginaTarefas() {
  return (
    <AppShell>
      <Suspense>
        <Tarefas />
      </Suspense>
    </AppShell>
  );
}

type Situacao = "abertas" | "atrasadas" | "hoje" | "semana" | "concluidas" | "todas";
type Visao = "lista" | "quadro";

const PESO_PRIORIDADE = { urgente: 0, alta: 1, media: 2, baixa: 3 } as const;
const ABERTAS: Status[] = ["a_fazer", "em_andamento", "aguardando"];

function Tarefas() {
  const ctx = useOrg();
  const { org, eu, papel, setores, clientes, membros, setorPorId, clientePorId, nomeMembro } = ctx;
  const { tarefas, carregando, erro, online, recarregar, atualizar } = useTarefas(org.id, org.fuso);

  const [visao, setVisao] = useState<Visao>("lista");
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<Situacao>("abertas");
  // filtros por setor (grupo) e por responsável: seleção múltipla, lembrada neste navegador
  const [setorSel, setSetorSel] = useState<string[]>([]);
  const [respSel, setRespSel] = useState<string[]>(papel === "analista" ? [eu.user_id] : []);
  const [filtrosProntos, setFiltrosProntos] = useState(false);
  const [cliente, setCliente] = useState("");
  const [editando, setEditando] = useState<Tarefa | null | undefined>(undefined);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (papel === "tv") window.location.replace(caminho("/tv"));
  }, [papel]);

  // atalhos vindos da busca rápida: ?cliente=<id> filtra, ?nova=1 abre o editor
  const params = useSearchParams();
  useEffect(() => {
    const cli = params.get("cliente");
    if (cli) {
      setCliente(cli);
      setSituacao("todas");
      setRespSel([]);
    }
    if (params.get("nova")) setEditando(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  useEffect(() => {
    try {
      const v = localStorage.getItem("mdc-tarefas:visao");
      if (v === "lista" || v === "quadro") setVisao(v);
      const f = JSON.parse(localStorage.getItem(`mdc-tarefas:filtros:${org.id}`) ?? "null") as { setores?: string[]; resps?: string[] } | null;
      // descarta setores/pessoas que não existem mais
      const setoresOk = new Set([...setores.map((x) => x.id), "_sem"]);
      const pessoasOk = new Set([...membros.filter((m) => m.ativo).map((m) => m.user_id), "_sem"]);
      setSetorSel(Array.isArray(f?.setores) ? f.setores.filter((x) => setoresOk.has(x)) : []);
      setRespSel(Array.isArray(f?.resps) ? f.resps.filter((x) => pessoasOk.has(x)) : papel === "analista" ? [eu.user_id] : []);
      if (new URLSearchParams(window.location.search).get("cliente")) {
        setRespSel([]);
        setSetorSel([]);
      }
    } catch {}
    setFiltrosProntos(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org.id]);

  useEffect(() => {
    if (!filtrosProntos) return;
    try {
      localStorage.setItem(`mdc-tarefas:filtros:${org.id}`, JSON.stringify({ setores: setorSel, resps: respSel }));
    } catch {}
  }, [org.id, setorSel, respSel, filtrosProntos]);

  const base = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return tarefas.filter((t) => {
      if (setorSel.length && !setorSel.includes(t.setor_id ?? "_sem")) return false;
      if (respSel.length && !respSel.includes(t.responsavel_id ?? "_sem")) return false;
      if (cliente && t.cliente_id !== cliente) return false;
      if (q) {
        const c = clientePorId(t.cliente_id);
        const alvo = `${t.titulo} ${t.descricao ?? ""} ${c?.razao_social ?? ""} ${c?.nome_fantasia ?? ""} ${c?.cnpj ?? ""}`;
        if (!alvo.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [tarefas, busca, setorSel, respSel, cliente, clientePorId]);

  const contagem = useMemo(() => {
    let atrasadas = 0,
      hoje = 0,
      semana = 0,
      abertas = 0;
    for (const t of base) {
      if (!ABERTAS.includes(t.status)) continue;
      abertas++;
      const d = diasAte(t.prazo, org.fuso);
      if (d === null) continue;
      if (d < 0) atrasadas++;
      else if (d === 0) hoje++;
      if (d >= 0 && d <= 7) semana++;
    }
    return { atrasadas, hoje, semana, abertas };
  }, [base, org.fuso]);

  const visiveis = useMemo(() => {
    const lista = base.filter((t) => {
      const aberta = ABERTAS.includes(t.status);
      const d = diasAte(t.prazo, org.fuso);
      switch (situacao) {
        case "abertas":
          return aberta || visao === "quadro";
        case "atrasadas":
          return aberta && d !== null && d < 0;
        case "hoje":
          return aberta && d === 0;
        case "semana":
          return aberta && d !== null && d >= 0 && d <= 7;
        case "concluidas":
          return t.status === "concluida";
        default:
          return true;
      }
    });
    return lista.sort((a, b) => {
      const pa = a.prazo ?? "9999";
      const pb = b.prazo ?? "9999";
      if (pa !== pb) return pa < pb ? -1 : 1;
      return PESO_PRIORIDADE[a.prioridade] - PESO_PRIORIDADE[b.prioridade];
    });
  }, [base, situacao, visao, org.fuso]);

  async function mudarStatus(t: Tarefa, status: Status) {
    try {
      await atualizar(t.id, { status });
    } catch (e) {
      setAviso(traduzirErro(e));
      setTimeout(() => setAviso(null), 5000);
    }
  }

  const pessoas = membros.filter((m) => m.ativo && m.papel !== "tv");
  const filtros: { id: Situacao; nome: string; n?: number; cor?: string }[] = [
    { id: "abertas", nome: "Abertas", n: contagem.abertas },
    { id: "atrasadas", nome: "Atrasadas", n: contagem.atrasadas, cor: "text-red-700" },
    { id: "hoje", nome: "Vencem hoje", n: contagem.hoje, cor: "text-amber-700" },
    { id: "semana", nome: "Próximos 7 dias", n: contagem.semana },
    { id: "concluidas", nome: "Concluídas" },
    { id: "todas", nome: "Todas" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-[var(--marca)]">Tarefas</h1>
        <span
          className={`chip ${online ? "bg-emerald-50 text-emerald-800" : "bg-neutral-100 text-neutral-500"}`}
          title={online ? "Atualizando em tempo real" : "Reconectando…"}
        >
          <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-500" : "bg-neutral-400"}`} />
          {online ? "Ao vivo" : "Offline"}
        </span>
        <div className="ml-auto flex gap-2">
          <div className="flex rounded-lg border border-[var(--borda)] bg-white p-0.5 text-sm">
            {(["lista", "quadro"] as Visao[]).map((v) => (
              <button
                key={v}
                onClick={() => {
                  setVisao(v);
                  try {
                    localStorage.setItem("mdc-tarefas:visao", v);
                  } catch {}
                }}
                className={`rounded-md px-3 py-1.5 ${visao === v ? "bg-[var(--marca)] text-white" : ""}`}
              >
                {v === "lista" ? "Lista" : "Quadro"}
              </button>
            ))}
          </div>
          <button className="btn-primario" onClick={() => setEditando(null)}>
            + Nova tarefa
          </button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {filtros.map((f) => (
          <button
            key={f.id}
            onClick={() => setSituacao(f.id)}
            className={`chip border py-1.5 text-sm ${
              situacao === f.id
                ? "border-[var(--marca)] bg-[var(--marca)] text-white"
                : `border-[var(--borda)] bg-white ${f.cor ?? ""}`
            }`}
          >
            {f.nome}
            {f.n !== undefined && <b className="font-semibold">{f.n}</b>}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <input
          className="entrada col-span-2 md:col-span-1"
          placeholder="Buscar tarefa, cliente ou CNPJ"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <MultiSelecao
          rotulo="Setores"
          todos="Todos os setores"
          valor={setorSel}
          aoMudar={setSetorSel}
          opcoes={[...setores.map((x) => ({ id: x.id, nome: x.nome, cor: x.cor })), { id: "_sem", nome: "Sem setor" }]}
        />
        <MultiSelecao
          rotulo="Responsáveis"
          todos="Todos os responsáveis"
          valor={respSel}
          aoMudar={setRespSel}
          opcoes={[
            { id: eu.user_id, nome: `${eu.nome} (eu)` },
            { id: "_sem", nome: "Sem responsável" },
            ...pessoas
              .filter((m) => m.user_id !== eu.user_id)
              .map((m) => ({ id: m.user_id, nome: m.nome, grupo: setorPorId(m.setor_id)?.nome ?? "Sem setor" }))
              .sort((x, y) => x.grupo.localeCompare(y.grupo) || x.nome.localeCompare(y.nome)),
          ]}
        />
        <select
          className="entrada col-span-2 md:col-span-1"
          value={cliente}
          onChange={(e) => setCliente(e.target.value)}
          aria-label="Cliente"
        >
          <option value="">Todos os clientes</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome_fantasia || c.razao_social}
              {c.ativo ? "" : " (inativo)"}
            </option>
          ))}
        </select>
      </div>

      {aviso && <div className="cartao border-red-200 bg-red-50 p-3 text-sm text-red-800">{aviso}</div>}
      {erro && <div className="cartao border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro}</div>}

      {carregando ? (
        <p className="text-sm text-[var(--texto-suave)]">Carregando tarefas…</p>
      ) : visao === "lista" ? (
        <Lista
          tarefas={visiveis}
          abrir={setEditando}
          mudarStatus={mudarStatus}
          fuso={org.fuso}
          setorPorId={setorPorId}
          clientePorId={clientePorId}
          nomeMembro={nomeMembro}
        />
      ) : (
        <Quadro
          tarefas={visiveis}
          abrir={setEditando}
          mudarStatus={mudarStatus}
          fuso={org.fuso}
          setorPorId={setorPorId}
          clientePorId={clientePorId}
          nomeMembro={nomeMembro}
        />
      )}

      {editando !== undefined && (
        <TarefaEditor tarefa={editando} aoFechar={() => setEditando(undefined)} aoSalvar={recarregar} />
      )}
    </div>
  );
}

interface VisaoProps {
  tarefas: Tarefa[];
  abrir: (t: Tarefa) => void;
  mudarStatus: (t: Tarefa, s: Status) => void;
  fuso: string;
  setorPorId: ReturnType<typeof useOrg>["setorPorId"];
  clientePorId: ReturnType<typeof useOrg>["clientePorId"];
  nomeMembro: ReturnType<typeof useOrg>["nomeMembro"];
}

function Lista({ tarefas, abrir, mudarStatus, fuso, setorPorId, clientePorId, nomeMembro }: VisaoProps) {
  if (tarefas.length === 0)
    return <div className="cartao p-10 text-center text-sm text-[var(--texto-suave)]">Nenhuma tarefa aqui.</div>;
  return (
    <div className="cartao divide-y divide-[var(--borda)] overflow-hidden">
      {tarefas.map((t) => {
        const c = clientePorId(t.cliente_id);
        const feita = t.status === "concluida";
        return (
          <div key={t.id} className="flex items-start gap-3 px-3 py-3 hover:bg-[var(--fundo)] sm:items-center sm:px-4">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 shrink-0 accent-[var(--marca)] sm:mt-0"
              checked={feita}
              onChange={() => mudarStatus(t, feita ? "a_fazer" : "concluida")}
              aria-label={feita ? "Reabrir tarefa" : "Concluir tarefa"}
            />
            <button className="min-w-0 flex-1 text-left" onClick={() => abrir(t)}>
              <div className="flex items-start gap-2 sm:items-center">
                <span className="mt-1.5 sm:mt-0">
                  <PrioridadeDot p={t.prioridade} />
                </span>
                <span className={`line-clamp-2 font-medium sm:line-clamp-1 ${feita ? "text-neutral-400 line-through" : ""}`}>
                  {t.titulo}
                </span>
              </div>
              <div className="mt-0.5 truncate text-xs text-[var(--texto-suave)]">
                {c ? c.nome_fantasia || c.razao_social : "Interna"}
                {t.competencia && ` · comp. ${fmtCompetencia(t.competencia)}`}
                <span className="sm:hidden"> · {nomeMembro(t.responsavel_id)}</span>
              </div>
              <div className="mt-1.5 sm:hidden">
                <PrazoBadge prazo={t.prazo} status={t.status} fuso={fuso} />
              </div>
            </button>
            <div className="hidden w-44 shrink-0 md:block">
              <SetorChip setor={setorPorId(t.setor_id)} />
            </div>
            <div className="hidden w-36 shrink-0 truncate text-sm sm:block">{nomeMembro(t.responsavel_id)}</div>
            <div className="hidden w-36 shrink-0 sm:block">
              <PrazoBadge prazo={t.prazo} status={t.status} fuso={fuso} />
            </div>
            <select
              className="entrada hidden w-36 shrink-0 py-1 text-sm lg:block"
              value={t.status}
              onChange={(e) => mudarStatus(t, e.target.value as Status)}
              aria-label="Status"
            >
              {STATUS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}

function Quadro({ tarefas, abrir, mudarStatus, fuso, setorPorId, clientePorId, nomeMembro }: VisaoProps) {
  const [sobre, setSobre] = useState<Status | null>(null);
  const colunas = STATUS.filter((s) => s.id !== "cancelada");
  return (
    <div className="grid grid-flow-col auto-cols-[minmax(260px,1fr)] gap-3 overflow-x-auto pb-2">
      {colunas.map((col) => {
        const itens = tarefas.filter((t) => t.status === col.id);
        return (
          <div
            key={col.id}
            onDragOver={(e) => {
              e.preventDefault();
              setSobre(col.id);
            }}
            onDragLeave={() => setSobre(null)}
            onDrop={(e) => {
              e.preventDefault();
              setSobre(null);
              const id = e.dataTransfer.getData("text/plain");
              const t = tarefas.find((x) => x.id === id);
              if (t && t.status !== col.id) mudarStatus(t, col.id);
            }}
            className={`rounded-xl border p-2 transition ${
              sobre === col.id ? "border-[var(--destaque-escuro)] bg-[#efe9da]" : "border-[var(--borda)] bg-[#eeebe2]"
            }`}
          >
            <div className="flex items-center justify-between px-2 py-1.5 text-sm font-semibold text-[var(--marca)]">
              {col.nome}
              <span className="text-xs font-normal text-[var(--texto-suave)]">{itens.length}</span>
            </div>
            <div className="max-h-[calc(100vh-330px)] min-h-24 space-y-2 overflow-y-auto">
              {itens.slice(0, 200).map((t) => {
                const c = clientePorId(t.cliente_id);
                return (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}
                    onClick={() => abrir(t)}
                    className="cartao cursor-pointer space-y-2 p-3 text-sm hover:border-[var(--destaque-escuro)]"
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-1.5">
                        <PrioridadeDot p={t.prioridade} />
                      </span>
                      <span className="font-medium leading-snug">{t.titulo}</span>
                    </div>
                    {c && <div className="truncate text-xs text-[var(--texto-suave)]">{c.nome_fantasia || c.razao_social}</div>}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <PrazoBadge prazo={t.prazo} status={t.status} fuso={fuso} />
                      <SetorChip setor={setorPorId(t.setor_id)} />
                    </div>
                    <div className="text-xs text-[var(--texto-suave)]">{nomeMembro(t.responsavel_id)}</div>
                  </div>
                );
              })}
              {itens.length > 200 && (
                <p className="px-2 text-xs text-[var(--texto-suave)]">+{itens.length - 200} — use os filtros</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
