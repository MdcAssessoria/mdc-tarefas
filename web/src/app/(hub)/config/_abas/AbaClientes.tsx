// Aba "Clientes" das Configurações: cadastro, filtros, edição em lote, responsáveis por setor,
// inativação/reativação e "Colar lista".
"use client";

import { gruposDosClientes } from "@/dominios/clientes/grupos";
import { lerListaColada } from "@/dominios/clientes/listaColada";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useOrg } from "@/lib/org";
import { supabase } from "@/lib/supabase";
import { hojeISO } from "@/lib/datas";
import { REGIMES, SEGMENTOS } from "@/lib/types";
import { Etiquetas } from "@/components/Etiquetas";
import type { Cliente } from "@/lib/types";
import { traduzirErro } from "@/lib/erros";
import { fmtData } from "@/lib/formato/datas";
import { useMensagem } from "./useMensagem";

interface Resp {
  cliente_id: string;
  setor_id: string;
  user_id: string;
}

export function AbaClientes() {
  const { org, clientes, setores, membros, recarregar } = useOrg();
  const [busca, setBusca] = useState("");
  const [resps, setResps] = useState<Resp[]>([]);
  const [aberto, setAberto] = useState<string | null>(null);
  const [novo, setNovo] = useState({ razao_social: "", nome_fantasia: "", cnpj: "", regime: "simples" });
  const [csv, setCsv] = useState<string | null>(null);
  const [situacao, setSituacao] = useState<"ativos" | "inativos" | "todos">("ativos");
  const [inativando, setInativando] = useState<{ id: string; data: string; motivo: string; outro: string } | null>(null);
  const { mostrar, el } = useMensagem();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [lote, setLote] = useState<{ segmento: string; grupos: string[] }>({ segmento: "", grupos: [] });
  const [filtroSeg, setFiltroSeg] = useState("");
  const [filtroGrupo, setFiltroGrupo] = useState("");
  const todosGrupos = useMemo(() => gruposDosClientes(clientes), [clientes]);
  const pessoas = membros.filter((m) => m.ativo && m.papel !== "tv");

  async function confirmarInativacao() {
    if (!inativando) return;
    if (!inativando.data) return mostrar("Informe a data em que o cliente passou a ser inativo.", true);
    const motivo = inativando.motivo === "Outro" ? inativando.outro : inativando.motivo;
    const { data, error } = await supabase().rpc("inativar_cliente", {
      p_cliente: inativando.id,
      p_data: inativando.data,
      p_motivo: motivo || null,
    });
    if (error) return mostrar(traduzirErro(error), true);
    setInativando(null);
    mostrar(
      `Cliente inativado desde ${fmtData(inativando.data)}. ${data?.tarefas_canceladas ?? 0} tarefa(s) de competência posterior à saída cancelada(s).`,
    );
    void recarregar();
  }

  async function reativar(id: string) {
    const { data, error } = await supabase().rpc("reativar_cliente", { p_cliente: id });
    if (error) return mostrar(traduzirErro(error), true);
    mostrar(`Cliente reativado. ${data?.tarefas_restauradas ?? 0} tarefa(s) cancelada(s) pela inativação voltaram para "a fazer".`);
    void recarregar();
  }

  const carregarResps = useCallback(async () => {
    const { data, error } = await supabase().from("cliente_responsaveis").select("cliente_id,setor_id,user_id").eq("org_id", org.id);
    if (error) return mostrar(traduzirErro(error), true);
    setResps((data as Resp[]) ?? []);
  }, [org.id, mostrar]);
  useEffect(() => {
    void carregarResps();
  }, [carregarResps]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return clientes
      .filter((c) => situacao === "todos" || (situacao === "ativos" ? c.ativo : !c.ativo))
      .filter((c) => !filtroSeg || (filtroSeg === "_sem" ? !c.segmento : c.segmento === filtroSeg))
      .filter((c) => !filtroGrupo || (c.grupos ?? []).includes(filtroGrupo))
      .filter(
        (c) =>
          !q ||
          `${c.razao_social} ${c.nome_fantasia ?? ""} ${c.cnpj ?? ""} ${c.codigo_dominio ?? ""} ${c.cidade ?? ""} ${c.uf ?? ""}`
            .toLowerCase()
            .includes(q),
      );
  }, [clientes, busca, situacao, filtroSeg, filtroGrupo]);
  const nAtivos = clientes.filter((c) => c.ativo).length;

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase()
      .from("clientes")
      .insert({ ...novo, org_id: org.id, nome_fantasia: novo.nome_fantasia || null, cnpj: novo.cnpj || null });
    if (error) return mostrar(error.message.includes("clientes_org_cnpj_uk") ? "CNPJ já cadastrado." : traduzirErro(error), true);
    setNovo({ razao_social: "", nome_fantasia: "", cnpj: "", regime: novo.regime });
    void recarregar();
  }

  async function alterar(id: string, campos: Partial<Cliente>) {
    const { error } = await supabase().from("clientes").update(campos).eq("id", id);
    if (error) return mostrar(traduzirErro(error), true);
    void recarregar();
  }

  async function aplicarLote() {
    const ids = [...sel];
    if (!ids.length) return;
    if (!lote.segmento && !lote.grupos.length) return mostrar("Escolha um segmento ou um grupo para aplicar.", true);
    const sb = supabase();
    for (const id of ids) {
      const c = clientes.find((x) => x.id === id);
      const campos: Partial<Cliente> = {};
      if (lote.segmento) campos.segmento = lote.segmento === "_limpar" ? null : lote.segmento;
      if (lote.grupos.length) campos.grupos = [...new Set([...(c?.grupos ?? []), ...lote.grupos])];
      const { error } = await sb.from("clientes").update(campos).eq("id", id);
      if (error) return mostrar(traduzirErro(error), true);
    }
    mostrar(`${ids.length} cliente(s) atualizado(s).`);
    setSel(new Set());
    setLote({ segmento: "", grupos: [] });
    void recarregar();
  }

  async function definirResp(clienteId: string, setorId: string, userId: string) {
    const sb = supabase();
    const { error } = userId
      ? await sb.from("cliente_responsaveis").upsert({ org_id: org.id, cliente_id: clienteId, setor_id: setorId, user_id: userId })
      : await sb.from("cliente_responsaveis").delete().eq("cliente_id", clienteId).eq("setor_id", setorId);
    if (error) return mostrar(traduzirErro(error), true);
    void carregarResps();
  }

  async function importar() {
    if (!csv) return;
    const registros = lerListaColada(csv, org.id);
    if (!registros.length) return mostrar("Nenhuma linha válida encontrada.", true);
    const { error } = await supabase().from("clientes").insert(registros);
    if (error) return mostrar(traduzirErro(error), true);
    mostrar(`${registros.length} clientes importados.`);
    setCsv(null);
    void recarregar();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={adicionar} className="cartao grid gap-3 p-4 md:grid-cols-[2fr_1.5fr_1.2fr_1.2fr_auto] md:items-end">
        <label className="campo">
          <span>Razão social</span>
          <input required value={novo.razao_social} onChange={(e) => setNovo({ ...novo, razao_social: e.target.value })} />
        </label>
        <label className="campo">
          <span>Nome curto (aparece na TV)</span>
          <input value={novo.nome_fantasia} onChange={(e) => setNovo({ ...novo, nome_fantasia: e.target.value })} />
        </label>
        <label className="campo">
          <span>CNPJ/CPF</span>
          <input value={novo.cnpj} onChange={(e) => setNovo({ ...novo, cnpj: e.target.value })} />
        </label>
        <label className="campo">
          <span>Regime</span>
          <select value={novo.regime} onChange={(e) => setNovo({ ...novo, regime: e.target.value })}>
            {REGIMES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </select>
        </label>
        <button className="btn-primario">Adicionar</button>
      </form>

      <div className="flex flex-wrap gap-2">
        <div className="flex overflow-hidden rounded-md border border-[var(--borda)] text-sm">
          {(
            [
              ["ativos", `Ativos (${nAtivos})`],
              ["inativos", `Inativos (${clientes.length - nAtivos})`],
              ["todos", `Todos (${clientes.length})`],
            ] as const
          ).map(([id, nome]) => (
            <button
              key={id}
              onClick={() => setSituacao(id)}
              className={`px-3 py-1.5 ${situacao === id ? "bg-[var(--marca)] text-white" : "bg-white"}`}
            >
              {nome}
            </button>
          ))}
        </div>
        <input
          className="entrada flex-1"
          placeholder="Buscar cliente, CNPJ, código, cidade ou UF"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <select className="entrada w-44" value={filtroSeg} onChange={(e) => setFiltroSeg(e.target.value)} aria-label="Segmento">
          <option value="">Todos os segmentos</option>
          <option value="_sem">Sem segmento</option>
          {SEGMENTOS.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nome}
            </option>
          ))}
        </select>
        <select className="entrada w-44" value={filtroGrupo} onChange={(e) => setFiltroGrupo(e.target.value)} aria-label="Grupo">
          <option value="">Todos os grupos</option>
          {todosGrupos.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <Link className="btn-primario" href="/clientes/importar">
          Importar do Domínio / planilha
        </Link>
        <button className="btn" onClick={() => setCsv(csv === null ? "" : null)}>
          Colar lista
        </button>
      </div>
      {csv !== null && (
        <div className="cartao space-y-2 p-4">
          <p className="text-sm text-[var(--texto-suave)]">
            Cole uma linha por cliente, separada por ponto e vírgula ou tabulação (dá para copiar direto do Excel):{" "}
            <code>Razão social; CNPJ; regime; nome curto</code>. Regime: simples, presumido, real, mei…
          </p>
          <textarea className="entrada h-40 w-full font-mono text-xs" value={csv} onChange={(e) => setCsv(e.target.value)} />
          <button className="btn-primario" onClick={importar}>
            Importar
          </button>
        </div>
      )}
      {el}
      {sel.size > 0 && (
        <div className="cartao sticky top-2 z-20 flex flex-wrap items-center gap-3 border-[var(--destaque-escuro)] p-3">
          <b className="text-sm text-[var(--marca)]">{sel.size} selecionado(s)</b>
          <select
            className="entrada w-48"
            value={lote.segmento}
            onChange={(e) => setLote({ ...lote, segmento: e.target.value })}
            aria-label="Segmento em lote"
          >
            <option value="">Segmento: manter</option>
            {SEGMENTOS.map((x) => (
              <option key={x.id} value={x.id}>
                Segmento: {x.nome}
              </option>
            ))}
            <option value="_limpar">Segmento: limpar</option>
          </select>
          <div className="min-w-64 flex-1">
            <Etiquetas
              valor={lote.grupos}
              aoMudar={(g) => setLote({ ...lote, grupos: g })}
              sugestoes={todosGrupos}
              placeholder="Incluir grupos (Enter)…"
              compacto
            />
          </div>
          <button className="btn-primario" onClick={aplicarLote}>
            Aplicar
          </button>
          <button className="btn-link" onClick={() => setSel(new Set())}>
            Limpar seleção
          </button>
        </div>
      )}
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead>
            <tr>
              <th className="w-8">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--marca)]"
                  aria-label="Selecionar todos"
                  checked={lista.length > 0 && lista.every((c) => sel.has(c.id))}
                  onChange={(e) => setSel(e.target.checked ? new Set(lista.map((c) => c.id)) : new Set())}
                />
              </th>
              <th>Cliente</th>
              <th>CNPJ</th>
              <th>UF</th>
              <th>Regime</th>
              <th>Segmento e grupos</th>
              <th>Responsáveis</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((c) => {
              const rs = resps.filter((r) => r.cliente_id === c.id);
              return (
                <Fragment key={c.id}>
                  <tr className={c.ativo ? "" : "opacity-50"}>
                    <td>
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--marca)]"
                        aria-label={`Selecionar ${c.razao_social}`}
                        checked={sel.has(c.id)}
                        onChange={(e) =>
                          setSel((x) => {
                            const n = new Set(x);
                            if (e.target.checked) n.add(c.id);
                            else n.delete(c.id);
                            return n;
                          })
                        }
                      />
                    </td>
                    <td>
                      <div className="font-medium">{c.razao_social}</div>
                      {(c.nome_fantasia || c.codigo_dominio) && (
                        <div className="text-xs text-[var(--texto-suave)]">
                          {[c.codigo_dominio && `Domínio ${c.codigo_dominio}`, c.nome_fantasia, [c.cidade, c.uf].filter(Boolean).join("/")]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-[var(--texto-suave)]">{c.cnpj}</td>
                    <td className="text-[var(--texto-suave)]">{c.uf ?? "—"}</td>
                    <td>
                      <select
                        className="entrada"
                        value={c.regime ?? ""}
                        onChange={(e) => alterar(c.id, { regime: e.target.value || null })}
                      >
                        <option value="">—</option>
                        {REGIMES.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.nome}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="min-w-56">
                      <select
                        className="entrada mb-1 w-full"
                        value={c.segmento ?? ""}
                        onChange={(e) => alterar(c.id, { segmento: e.target.value || null })}
                        aria-label="Segmento"
                      >
                        <option value="">Segmento…</option>
                        {SEGMENTOS.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.nome}
                          </option>
                        ))}
                      </select>
                      <Etiquetas valor={c.grupos ?? []} aoMudar={(g) => alterar(c.id, { grupos: g })} sugestoes={todosGrupos} compacto />
                    </td>
                    <td>
                      <button className="btn-link" onClick={() => setAberto(aberto === c.id ? null : c.id)}>
                        {rs.length ? `${rs.length} definido(s)` : "Definir"}
                      </button>
                    </td>
                    <td className="whitespace-nowrap">
                      {c.ativo ? (
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">Ativo</span>
                          <button
                            className="btn-link text-xs"
                            onClick={() => setInativando({ id: c.id, data: hojeISO(org.fuso), motivo: "Saiu do escritório", outro: "" })}
                          >
                            Inativar
                          </button>
                        </div>
                      ) : (
                        <div>
                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-800">
                            Inativo{c.inativo_em ? ` desde ${fmtData(c.inativo_em)}` : ""}
                          </span>
                          {c.motivo_inativacao && <div className="mt-0.5 text-xs text-[var(--texto-suave)]">{c.motivo_inativacao}</div>}
                          <button className="btn-link text-xs" onClick={() => reativar(c.id)}>
                            Reativar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  {inativando?.id === c.id && (
                    <tr>
                      <td colSpan={8} className="bg-red-50/40">
                        <div className="grid gap-3 py-2 sm:grid-cols-[auto_auto_1fr_auto_auto] sm:items-end">
                          <label className="campo">
                            <span>Inativo a partir de *</span>
                            <input
                              type="date"
                              required
                              value={inativando.data}
                              onChange={(e) => setInativando({ ...inativando, data: e.target.value })}
                            />
                          </label>
                          <label className="campo">
                            <span>Motivo</span>
                            <select value={inativando.motivo} onChange={(e) => setInativando({ ...inativando, motivo: e.target.value })}>
                              {[
                                "Saiu do escritório",
                                "Transferida para outro escritório",
                                "Baixada / encerrada",
                                "Inadimplência",
                                "Outro",
                              ].map((m) => (
                                <option key={m}>{m}</option>
                              ))}
                            </select>
                          </label>
                          {inativando.motivo === "Outro" ? (
                            <label className="campo">
                              <span>Descreva</span>
                              <input
                                value={inativando.outro}
                                maxLength={300}
                                onChange={(e) => setInativando({ ...inativando, outro: e.target.value })}
                              />
                            </label>
                          ) : (
                            <span />
                          )}
                          <button className="btn-primario" onClick={confirmarInativacao}>
                            Confirmar inativação
                          </button>
                          <button className="btn" onClick={() => setInativando(null)}>
                            Cancelar
                          </button>
                        </div>
                        <p className="pb-2 text-xs text-[var(--texto-suave)]">
                          As competências até o mês da data informada continuam com o escritório. Tarefas abertas de competências
                          posteriores (e avulsas que vencem depois da data) são canceladas e deixam de ser geradas. Ao reativar, voltam.
                        </p>
                      </td>
                    </tr>
                  )}
                  {aberto === c.id && (
                    <tr>
                      <td colSpan={8} className="bg-[var(--fundo)]">
                        <div className="grid gap-3 py-2 sm:grid-cols-2 lg:grid-cols-4">
                          {setores
                            .filter((s) => s.ativo)
                            .map((s) => (
                              <label key={s.id} className="campo">
                                <span>{s.nome}</span>
                                <select
                                  value={rs.find((r) => r.setor_id === s.id)?.user_id ?? ""}
                                  onChange={(e) => definirResp(c.id, s.id, e.target.value)}
                                >
                                  <option value="">—</option>
                                  {pessoas.map((m) => (
                                    <option key={m.user_id} value={m.user_id}>
                                      {m.nome}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            ))}
                        </div>
                        <p className="pb-2 text-xs text-[var(--texto-suave)]">
                          As tarefas recorrentes deste cliente nascem atribuídas a essas pessoas.
                        </p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {lista.length === 0 && <p className="p-6 text-center text-sm text-[var(--texto-suave)]">Nenhum cliente.</p>}
      </div>
    </div>
  );
}
