"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAgora } from "@/lib/useAgora";
import { ChatMensagens } from "@/components/ChatMensagens";
import { useOrg } from "@/lib/org";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { ASSUNTOS, STATUS_CONVERSA, nomeAssunto } from "@/lib/chat";
import type { Conversa } from "@/lib/chat";
import { caminho } from "@/lib/caminho";
import { fmtDataHora } from "@/lib/formato/datas";
import { nomeCliente } from "@/lib/clientes";

export default function PaginaAtendimento() {
  return <Caixa />;
}

function Caixa() {
  const { org, eu, membros, setores, clientePorId, nomeMembro, pode, clientes } = useOrg();
  const agora = useAgora();
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"abertas" | "minhas" | "resolvidas" | "todas">("abertas");
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [nova, setNova] = useState(false);
  const podeOperar = pode("atendimento", "operar");

  const carregar = useCallback(async () => {
    const { data, error } = await supabase()
      .from("portal_conversas")
      .select("*")
      .eq("org_id", org.id)
      .order("atualizado_em", { ascending: false })
      .limit(500);
    if (error) return setErro(traduzirErro(error));
    setConversas(data as Conversa[]);
  }, [org.id]);

  useEffect(() => {
    void carregar();
    const c = new URLSearchParams(window.location.search).get("c");
    if (c) setSel(c);
    const sb = supabase();
    const canal = sb
      .channel(`atend-${org.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "portal_conversas", filter: `org_id=eq.${org.id}` }, carregar)
      .subscribe();
    return () => {
      void sb.removeChannel(canal);
    };
  }, [org.id, carregar]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return conversas.filter((c) => {
      if (filtro === "abertas" && c.status === "resolvido") return false;
      if (filtro === "resolvidas" && c.status !== "resolvido") return false;
      if (filtro === "minhas" && (c.responsavel_id !== eu.user_id || c.status === "resolvido")) return false;
      if (q) {
        const cl = clientePorId(c.cliente_id);
        if (!`${c.titulo} ${cl?.razao_social} ${cl?.nome_fantasia}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [conversas, filtro, busca, eu.user_id, clientePorId]);

  const atual = conversas.find((c) => c.id === sel);

  async function atualizar(campos: Partial<Conversa>) {
    if (!atual) return;
    const { error } = await supabase().from("portal_conversas").update(campos).eq("id", atual.id);
    if (error) setErro(traduzirErro(error));
    void carregar();
  }

  async function virarTarefa() {
    if (!atual) return;
    const { error } = await supabase().rpc("portal_conversa_para_tarefa", { p_conversa: atual.id, p_prazo: null });
    if (error) return setErro(traduzirErro(error));
    void carregar();
  }

  const nomeCli = (id: string) => {
    const c = clientePorId(id);
    return nomeCliente(c, "—");
  };
  const atrasada = (c: Conversa) =>
    !c.respondida_em && c.prazo_resposta && Date.parse(c.prazo_resposta) < agora && c.status !== "resolvido";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold text-[var(--marca)]">Atendimento</h1>
        {podeOperar && (
          <button className="btn" onClick={() => setNova(true)}>
            Iniciar conversa com cliente
          </button>
        )}
      </div>
      {erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{erro}</p>}
      <div className="grid h-[calc(100vh-190px)] min-h-[480px] gap-3 lg:grid-cols-[360px_1fr]">
        <aside className="cartao flex min-h-0 flex-col">
          <div className="space-y-2 border-b border-[var(--borda)] p-2">
            <div className="flex gap-1 text-xs">
              {(["abertas", "minhas", "resolvidas", "todas"] as const).map((f) => (
                <button
                  key={f}
                  className={`rounded-md px-2 py-1 ${filtro === f ? "bg-[var(--marca)] text-white" : "hover:bg-[var(--fundo)]"}`}
                  onClick={() => setFiltro(f)}
                >
                  {f === "abertas" ? "Abertas" : f === "minhas" ? "Minhas" : f === "resolvidas" ? "Resolvidas" : "Todas"}
                </button>
              ))}
            </div>
            <input
              className="entrada w-full"
              placeholder="Buscar cliente ou assunto…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {lista.length === 0 && <p className="p-4 text-sm text-neutral-500">Nenhum atendimento aqui.</p>}
            {lista.map((c) => {
              const st = STATUS_CONVERSA.find((s) => s.id === c.status)!;
              return (
                <button
                  key={c.id}
                  onClick={() => setSel(c.id)}
                  className={`block w-full border-b border-[var(--borda)] px-3 py-2 text-left text-sm hover:bg-[var(--fundo)] ${sel === c.id ? "bg-[var(--fundo)]" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{nomeCli(c.cliente_id)}</span>
                    <span className={`chip shrink-0 ${st.cor}`}>{st.nome}</span>
                  </div>
                  <div className="truncate text-neutral-700">{c.titulo}</div>
                  <div className="flex justify-between text-[11px] text-neutral-500">
                    <span>
                      {nomeAssunto(c.assunto)} · {nomeMembro(c.responsavel_id)}
                    </span>
                    <span className={atrasada(c) ? "font-medium text-[var(--perigo)]" : ""}>
                      {atrasada(c) ? "resposta atrasada" : fmtDataHora(c.atualizado_em)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="cartao flex min-h-0 flex-col overflow-hidden">
          {!atual ? (
            <div className="grid flex-1 place-items-center p-6 text-sm text-neutral-500">Escolha um atendimento à esquerda.</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-[var(--borda)] p-3">
                <div className="mr-auto min-w-0">
                  <div className="truncate font-semibold">{atual.titulo}</div>
                  <div className="text-xs text-neutral-500">
                    {nomeCli(atual.cliente_id)} · {nomeAssunto(atual.assunto)} · aberto em {fmtDataHora(atual.criado_em)}
                    {atual.avaliacao && ` · avaliação ${"★".repeat(atual.avaliacao)}`}
                  </div>
                </div>
                {podeOperar && (
                  <>
                    <select
                      className="entrada !min-h-8 !py-1 text-sm"
                      value={atual.status}
                      onChange={(e) => atualizar({ status: e.target.value as Conversa["status"] })}
                    >
                      {STATUS_CONVERSA.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nome}
                        </option>
                      ))}
                    </select>
                    <select
                      className="entrada !min-h-8 !py-1 text-sm"
                      value={atual.responsavel_id ?? ""}
                      onChange={(e) => atualizar({ responsavel_id: e.target.value || null })}
                      aria-label="Responsável"
                    >
                      <option value="">Sem responsável</option>
                      {membros
                        .filter((m) => m.ativo)
                        .map((m) => (
                          <option key={m.user_id} value={m.user_id}>
                            {m.nome}
                          </option>
                        ))}
                    </select>
                    <select
                      className="entrada !min-h-8 !py-1 text-sm"
                      value={atual.setor_id ?? ""}
                      onChange={(e) => atualizar({ setor_id: e.target.value || null })}
                      aria-label="Setor"
                    >
                      <option value="">Sem setor</option>
                      {setores.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nome}
                        </option>
                      ))}
                    </select>
                    {atual.tarefa_id ? (
                      <a href={caminho("/tarefas")} className="chip bg-sky-50 text-sky-800">
                        virou tarefa
                      </a>
                    ) : (
                      <button
                        className="btn !min-h-8 !py-1"
                        onClick={virarTarefa}
                        title="Cria uma tarefa no MDC Tarefas com o histórico da conversa"
                      >
                        Virar tarefa
                      </button>
                    )}
                    {atual.assunto === "alteracao_contratual" && pode("societario", "operar") && !atual.processo_id && (
                      <a href={caminho("/societario")} className="btn !min-h-8 !py-1">
                        Abrir no Societário
                      </a>
                    )}
                  </>
                )}
              </div>
              <div className="min-h-0 flex-1">
                <ChatMensagens conversaId={atual.id} orgId={org.id} clienteId={atual.cliente_id} lado="equipe" />
              </div>
            </>
          )}
        </section>
      </div>
      {nova && (
        <NovaConversa
          clientes={clientes.filter((c) => c.ativo)}
          aoFechar={() => setNova(false)}
          aoCriar={(id) => {
            setNova(false);
            void carregar().then(() => setSel(id));
          }}
        />
      )}
    </div>
  );
}

function NovaConversa({
  clientes,
  aoFechar,
  aoCriar,
}: {
  clientes: { id: string; razao_social: string; nome_fantasia: string | null; codigo_dominio?: string | null }[];
  aoFechar: () => void;
  aoCriar: (id: string) => void;
}) {
  const [cliente, setCliente] = useState("");
  const [assunto, setAssunto] = useState("duvida");
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={aoFechar}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={async (e) => {
          e.preventDefault();
          const { data, error } = await supabase().rpc("portal_abrir_conversa", {
            p_cliente: cliente,
            p_assunto: assunto,
            p_titulo: titulo,
            p_texto: texto,
          });
          if (error) return setErro(traduzirErro(error));
          aoCriar(data as string);
        }}
        className="cartao w-full max-w-md space-y-3 p-5"
      >
        <h2 className="text-lg font-semibold text-[var(--marca)]">Nova conversa</h2>
        <label className="campo">
          <span>Cliente</span>
          <select required value={cliente} onChange={(e) => setCliente(e.target.value)}>
            <option value="">Escolha…</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo_dominio ? `${c.codigo_dominio} · ` : ""}
                {nomeCliente(c)}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Assunto</span>
          <select value={assunto} onChange={(e) => setAssunto(e.target.value)}>
            {ASSUNTOS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Título</span>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </label>
        <label className="campo">
          <span>Mensagem</span>
          <textarea required rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} />
        </label>
        {erro && <p className="text-sm text-red-700">{erro}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={aoFechar}>
            Cancelar
          </button>
          <button className="btn-primario">Enviar</button>
        </div>
      </form>
    </div>
  );
}
