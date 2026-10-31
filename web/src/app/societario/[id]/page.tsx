"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useOrg } from "@/lib/org";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { diasAte, fmtData, fmtDataHora, hojeISO } from "@/lib/datas";
import { abrirArquivo, enviarArquivo, fmtTamanho } from "@/lib/arquivos";
import type { Arquivo } from "@/lib/arquivos";
import { ORGAOS, STATUS_FASE, corStatusFase, diasParado, nomeStatusFase } from "@/lib/societario";
import type { SocFase, SocProcesso, SocTipo, StatusFase } from "@/lib/societario";

export default function PaginaProcesso() {
  return (
    <AppShell modulo="societario">
      <Ficha />
    </AppShell>
  );
}

interface Protocolo {
  id: string;
  orgao: string;
  numero: string;
  data: string;
  link: string | null;
}
interface Exigencia {
  id: string;
  data: string;
  orgao: string;
  texto: string;
  resposta: string | null;
  reprotocolo_em: string | null;
}
interface Taxa {
  id: string;
  descricao: string;
  valor: number | null;
  vencimento: string | null;
  pago_por: string | null;
  pago_em: string | null;
}
interface Evento {
  id: number;
  user_id: string | null;
  tipo: string;
  texto: string;
  visivel_cliente: boolean;
  em: string;
}

const brl = (v: number | null) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));

