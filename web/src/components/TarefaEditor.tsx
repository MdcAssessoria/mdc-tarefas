"use client";

import { useEffect, useState } from "react";
import { useOrg } from "@/lib/org";
import { supabase } from "@/lib/supabase";
import { fmtData, fmtDataHora } from "@/lib/datas";
import { PRIORIDADES, STATUS, nomePrioridade, nomeStatus } from "@/lib/types";
import type { Prioridade, Status, Tarefa } from "@/lib/types";
import { traduzirErro } from "@/lib/erros";
import { abrirArquivo, enviarArquivo, fmtTamanho } from "@/lib/arquivos";
import type { Arquivo } from "@/lib/arquivos";

interface Comentario {
  id: string;
  autor_id: string;
  texto: string;
  criado_em: string;
}
interface Historico {
  id: number;
  user_id: string | null;
  acao: string;
  detalhe: Record<string, unknown> | null;
  em: string;
}

type Form = {
  titulo: string;
  descricao: string;
  cliente_id: string;
  setor_id: string;
  responsavel_id: string;
  prazo: string;
  competencia: string;
  prioridade: Prioridade;
  status: Status;
  visivel_cliente: "" | "sim" | "nao";
  pendencia_cliente: string;
};

export function TarefaEditor({
  tarefa,
  aoFechar,
  aoSalvar,
}: {
  tarefa: Tarefa | null; // null = nova
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const { org, eu, setores, clientes, membros, nomeMembro, podeEditarCadastros } = useOrg();
  const [f, setF] = useState<Form>(() => ({
    titulo: tarefa?.titulo ?? "",
    descricao: tarefa?.descricao ?? "",
    cliente_id: tarefa?.cliente_id ?? "",
    setor_id: tarefa?.setor_id ?? eu.setor_id ?? "",
    responsavel_id: tarefa?.responsavel_id ?? (tarefa ? "" : eu.user_id),
    prazo: tarefa?.prazo ?? "",
    competencia: tarefa?.competencia?.slice(0, 7) ?? "",
    prioridade: tarefa?.prioridade ?? "media",
    status: tarefa?.status ?? "a_fazer",
    visivel_cliente: tarefa?.visivel_cliente === true ? "sim" : tarefa?.visivel_cliente === false ? "nao" : "",
    pendencia_cliente: tarefa?.pendencia_cliente ?? "",
  }));
  const [arquivos, setArquivos] = useState<Arquivo[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [historico, setHistorico] = useState<Historico[]>([]);
  const [novoComentario, setNovoComentario] = useState("");

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (!tarefa) return;
    const sb = supabase();
    sb.from("comentarios")
      .select("id,autor_id,texto,criado_em")
      .eq("tarefa_id", tarefa.id)
      .order("criado_em")
      .then(({ data }) => setComentarios((data as Comentario[]) ?? []));
    sb.from("historico")
      .select("id,user_id,acao,detalhe,em")
      .eq("tarefa_id", tarefa.id)
      .order("em", { ascending: false })
      .limit(30)
      .then(({ data }) => setHistorico((data as Historico[]) ?? []));
    sb.from("hub_arquivos")
      .select("*")
      .eq("ref_id", tarefa.id)
      .order("enviado_em")
      .then(({ data }) => setArquivos((data as Arquivo[]) ?? []));
  }, [tarefa]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aoFechar]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    const dados = {
      titulo: f.titulo.trim(),
      descricao: f.descricao.trim() || null,
      cliente_id: f.cliente_id || null,
      setor_id: f.setor_id || null,
      responsavel_id: f.responsavel_id || null,
      prazo: f.prazo || null,
      competencia: f.competencia ? f.competencia + "-01" : null,
      prioridade: f.prioridade,
      status: f.status,
      visivel_cliente: f.visivel_cliente === "" ? null : f.visivel_cliente === "sim",
      pendencia_cliente: f.pendencia_cliente.trim() || null,
    };
    const sb = supabase();
    const r = tarefa
      ? await sb.from("tarefas").update(dados).eq("id", tarefa.id).select("id")
      : await sb.from("tarefas").insert({ ...dados, org_id: org.id }).select("id");
    setSalvando(false);
    if (r.error) return setErro(traduzirErro(r.error));
    if (!r.data?.length) return setErro("Você não tem permissão para alterar esta tarefa.");
    aoSalvar();
    aoFechar();
  }

  async function excluir() {
    if (!tarefa || !confirm("Excluir esta tarefa? Essa ação não pode ser desfeita.")) return;
    const { error } = await supabase().from("tarefas").delete().eq("id", tarefa.id);
    if (error) return setErro(traduzirErro(error));
    aoSalvar();
    aoFechar();
  }

  async function comentar(e: React.FormEvent) {
    e.preventDefault();
    if (!tarefa || !novoComentario.trim()) return;
    const { data, error } = await supabase()
      .from("comentarios")
      .insert({ org_id: org.id, tarefa_id: tarefa.id, texto: novoComentario.trim() })
      .select("id,autor_id,texto,criado_em")
      .single();
    if (error) return setErro(traduzirErro(error));
    setComentarios((c) => [...c, data as Comentario]);
    setNovoComentario("");
  }

  const pessoas = membros.filter((m) => m.ativo && m.papel !== "tv");

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={aoFechar}>
      <aside
        className="h-full w-full max-w-xl overflow-y-auto bg-[var(--fundo)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={tarefa ? "Editar tarefa" : "Nova tarefa"}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--borda)] bg-[var(--superficie)] px-5 py-3">
          <h2 className="font-semibold text-[var(--marca)]">{tarefa ? "Editar tarefa" : "Nova tarefa"}</h2>
          <button className="btn" onClick={aoFechar} aria-label="Fechar">
            ✕
          </button>
        </div>

        <form onSubmit={salvar} className="space-y-4 p-5">
          <label className="campo">
            <span>Título</span>
            <input required maxLength={200} value={f.titulo} onChange={(e) => set("titulo", e.target.value)} autoFocus />
          </label>
          <label className="campo">
            <span>Descrição</span>
            <textarea rows={3} value={f.descricao} onChange={(e) => set("descricao", e.target.value)} />
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="campo sm:col-span-2">
              <span>Cliente</span>
              <select value={f.cliente_id} onChange={(e) => set("cliente_id", e.target.value)}>
                <option value="">— Interna / sem cliente —</option>
                {clientes
                  .filter((c) => c.ativo || c.id === f.cliente_id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome_fantasia || c.razao_social}
                    </option>
                  ))}
              </select>
            </label>
            <label className="campo">
              <span>Setor</span>
              <select value={f.setor_id} onChange={(e) => set("setor_id", e.target.value)}>
                <option value="">—</option>
                {setores
                  .filter((s) => s.ativo || s.id === f.setor_id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome}
                    </option>
                  ))}
              </select>
            </label>
            <label className="campo">
              <span>Responsável</span>
              <select value={f.responsavel_id} onChange={(e) => set("responsavel_id", e.target.value)}>
                <option value="">— Sem responsável —</option>
                {pessoas.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="campo">
              <span>Prazo</span>
              <input type="date" value={f.prazo} onChange={(e) => set("prazo", e.target.value)} />
            </label>
            <label className="campo">
              <span>Competência</span>
              <input type="month" value={f.competencia} onChange={(e) => set("competencia", e.target.value)} />
            </label>
            <label className="campo">
              <span>Prioridade</span>
              <select value={f.prioridade} onChange={(e) => set("prioridade", e.target.value as Prioridade)}>
                {PRIORIDADES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="campo">
              <span>Status</span>
              <select value={f.status} onChange={(e) => set("status", e.target.value as Status)}>
                {STATUS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {f.cliente_id && (
            <fieldset className="space-y-3 rounded-lg border border-[var(--borda)] p-3">
              <legend className="px-1 text-xs text-[var(--texto-suave)]">Portal do Cliente</legend>
              <label className="campo">
                <span>Aparece para o cliente?</span>
                <select value={f.visivel_cliente} onChange={(e) => set("visivel_cliente", e.target.value as Form["visivel_cliente"])}>
                  <option value="">Conforme o modelo recorrente (avulsa: não)</option>
                  <option value="sim">Sim</option>
                  <option value="nao">Não, só interna</option>
                </select>
              </label>
              <label className="campo">
                <span>O que o cliente precisa enviar (com status “Aguardando”, vira “Aguardando você” no portal)</span>
                <input value={f.pendencia_cliente} onChange={(e) => set("pendencia_cliente", e.target.value)} placeholder="Ex.: extratos bancários de outubro" />
              </label>
            </fieldset>
          )}
          {erro && <p className="text-sm text-[var(--perigo)]">{erro}</p>}
          <div className="flex items-center gap-2">
            <button className="btn-primario" disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar"}
            </button>
            <button type="button" className="btn" onClick={aoFechar}>
              Cancelar
            </button>
            {tarefa && podeEditarCadastros && (
              <button type="button" className="btn ml-auto text-[var(--perigo)]" onClick={excluir}>
                Excluir
              </button>
            )}
          </div>
          {tarefa && (
            <p className="text-xs text-[var(--texto-suave)]">
              Criada em {fmtDataHora(tarefa.criado_em)}
              {tarefa.criado_por ? ` por ${nomeMembro(tarefa.criado_por)}` : " automaticamente (recorrência)"}
              {tarefa.concluida_em && ` · concluída em ${fmtDataHora(tarefa.concluida_em)}`}
            </p>
          )}
        </form>

        {tarefa && (
          <section className="space-y-2 border-t border-[var(--borda)] p-5">
            <h3 className="text-sm font-semibold text-[var(--marca)]">Anexos e entregáveis</h3>
            {arquivos.length === 0 && <p className="text-sm text-[var(--texto-suave)]">Nenhum anexo.</p>}
            <ul className="space-y-1 text-sm">
              {arquivos.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2">
                  <button className="truncate text-left hover:underline" onClick={() => abrirArquivo(a.caminho, a.nome).catch((e) => setErro(traduzirErro(e)))}>
                    {a.nome} <span className="text-xs text-[var(--texto-suave)]">{fmtTamanho(a.tamanho)}{a.app === "portal" ? " · enviado pelo cliente" : ""}</span>
                  </button>
                  {a.app !== "portal" && tarefa.cliente_id && (
                    <label className="flex shrink-0 items-center gap-1 text-xs text-[var(--texto-suave)]">
                      <input
                        type="checkbox"
                        checked={a.visivel_cliente}
                        onChange={async () => {
                          await supabase().from("hub_arquivos").update({ visivel_cliente: !a.visivel_cliente }).eq("id", a.id);
                          setArquivos((l) => l.map((x) => (x.id === a.id ? { ...x, visivel_cliente: !x.visivel_cliente } : x)));
                        }}
                      />
                      no portal
                    </label>
                  )}
                </li>
              ))}
            </ul>
            <label className="btn cursor-pointer">
              Anexar (guia, recibo, holerite…)
              <input
                type="file"
                multiple
                className="hidden"
                onChange={async (e) => {
                  try {
                    for (const arq of Array.from(e.target.files ?? [])) {
                      const a = await enviarArquivo(arq, { org: org.id, app: "tarefas", ref: tarefa.id, cliente: tarefa.cliente_id, visivelCliente: !!tarefa.cliente_id });
                      setArquivos((l) => [...l, a]);
                    }
                  } catch (er) {
                    setErro(traduzirErro(er));
                  }
                }}
              />
            </label>
            {tarefa.cliente_id && <p className="text-xs text-[var(--texto-suave)]">Anexos de tarefas de cliente ficam disponíveis no portal (desmarque “no portal” para manter interno).</p>}
          </section>
        )}

        {tarefa && (
          <section className="space-y-3 border-t border-[var(--borda)] p-5">
            <h3 className="text-sm font-semibold text-[var(--marca)]">Comentários</h3>
            {comentarios.length === 0 && <p className="text-sm text-[var(--texto-suave)]">Nenhum comentário.</p>}
            <ul className="space-y-2">
              {comentarios.map((c) => (
                <li key={c.id} className="cartao p-3 text-sm">
                  <div className="mb-1 text-xs text-[var(--texto-suave)]">
                    {nomeMembro(c.autor_id)} · {fmtDataHora(c.criado_em)}
                  </div>
                  <p className="whitespace-pre-wrap">{c.texto}</p>
                </li>
              ))}
            </ul>
            <form onSubmit={comentar} className="flex gap-2">
              <input
                className="entrada flex-1"
                placeholder="Escreva um comentário…"
                value={novoComentario}
                onChange={(e) => setNovoComentario(e.target.value)}
              />
              <button className="btn">Enviar</button>
            </form>

            <h3 className="pt-3 text-sm font-semibold text-[var(--marca)]">Histórico</h3>
            <ul className="space-y-1 text-xs text-[var(--texto-suave)]">
              {historico.map((h) => (
                <li key={h.id}>
                  {fmtDataHora(h.em)} · {h.user_id ? nomeMembro(h.user_id) : "Sistema"} {descreverHistorico(h, nomeMembro)}
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  );
}

function descreverHistorico(h: Historico, nome: (id: string | null) => string): string {
  if (h.acao === "criada") return "criou a tarefa";
  const d = (h.detalhe ?? {}) as Record<string, [string | null, string | null]>;
  const partes: string[] = [];
  if (d.status) partes.push(`status: ${nomeStatus(d.status[0] as Status)} → ${nomeStatus(d.status[1] as Status)}`);
  if (d.responsavel) partes.push(`responsável: ${nome(d.responsavel[0])} → ${nome(d.responsavel[1])}`);
  if (d.prazo) partes.push(`prazo: ${fmtData(d.prazo[0])} → ${fmtData(d.prazo[1])}`);
  if (d.prioridade)
    partes.push(
      `prioridade: ${nomePrioridade(d.prioridade[0] as Prioridade)} → ${nomePrioridade(d.prioridade[1] as Prioridade)}`,
    );
  return "alterou " + partes.join("; ");
}
