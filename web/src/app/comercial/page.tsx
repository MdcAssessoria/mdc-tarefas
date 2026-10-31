"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useOrg } from "@/lib/org";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { ETAPAS, ORIGENS, brl } from "@/lib/crm";
import type { Etapa, Oportunidade } from "@/lib/crm";
import { hojeISO } from "@/lib/datas";

export default function PaginaFunil() {
  return (
    <AppShell modulo="comercial">
      <Funil />
    </AppShell>
  );
}

const diasDesde = (iso: string) => Math.floor((Date.now() - Date.parse(iso)) / 864e5);

function Funil() {
  const { org, membros, pode, eu } = useOrg();
  const router = useRouter();
  const [lista, setLista] = useState<Oportunidade[] | null>(null);
  const [busca, setBusca] = useState("");
  const [origem, setOrigem] = useState("");
  const [resp, setResp] = useState("");
  const [verFechados, setVerFechados] = useState(false);
  const [verArquivados, setVerArquivados] = useState(false);
  const [limpar, setLimpar] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const podeGerir = pode("comercial", "gerir");
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const podeOperar = pode("comercial", "operar");

  const carregar = useCallback(async () => {
    const { data, error } = await supabase()
      .from("crm_oportunidades")
      .select("*")
      .eq("org_id", org.id)
      .order("atualizado_em", { ascending: false });
    if (error) return setErro(traduzirErro(error));
    setLista((data as Oportunidade[]) ?? []);
  }, [org.id]);

  useEffect(() => {
    carregar();
    const canal = supabase()
      .channel("crm-funil")
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_oportunidades", filter: `org_id=eq.${org.id}` }, () => carregar())
      .subscribe();
    return () => {
      supabase().removeChannel(canal);
    };
  }, [carregar, org.id]);

  const filtrada = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (lista ?? []).filter(
      (o) =>
        !!o.arquivado_em === verArquivados &&
        (!q ||
          `${o.empresa} ${o.razao_social ?? ""} ${o.contato_nome ?? ""} ${o.cnpj ?? ""} ${o.cidade ?? ""}`.toLowerCase().includes(q)) &&
        (!origem || o.origem === origem) &&
        (!resp || (resp === "sem" ? !o.responsavel_id : o.responsavel_id === resp)),
    );
  }, [lista, busca, origem, resp, verArquivados]);

  const kpis = useMemo(() => {
    const todos = lista ?? [];
    const l = todos.filter((o) => !o.arquivado_em);
    const hoje = hojeISO(org.fuso);
    const mes = hoje.slice(0, 7);
    const abertos = l.filter((o) => !["ganho", "perdido"].includes(o.etapa));
    const ganhos = todos.filter((o) => o.etapa === "ganho");
    const fechados = todos.filter((o) => ["ganho", "perdido"].includes(o.etapa));
    return {
      novosMes: l.filter((o) => o.criado_em.slice(0, 7) === mes).length,
      abertos: abertos.length,
      pipeline: abertos.reduce((a, o) => a + (o.valor_mensal ?? 0), 0),
      conversao: fechados.length ? ganhos.length / fechados.length : null,
      ticket: ganhos.length ? ganhos.reduce((a, o) => a + (o.valor_mensal ?? 0), 0) / ganhos.length : null,
      atrasados: abertos.filter((o) => o.proximo_contato && o.proximo_contato < hoje).length,
    };
  }, [lista, org.fuso]);

  async function mover(id: string, etapa: Etapa) {
    const o = lista?.find((x) => x.id === id);
    if (!o || o.etapa === etapa) return;
    let motivo: string | null = null;
    if (etapa === "perdido") {
      motivo = prompt("Motivo da perda (preço, escolheu outro escritório, sem retorno…):") ?? null;
      if (motivo === null) return;
    }
    if (etapa === "ganho" && !confirm(`Marcar ${o.empresa} como ganho e cadastrar como cliente da carteira?`)) return;
    setLista((l) => l?.map((x) => (x.id === id ? { ...x, etapa } : x)) ?? null);
    const sb = supabase();
    const r =
      etapa === "ganho"
        ? await sb.rpc("crm_converter_cliente", { p_op: id })
        : await sb.from("crm_oportunidades").update({ etapa, motivo_perda: motivo }).eq("id", id);
    if (r.error) setErro(traduzirErro(r.error));
    carregar();
  }

  async function arquivar(ids: string[], motivo: string | null, arquivarSim = true) {
    if (!ids.length) return;
    const { data, error } = await supabase().rpc("crm_arquivar", { p_ids: ids, p_motivo: motivo, p_arquivar: arquivarSim });
    if (error) return setErro(traduzirErro(error));
    setAviso(
      arquivarSim
        ? `${data} oportunidade(s) arquivada(s). Ficam em "Arquivados" e podem ser restauradas.`
        : `${data} oportunidade(s) de volta ao funil.`,
    );
    carregar();
  }

  async function excluir(o: Oportunidade) {
    if (
      !confirm(`Excluir ${o.empresa} de vez? Atividades e contratos em rascunho também são apagados. Para só tirar do funil, use Arquivar.`)
    )
      return;
    const { error } = await supabase().from("crm_oportunidades").delete().eq("id", o.id);
    if (error) return setErro(traduzirErro(error));
    setAviso(`${o.empresa} excluída.`);
    carregar();
  }

  const nArquivados = (lista ?? []).filter((o) => o.arquivado_em).length;

  const nomeMembro = (id: string | null) => membros.find((m) => m.user_id === id)?.nome?.split(" ")[0] ?? "—";
  const colunas = ETAPAS.filter((e) => verFechados || !["ganho", "perdido"].includes(e.id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold text-[var(--marca)]">Funil comercial</h1>
        {podeOperar && (
          <button className="btn" onClick={() => setLimpar(true)} title="Arquivar perdidos e leads parados">
            Limpar funil
          </button>
        )}
        {podeOperar && (
          <button className="btn-primario" onClick={() => setNovo(true)}>
            Nova oportunidade
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[
          { r: "Leads novos no mês", v: String(kpis.novosMes) },
          { r: "Em andamento", v: String(kpis.abertos) },
          { r: "Pipeline (honorários/mês)", v: brl(kpis.pipeline) },
          { r: "Taxa de conversão", v: kpis.conversao === null ? "—" : `${Math.round(kpis.conversao * 100)}%` },
          { r: "Ticket médio fechado", v: kpis.ticket === null ? "—" : brl(kpis.ticket) },
          { r: "Retornos atrasados", v: String(kpis.atrasados), alerta: kpis.atrasados > 0 },
        ].map((k) => (
          <div key={k.r} className="cartao p-3">
            <div className="text-xs text-neutral-500">{k.r}</div>
            <div className={`mt-1 text-xl font-semibold tabular-nums ${k.alerta ? "text-[var(--perigo)]" : "text-[var(--marca)]"}`}>
              {k.v}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          className="entrada w-64"
          placeholder="Buscar empresa, contato, CNPJ, cidade…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <select className="entrada" value={origem} onChange={(e) => setOrigem(e.target.value)}>
          <option value="">Todas as origens</option>
          {ORIGENS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome}
            </option>
          ))}
        </select>
        <select className="entrada" value={resp} onChange={(e) => setResp(e.target.value)}>
          <option value="">Todos os responsáveis</option>
          <option value={eu.user_id}>Meus</option>
          <option value="sem">Sem responsável</option>
          {membros
            .filter((m) => m.ativo)
            .map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.nome}
              </option>
            ))}
        </select>
        {!verArquivados && (
          <label className="ml-auto flex items-center gap-2 text-sm text-neutral-600">
            <input type="checkbox" checked={verFechados} onChange={(e) => setVerFechados(e.target.checked)} /> Mostrar ganhos e perdidos
          </label>
        )}
        <button
          className={`btn ${verArquivados ? "!border-[var(--marca)] !bg-[var(--marca)] !text-white" : ""} ${verArquivados ? "ml-auto" : ""}`}
          onClick={() => setVerArquivados((x) => !x)}
        >
          {verArquivados ? "Voltar ao funil" : `Arquivados (${nArquivados})`}
        </button>
      </div>

      {erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{erro}</p>}
      {aviso && <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">{aviso}</p>}
      {lista === null ? (
        <p className="text-sm text-neutral-500">Carregando…</p>
      ) : verArquivados ? (
        <div className="cartao overflow-x-auto">
          <table className="tabela">
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Etapa em que parou</th>
                <th>Motivo</th>
                <th>Arquivada em</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtrada.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-sm text-neutral-500">
                    Nada arquivado.
                  </td>
                </tr>
              )}
              {filtrada.map((o) => (
                <tr key={o.id}>
                  <td>
                    <button className="text-left font-medium hover:underline" onClick={() => router.push(`/comercial/${o.id}`)}>
                      {o.empresa}
                    </button>
                    <div className="text-xs text-neutral-500">
                      {[o.contato_nome, ORIGENS.find((x) => x.id === o.origem)?.nome].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td>{ETAPAS.find((x) => x.id === o.etapa)?.nome}</td>
                  <td className="text-sm text-neutral-600">{o.motivo_arquivo || o.motivo_perda || "—"}</td>
                  <td className="whitespace-nowrap text-sm text-neutral-600">
                    {o.arquivado_em ? new Date(o.arquivado_em).toLocaleDateString("pt-BR") : ""}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    {podeOperar && (
                      <button className="btn-link mr-3" onClick={() => arquivar([o.id], null, false)}>
                        Restaurar
                      </button>
                    )}
                    {podeGerir && !o.cliente_id && (
                      <button className="btn-link !text-[var(--perigo)]" onClick={() => excluir(o)}>
                        Excluir
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {colunas.map((col) => {
            const itens = filtrada.filter((o) => o.etapa === col.id);
            const soma = itens.reduce((a, o) => a + (o.valor_mensal ?? 0), 0);
            return (
              <section
                key={col.id}
                className={`flex w-72 shrink-0 flex-col rounded-xl border border-[var(--borda)] bg-[#efece3] ${arrastando ? "outline-dashed outline-1 outline-[var(--destaque-escuro)]" : ""}`}
                onDragOver={(e) => podeOperar && e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain");
                  setArrastando(null);
                  if (id) mover(id, col.id);
                }}
              >
                <header className="px-3 pb-2 pt-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold">{col.nome}</h2>
                    <span className="chip bg-white text-neutral-700">{itens.length}</span>
                  </div>
                  <p className="text-[11px] text-neutral-500">
                    {col.dica}
                    {soma > 0 && ` · ${brl(soma)}/mês`}
                  </p>
                </header>
                <div className="flex min-h-24 flex-col gap-2 px-2 pb-3">
                  {itens.map((o) => {
                    const parado = diasDesde(o.etapa_desde);
                    const atrasado = o.proximo_contato && o.proximo_contato < hojeISO(org.fuso);
                    return (
                      <article
                        key={o.id}
                        draggable={podeOperar}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", o.id);
                          setArrastando(o.id);
                        }}
                        onDragEnd={() => setArrastando(null)}
                        onClick={() => router.push(`/comercial/${o.id}`)}
                        className="cursor-pointer rounded-lg border border-[var(--borda)] bg-white p-3 text-sm shadow-sm hover:border-[var(--destaque-escuro)]"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-medium leading-snug">{o.empresa}</div>
                          {podeOperar && (
                            <MenuCartao
                              aoArquivar={() => {
                                const m = prompt(
                                  `Arquivar ${o.empresa}? Motivo (opcional): sem retorno, sem interesse, duplicado…`,
                                  "Sem retorno",
                                );
                                if (m !== null) arquivar([o.id], m);
                              }}
                              aoExcluir={podeGerir && !o.cliente_id ? () => excluir(o) : undefined}
                            />
                          )}
                        </div>
                        <div className="mt-0.5 text-xs text-neutral-500">
                          {[o.contato_nome, o.cidade && `${o.cidade}${o.uf ? `/${o.uf}` : ""}`].filter(Boolean).join(" · ")}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="chip bg-[var(--fundo)] text-neutral-700">
                            {ORIGENS.find((x) => x.id === o.origem)?.nome ?? o.origem}
                          </span>
                          {o.valor_mensal ? <span className="chip bg-emerald-50 text-emerald-800">{brl(o.valor_mensal)}/mês</span> : null}
                          {o.origem === "simulador" &&
                            typeof o.dados_origem?.economia_estimada === "number" &&
                            (o.dados_origem.economia_estimada as number) > 0 && (
                              <span className="chip bg-amber-50 text-amber-900">
                                economia {brl(o.dados_origem.economia_estimada as number)}
                              </span>
                            )}
                        </div>
                        <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-500">
                          <span>{nomeMembro(o.responsavel_id)}</span>
                          <span
                            className={
                              atrasado
                                ? "font-medium text-[var(--perigo)]"
                                : parado > 7 && !["ganho", "perdido"].includes(o.etapa)
                                  ? "text-amber-700"
                                  : ""
                            }
                          >
                            {atrasado ? `retorno ${o.proximo_contato!.split("-").reverse().join("/")}` : `${parado}d na etapa`}
                          </span>
                        </div>
                        {podeOperar && (
                          <select
                            className="entrada mt-2 !min-h-7 w-full !py-0.5 text-xs md:hidden"
                            value={o.etapa}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => mover(o.id, e.target.value as Etapa)}
                          >
                            {ETAPAS.map((x) => (
                              <option key={x.id} value={x.id}>
                                Mover para: {x.nome}
                              </option>
                            ))}
                          </select>
                        )}
                      </article>
                    );
                  })}
                  {!itens.length && <p className="px-1 py-4 text-center text-xs text-neutral-400">Arraste um card para cá</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {limpar && (
        <LimparFunil
          lista={(lista ?? []).filter((o) => !o.arquivado_em)}
          aoFechar={() => setLimpar(false)}
          aoConfirmar={async (ids, motivo) => {
            setLimpar(false);
            await arquivar(ids, motivo);
          }}
        />
      )}
      {novo && <NovaOportunidade aoFechar={() => setNovo(false)} aoCriar={(id) => router.push(`/comercial/${id}`)} />}
    </div>
  );
}

function NovaOportunidade({ aoFechar, aoCriar }: { aoFechar: () => void; aoCriar: (id: string) => void }) {
  const { org, eu } = useOrg();
  const [f, setF] = useState({
    empresa: "",
    contato_nome: "",
    whatsapp: "",
    email: "",
    cnpj: "",
    cidade: "",
    uf: "SP",
    origem: "indicacao",
    valor_mensal: "",
  });
  const [erro, setErro] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const { data, error } = await supabase()
      .from("crm_oportunidades")
      .insert({
        org_id: org.id,
        empresa: f.empresa.trim(),
        contato_nome: f.contato_nome.trim() || null,
        whatsapp: f.whatsapp.trim() || null,
        email: f.email.trim() || null,
        cnpj: f.cnpj.trim() || null,
        cidade: f.cidade.trim() || null,
        uf: f.uf.trim().toUpperCase() || null,
        origem: f.origem,
        valor_mensal: f.valor_mensal ? Number(f.valor_mensal.replace(/\./g, "").replace(",", ".")) : null,
        responsavel_id: eu.user_id,
        criado_por: eu.user_id,
      })
      .select("id")
      .single();
    if (error) return setErro(traduzirErro(error));
    aoCriar((data as { id: string }).id);
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" onClick={aoFechar}>
      <form onSubmit={salvar} onClick={(e) => e.stopPropagation()} className="cartao w-full max-w-lg space-y-3 p-5">
        <h2 className="text-lg font-semibold text-[var(--marca)]">Nova oportunidade</h2>
        <label className="campo">
          <span>Empresa *</span>
          <input required value={f.empresa} onChange={set("empresa")} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="campo">
            <span>Contato</span>
            <input value={f.contato_nome} onChange={set("contato_nome")} />
          </label>
          <label className="campo">
            <span>WhatsApp</span>
            <input value={f.whatsapp} onChange={set("whatsapp")} />
          </label>
          <label className="campo">
            <span>E-mail</span>
            <input type="email" value={f.email} onChange={set("email")} />
          </label>
          <label className="campo">
            <span>CNPJ</span>
            <input value={f.cnpj} onChange={set("cnpj")} />
          </label>
          <label className="campo">
            <span>Cidade</span>
            <input value={f.cidade} onChange={set("cidade")} />
          </label>
          <label className="campo">
            <span>UF</span>
            <input maxLength={2} value={f.uf} onChange={set("uf")} />
          </label>
          <label className="campo">
            <span>Origem</span>
            <select value={f.origem} onChange={set("origem")}>
              {ORIGENS.filter((o) => o.id !== "simulador").map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Honorário estimado (R$/mês)</span>
            <input inputMode="decimal" value={f.valor_mensal} onChange={set("valor_mensal")} />
          </label>
        </div>
        {erro && <p className="text-sm text-red-700">{erro}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={aoFechar}>
            Cancelar
          </button>
          <button className="btn-primario">Criar</button>
        </div>
        <p className="text-xs text-neutral-500">
          Leads do Simulador de Regime entram sozinhos no funil.{" "}
          <Link href="/comercial/modelo" className="underline">
            Modelo de contrato
          </Link>
        </p>
      </form>
    </div>
  );
}

function MenuCartao({ aoArquivar, aoExcluir }: { aoArquivar: () => void; aoExcluir?: () => void }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="relative -mr-1 -mt-1" onClick={(e) => e.stopPropagation()}>
      <button
        className="grid h-6 w-6 place-items-center rounded-md text-neutral-400 hover:bg-[var(--fundo)] hover:text-[var(--marca)]"
        aria-label="Ações"
        onClick={() => setAberto((x) => !x)}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
      >
        ⋯
      </button>
      {aberto && (
        <div className="surgir absolute right-0 z-20 mt-1 w-40 rounded-lg border border-[var(--borda)] bg-white py-1 text-sm shadow-lg">
          <button className="block w-full px-3 py-1.5 text-left hover:bg-[var(--fundo)]" onMouseDown={aoArquivar}>
            Arquivar (dar baixa)
          </button>
          {aoExcluir && (
            <button className="block w-full px-3 py-1.5 text-left text-[var(--perigo)] hover:bg-red-50" onMouseDown={aoExcluir}>
              Excluir
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Dar baixa em lote: perdidos e leads que não avançaram há X dias. */
function LimparFunil({
  lista,
  aoFechar,
  aoConfirmar,
}: {
  lista: Oportunidade[];
  aoFechar: () => void;
  aoConfirmar: (ids: string[], motivo: string) => void;
}) {
  const [perdidos, setPerdidos] = useState(true);
  const [parados, setParados] = useState(true);
  const [dias, setDias] = useState(30);
  const [etapas, setEtapas] = useState<Etapa[]>(["novo", "contato"]);
  const alvo = lista.filter(
    (o) => (perdidos && o.etapa === "perdido") || (parados && etapas.includes(o.etapa) && diasDesde(o.etapa_desde) >= dias),
  );
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={aoFechar}>
      <div onClick={(e) => e.stopPropagation()} className="cartao w-full max-w-lg space-y-4 p-5">
        <div>
          <h2 className="text-lg font-semibold text-[var(--marca)]">Limpar funil</h2>
          <p className="text-sm text-neutral-600">
            Arquiva de uma vez o que não vai para frente. Nada é apagado: fica em Arquivados e pode ser restaurado.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--marca)]"
            checked={perdidos}
            onChange={(e) => setPerdidos(e.target.checked)}
          />
          Oportunidades marcadas como perdidas
        </label>
        <div className="space-y-2">
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--marca)]"
              checked={parados}
              onChange={(e) => setParados(e.target.checked)}
            />
            Paradas há pelo menos
            <input
              type="number"
              min={1}
              className="entrada !min-h-8 w-20"
              value={dias}
              onChange={(e) => setDias(Math.max(1, Number(e.target.value)))}
            />
            dias sem mudar de etapa em:
          </label>
          <div className="flex flex-wrap gap-3 pl-6 text-sm">
            {ETAPAS.filter((e) => !["ganho", "perdido"].includes(e.id)).map((e) => (
              <label key={e.id} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  className="accent-[var(--marca)]"
                  checked={etapas.includes(e.id)}
                  onChange={(ev) => setEtapas((x) => (ev.target.checked ? [...x, e.id] : x.filter((y) => y !== e.id)))}
                />
                {e.nome}
              </label>
            ))}
          </div>
        </div>
        <div className="max-h-48 overflow-y-auto rounded-lg border border-[var(--borda)] text-sm">
          {alvo.length === 0 ? (
            <p className="p-3 text-neutral-500">Nada se encaixa nesses critérios.</p>
          ) : (
            alvo.map((o) => (
              <div key={o.id} className="flex justify-between border-b border-[var(--borda)] px-3 py-1.5 last:border-0">
                <span className="truncate">{o.empresa}</span>
                <span className="shrink-0 text-xs text-neutral-500">
                  {ETAPAS.find((x) => x.id === o.etapa)?.nome} · {diasDesde(o.etapa_desde)}d
                </span>
              </div>
            ))
          )}
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={aoFechar}>
            Cancelar
          </button>
          <button
            className="btn-primario"
            disabled={!alvo.length}
            onClick={() =>
              aoConfirmar(
                alvo.map((o) => o.id),
                perdidos && !parados ? "Perdido" : "Sem avanço no funil",
              )
            }
          >
            Arquivar {alvo.length}
          </button>
        </div>
      </div>
    </div>
  );
}