function Ficha() {
  const { id } = useParams<{ id: string }>();
  const { org, clientePorId, nomeMembro, membros, pode } = useOrg();
  const [p, setP] = useState<SocProcesso | null>(null);
  const [tipo, setTipo] = useState<SocTipo | null>(null);
  const [fases, setFases] = useState<SocFase[]>([]);
  const [protocolos, setProtocolos] = useState<Protocolo[]>([]);
  const [exigencias, setExigencias] = useState<Exigencia[]>([]);
  const [taxas, setTaxas] = useState<Taxa[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [arquivos, setArquivos] = useState<Arquivo[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [comentario, setComentario] = useState("");
  const [comentarioCliente, setComentarioCliente] = useState(false);
  const podeOperar = pode("societario", "operar");
  const podeGerir = pode("societario", "gerir");

  const carregar = useCallback(async () => {
    const sb = supabase();
    const [a, f, pr, ex, tx, ev, ar] = await Promise.all([
      sb.from("soc_processos").select("*").eq("id", id).single(),
      sb.from("soc_fases").select("*").eq("processo_id", id).order("ordem"),
      sb.from("soc_protocolos").select("*").eq("processo_id", id).order("data", { ascending: false }),
      sb.from("soc_exigencias").select("*").eq("processo_id", id).order("data", { ascending: false }),
      sb.from("soc_taxas").select("*").eq("processo_id", id).order("vencimento"),
      sb.from("soc_eventos").select("*").eq("processo_id", id).order("em", { ascending: false }).limit(200),
      sb.from("hub_arquivos").select("*").eq("ref_id", id).order("enviado_em", { ascending: false }),
    ]);
    if (a.error) return setErro(traduzirErro(a.error));
    setP(a.data as SocProcesso);
    setFases((f.data as SocFase[]) ?? []);
    setProtocolos((pr.data as Protocolo[]) ?? []);
    setExigencias((ex.data as Exigencia[]) ?? []);
    setTaxas((tx.data as Taxa[]) ?? []);
    setEventos((ev.data as Evento[]) ?? []);
    setArquivos((ar.data as Arquivo[]) ?? []);
    const t = await sb
      .from("soc_tipos")
      .select("*")
      .eq("id", (a.data as SocProcesso).tipo_id)
      .single();
    setTipo(t.data as SocTipo);
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (erro && !p) return <p className="text-sm text-red-700">{erro}</p>;
  if (!p) return <p className="text-sm text-neutral-500">Carregando…</p>;

  const cliente = clientePorId(p.cliente_id);
  const nome = cliente ? cliente.nome_fantasia || cliente.razao_social : p.futuro_cliente;
  const aberto = p.status === "aberto";

  async function rpc(fn: string, args: Record<string, unknown>) {
    setErro(null);
    const { error } = await supabase().rpc(fn, args);
    if (error) setErro(traduzirErro(error));
    await carregar();
    return !error;
  }

  async function atualizarFase(f: SocFase, campos: Partial<SocFase>) {
    const { error } = await supabase().from("soc_fases").update(campos).eq("id", f.id);
    if (error) setErro(traduzirErro(error));
    carregar();
  }

  async function inserir(tabela: string, dados: Record<string, unknown>, evento: string, visivel = false) {
    setErro(null);
    const sb = supabase();
    const { error } = await sb.from(tabela).insert({ ...dados, org_id: org.id, processo_id: id });
    if (error) return setErro(traduzirErro(error));
    const ev = await sb
      .from("soc_eventos")
      .insert({ org_id: org.id, processo_id: id, tipo: tabela.replace("soc_", ""), texto: evento, visivel_cliente: visivel });
    if (ev.error) setErro(`Registro salvo, mas o histórico não foi atualizado: ${traduzirErro(ev.error)}`);
    void carregar();
  }

  async function comentar(e: React.FormEvent) {
    e.preventDefault();
    if (!comentario.trim()) return;
    const { error } = await supabase()
      .from("soc_eventos")
      .insert({ org_id: org.id, processo_id: id, tipo: "comentario", texto: comentario.trim(), visivel_cliente: comentarioCliente });
    if (error) return setErro(traduzirErro(error));
    setComentario("");
    carregar();
  }

  async function anexar(arqs: FileList | null, faseNome?: string) {
    if (!arqs?.length) return;
    try {
      for (const a of Array.from(arqs)) {
        await enviarArquivo(a, { org: org.id, app: "societario", ref: id, cliente: p!.cliente_id, visivelCliente: false });
        const { error } = await supabase()
          .from("soc_eventos")
          .insert({
            org_id: org.id,
            processo_id: id,
            tipo: "documento",
            texto: `Documento anexado${faseNome ? ` (${faseNome})` : ""}: ${a.name}`,
          });
        if (error) throw error;
      }
    } catch (e) {
      setErro(traduzirErro(e));
    }
    carregar();
  }

  async function visivelArquivo(a: Arquivo) {
    const { error } = await supabase().from("hub_arquivos").update({ visivel_cliente: !a.visivel_cliente }).eq("id", a.id);
    if (error) return setErro(traduzirErro(error));
    void carregar();
  }

  const totalTaxas = taxas.reduce((s, t) => s + (t.valor ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto">
          <Link href="/societario" className="text-sm text-neutral-500 hover:underline">
            ← Processos
          </Link>
          <h1 className="text-xl font-semibold text-[var(--marca)]">
            #{p.numero} · {nome}
          </h1>
          <p className="text-sm text-neutral-600">
            {tipo?.nome} · pedido em {fmtData(p.pedido_em)}
            {p.previsao_em && ` · previsão ${fmtData(p.previsao_em)}`}
            {p.uf && ` · ${p.uf}`}
            {p.cnpj && ` · ${p.cnpj}`}
          </p>
          {p.descricao && <p className="mt-1 max-w-3xl whitespace-pre-wrap text-sm">{p.descricao}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`chip ${aberto ? "bg-sky-50 text-sky-800" : p.status === "concluido" ? "bg-emerald-50 text-emerald-800" : "bg-neutral-100 text-neutral-500"}`}
          >
            {aberto ? "Em andamento" : p.status === "concluido" ? `Concluído em ${fmtData(p.concluido_em)}` : "Cancelado"}
          </span>
          {podeOperar && (
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={p.visivel_cliente}
                onChange={async (e) => {
                  const { error } = await supabase().from("soc_processos").update({ visivel_cliente: e.target.checked }).eq("id", p.id);
                  if (error) return setErro(traduzirErro(error));
                  void carregar();
                }}
              />
              Cliente acompanha no portal
            </label>
          )}
          {aberto && podeOperar && (
            <button
              className="btn"
              onClick={() =>
                confirm("Concluir o processo agora? As fases pendentes serão dispensadas.") &&
                rpc("soc_concluir_processo", { p_proc: p.id })
              }
            >
              Concluir processo
            </button>
          )}
          {aberto && podeGerir && (
            <button
              className="btn text-[var(--perigo)]"
              onClick={() => {
                const m = prompt("Motivo do cancelamento:");
                if (m !== null) rpc("soc_cancelar_processo", { p_proc: p.id, p_motivo: m });
              }}
            >
              Cancelar
            </button>
          )}
        </div>
      </div>

      {erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{erro}</p>}

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <section className="cartao overflow-x-auto">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Fase</th>
                  <th>Status</th>
                  <th>Responsável</th>
                  <th>Prazo</th>
                  <th>Início / fim</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {fases.map((f) => {
                  const atual = aberto && f.ordem === p.fase_atual;
                  const d = diasAte(f.prazo_em, org.fuso);
                  return (
                    <tr
                      key={f.id}
                      className={
                        atual ? "bg-[color-mix(in_srgb,var(--destaque)_14%,white)]" : f.status === "dispensada" ? "text-neutral-400" : ""
                      }
                    >
                      <td>
                        <div className="font-medium">{f.nome}</div>
                        {atual && <div className="text-xs text-neutral-500">fase atual · há {diasParado(f.mudou_em)} dia(s)</div>}
                      </td>
                      <td>
                        {aberto && podeOperar ? (
                          <select
                            className={`entrada !min-h-8 !py-1 text-sm`}
                            value={f.status}
                            onChange={(e) => rpc("soc_mudar_fase", { p_fase: f.id, p_status: e.target.value as StatusFase })}
                          >
                            {STATUS_FASE.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.nome}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className={`chip ${corStatusFase(f.status)}`}>{nomeStatusFase(f.status)}</span>
                        )}
                      </td>
                      <td>
                        {aberto && podeOperar && f.status !== "dispensada" && f.status !== "concluida" ? (
                          <select
                            className="entrada !min-h-8 !py-1 text-sm"
                            value={f.responsavel_id ?? ""}
                            onChange={(e) => atualizarFase(f, { responsavel_id: e.target.value || null })}
                          >
                            <option value="">—</option>
                            {membros
                              .filter((m) => m.ativo)
                              .map((m) => (
                                <option key={m.user_id} value={m.user_id}>
                                  {m.nome}
                                </option>
                              ))}
                          </select>
                        ) : (
                          nomeMembro(f.responsavel_id)
                        )}
                      </td>
                      <td>
                        {aberto && podeOperar && f.status !== "dispensada" && f.status !== "concluida" ? (
                          <input
                            type="date"
                            className={`entrada !min-h-8 !py-1 text-sm ${d !== null && d < 0 ? "!border-red-300 text-red-700" : ""}`}
                            value={f.prazo_em ?? ""}
                            onChange={(e) => atualizarFase(f, { prazo_em: e.target.value || null })}
                          />
                        ) : (
                          fmtData(f.prazo_em)
                        )}
                      </td>
                      <td className="whitespace-nowrap text-xs text-neutral-500">
                        {fmtData(f.inicio_em)} → {fmtData(f.fim_em)}
                      </td>
                      <td className="whitespace-nowrap">
                        {podeOperar && (
                          <label className="btn-link cursor-pointer" title="Anexar documento nesta fase">
                            anexar
                            <input type="file" multiple className="hidden" onChange={(e) => anexar(e.target.files, f.nome)} />
                          </label>
                        )}
                        {f.tarefa_id && (
                          <Link href="/tarefas" className="btn-link ml-2" title="A fase tem uma tarefa no MDC Tarefas">
                            tarefa
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <div className="grid gap-5 md:grid-cols-2">
            <Bloco titulo="Protocolos">
              {protocolos.map((x) => (
                <li key={x.id}>
                  <b>{x.orgao}</b> nº {x.numero} · {fmtData(x.data)}
                  {x.link && (
                    <a href={x.link} target="_blank" rel="noopener" className="btn-link ml-2">
                      acompanhar
                    </a>
                  )}
                </li>
              ))}
              {podeOperar && aberto && (
                <FormLinha
                  campos={[
                    { nome: "orgao", rotulo: "Órgão", opcoes: ORGAOS },
                    { nome: "numero", rotulo: "Número" },
                    { nome: "data", rotulo: "Data", tipo: "date" },
                    { nome: "link", rotulo: "Link (opcional)", opcional: true },
                  ]}
                  botao="Registrar protocolo"
                  aoEnviar={(v) => inserir("soc_protocolos", v, `Protocolado na ${v.orgao} nº ${v.numero} em ${fmtData(v.data)}`, true)}
                />
              )}
            </Bloco>

            <Bloco titulo={`Exigências (${p.exigencias})`}>
              {exigencias.map((x) => (
                <li key={x.id}>
                  <div>
                    <b>{x.orgao}</b> · {fmtData(x.data)}
                  </div>
                  <div className="whitespace-pre-wrap text-neutral-700">{x.texto}</div>
                  {x.resposta ? (
                    <div className="text-xs text-emerald-700">
                      Respondida{x.reprotocolo_em && `, reprotocolo ${fmtData(x.reprotocolo_em)}`}: {x.resposta}
                    </div>
                  ) : (
                    podeOperar && (
                      <button
                        className="btn-link"
                        onClick={async () => {
                          const r = prompt("Resposta à exigência:");
                          if (!r) return;
                          const { error } = await supabase()
                            .from("soc_exigencias")
                            .update({ resposta: r, reprotocolo_em: hojeISO(org.fuso) })
                            .eq("id", x.id);
                          if (error) return setErro(traduzirErro(error));
                          void carregar();
                        }}
                      >
                        registrar resposta
                      </button>
                    )
                  )}
                </li>
              ))}
              {podeOperar && aberto && (
                <FormLinha
                  campos={[
                    { nome: "orgao", rotulo: "Órgão", opcoes: ORGAOS },
                    { nome: "texto", rotulo: "Texto da exigência", area: true },
                  ]}
                  botao="Registrar exigência"
                  aoEnviar={(v) => rpc("soc_registrar_exigencia", { p_proc: p.id, p_orgao: v.orgao, p_texto: v.texto })}
                />
              )}
            </Bloco>

            <Bloco titulo={`Taxas${totalTaxas ? ` · ${brl(totalTaxas)}` : ""}`}>
              {taxas.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-2">
                  <span>
                    {x.descricao} · {brl(x.valor)} · vence {fmtData(x.vencimento)}{" "}
                    {x.pago_por && `· paga por ${x.pago_por === "mdc" ? "MDC" : "cliente"}`}
                  </span>
                  {x.pago_em ? (
                    <span className="chip bg-emerald-50 text-emerald-800">paga {fmtData(x.pago_em)}</span>
                  ) : (
                    podeOperar && (
                      <button
                        className="btn-link"
                        onClick={async () => {
                          const { error } = await supabase()
                            .from("soc_taxas")
                            .update({ pago_em: hojeISO(org.fuso) })
                            .eq("id", x.id);
                          if (error) return setErro(traduzirErro(error));
                          void carregar();
                        }}
                      >
                        marcar paga
                      </button>
                    )
                  )}
                </li>
              ))}
              {podeOperar && aberto && (
                <FormLinha
                  campos={[
                    {
                      nome: "descricao",
                      rotulo: "Taxa",
                      opcoes: ["DARE Junta Comercial", "GRU", "Taxa municipal", "Taxa Bombeiros", "Taxa Vigilância", "Outra"],
                    },
                    { nome: "valor", rotulo: "Valor (R$)", tipo: "number" },
                    { nome: "vencimento", rotulo: "Vencimento", tipo: "date", opcional: true },
                    { nome: "pago_por", rotulo: "Paga por", opcoes: ["cliente", "mdc"] },
                  ]}
                  botao="Registrar taxa"
                  aoEnviar={(v) =>
                    inserir(
                      "soc_taxas",
                      { ...v, valor: v.valor ? Number(String(v.valor).replace(",", ".")) : null },
                      `Taxa registrada: ${v.descricao}`,
                    )
                  }
                />
              )}
            </Bloco>

            <Bloco titulo="Documentos">
              {arquivos.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2">
                  <button
                    className="truncate text-left hover:underline"
                    onClick={() => abrirArquivo(a.caminho, a.nome).catch((e) => setErro(traduzirErro(e)))}
                  >
                    {a.nome} <span className="text-xs text-neutral-400">{fmtTamanho(a.tamanho)}</span>
                  </button>
                  {podeOperar && p.cliente_id && (
                    <label className="flex shrink-0 items-center gap-1 text-xs text-neutral-500">
                      <input type="checkbox" checked={a.visivel_cliente} onChange={() => visivelArquivo(a)} /> no portal
                    </label>
                  )}
                </li>
              ))}
              {podeOperar && (
                <label className="btn mt-2 cursor-pointer">
                  Anexar documentos
                  <input type="file" multiple className="hidden" onChange={(e) => anexar(e.target.files)} />
                </label>
              )}
            </Bloco>
          </div>
        </div>

        <aside className="cartao h-fit p-4">
          <h2 className="mb-3 font-semibold">Linha do tempo</h2>
          {podeOperar && (
            <form onSubmit={comentar} className="mb-4 space-y-2">
              <textarea
                className="entrada w-full"
                rows={2}
                placeholder="Comentário da equipe…"
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
              />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-xs text-neutral-600">
                  <input type="checkbox" checked={comentarioCliente} onChange={(e) => setComentarioCliente(e.target.checked)} /> mostrar ao
                  cliente
                </label>
                <button className="btn-primario !min-h-8 !py-1">Comentar</button>
              </div>
            </form>
          )}
          <ol className="space-y-3 text-sm">
            {eventos.map((e) => (
              <li key={e.id} className="border-l-2 border-[var(--borda)] pl-3">
                <div className="whitespace-pre-wrap">{e.texto}</div>
                <div className="text-xs text-neutral-400">
                  {fmtDataHora(e.em)} · {nomeMembro(e.user_id)}
                  {e.visivel_cliente && " · visível ao cliente"}
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="cartao p-4">
      <h2 className="mb-2 font-semibold">{titulo}</h2>
      <ul className="space-y-2 text-sm">{children}</ul>
    </section>
  );
}

type Campo = { nome: string; rotulo: string; tipo?: string; opcoes?: string[]; area?: boolean; opcional?: boolean };

function FormLinha({ campos, botao, aoEnviar }: { campos: Campo[]; botao: string; aoEnviar: (v: Record<string, string>) => void }) {
  const { org } = useOrg();
  const [aberto, setAberto] = useState(false);
  const inicial = () =>
    Object.fromEntries(campos.map((c) => [c.nome, c.tipo === "date" && !c.opcional ? hojeISO(org.fuso) : (c.opcoes?.[0] ?? "")]));
  const [v, setV] = useState<Record<string, string>>(inicial);
  if (!aberto)
    return (
      <li>
        <button className="btn-link" onClick={() => setAberto(true)}>
          + {botao.toLowerCase()}
        </button>
      </li>
    );
  return (
    <li>
      <form
        className="mt-1 space-y-2 rounded-lg bg-[var(--fundo)] p-2"
        onSubmit={(e) => {
          e.preventDefault();
          const limpo = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x === "" ? null : x])) as Record<string, string>;
          aoEnviar(limpo);
          setV(inicial());
          setAberto(false);
        }}
      >
        {campos.map((c) => (
          <label key={c.nome} className="campo">
            <span>{c.rotulo}</span>
            {c.opcoes ? (
              <select value={v[c.nome]} onChange={(e) => setV({ ...v, [c.nome]: e.target.value })}>
                {c.opcoes.map((o) => (
                  <option key={o} value={o}>
                    {o === "mdc" ? "MDC" : o}
                  </option>
                ))}
              </select>
            ) : c.area ? (
              <textarea required={!c.opcional} rows={3} value={v[c.nome]} onChange={(e) => setV({ ...v, [c.nome]: e.target.value })} />
            ) : (
              <input
                type={c.tipo ?? "text"}
                step={c.tipo === "number" ? "0.01" : undefined}
                required={!c.opcional}
                value={v[c.nome]}
                onChange={(e) => setV({ ...v, [c.nome]: e.target.value })}
              />
            )}
          </label>
        ))}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn !min-h-8 !py-1" onClick={() => setAberto(false)}>
            Cancelar
          </button>
          <button className="btn-primario !min-h-8 !py-1">{botao}</button>
        </div>
      </form>
    </li>
  );
}
