"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useOrg } from "@/lib/org";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { diasAte } from "@/lib/datas";
import { COLUNAS, corStatusFase, diasParado, nomeStatusFase } from "@/lib/societario";
import type { SocFase, SocProcesso, SocTipo } from "@/lib/societario";
import { caminho } from "@/lib/caminho";
import { fmtData } from "@/lib/formato/datas";

export default function PaginaSocietario() {
  return (
    <AppShell modulo="societario">
      <Societario />
    </AppShell>
  );
}

type Visao = "quadro" | "lista";

function Societario() {
  const { org, membros, clientePorId, nomeMembro, pode } = useOrg();
  const [processos, setProcessos] = useState<SocProcesso[]>([]);
  const [fases, setFases] = useState<SocFase[]>([]);
  const [tipos, setTipos] = useState<SocTipo[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [visao, setVisao] = useState<Visao>("quadro");
  const [situacao, setSituacao] = useState<"aberto" | "concluido" | "todos">("aberto");
  const [tipo, setTipo] = useState("");
  const [resp, setResp] = useState("");
  const [uf, setUf] = useState("");
  const [parado, setParado] = useState(0);
  const [busca, setBusca] = useState("");
  const [novo, setNovo] = useState(false);
  const [arrastando, setArrastando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const sb = supabase();
    const [p, f, t] = await Promise.all([
      sb.from("soc_processos").select("*").eq("org_id", org.id).order("numero", { ascending: false }).limit(1000),
      sb.from("soc_fases").select("*").eq("org_id", org.id).order("ordem").limit(10000),
      sb.from("soc_tipos").select("*").eq("org_id", org.id).eq("ativo", true).order("ordem"),
    ]);
    if (p.error) return setErro(traduzirErro(p.error));
    setProcessos(p.data as SocProcesso[]);
    setFases((f.data as SocFase[]) ?? []);
    setTipos((t.data as SocTipo[]) ?? []);
  }, [org.id]);

  useEffect(() => {
    void carregar();
    try {
      const v = localStorage.getItem("mdc-societario:visao");
      if (v === "quadro" || v === "lista") setVisao(v);
    } catch {}
  }, [carregar]);

  const faseAtual = useCallback((p: SocProcesso) => fases.find((f) => f.processo_id === p.id && f.ordem === p.fase_atual), [fases]);
  const nomeTipo = (id: string) => tipos.find((t) => t.id === id)?.nome ?? "";
  const nomeCliente = useCallback(
    (p: SocProcesso) => {
      const c = clientePorId(p.cliente_id);
      return c ? c.nome_fantasia || c.razao_social : (p.futuro_cliente ?? "—");
    },
    [clientePorId],
  );

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return processos.filter((p) => {
      if (situacao !== "todos" && p.status !== situacao) return false;
      if (tipo && p.tipo_id !== tipo) return false;
      if (resp && p.responsavel_id !== resp) return false;
      if (uf && p.uf !== uf) return false;
      const f = faseAtual(p);
      if (parado && (!f || p.status !== "aberto" || diasParado(f.mudou_em) < parado)) return false;
      if (q) {
        const alvo = `${p.numero} ${nomeCliente(p)} ${p.descricao ?? ""} ${p.cnpj ?? ""}`.toLowerCase();
        if (!alvo.includes(q)) return false;
      }
      return true;
    });
  }, [processos, situacao, tipo, resp, uf, parado, busca, faseAtual, nomeCliente]);

  async function soltar(processoId: string, codigoDestino: string) {
    setArrastando(null);
    const p = processos.find((x) => x.id === processoId);
    if (!p || p.status !== "aberto") return;
    const minhas = fases.filter((f) => f.processo_id === p.id);
    const destino = minhas.find((f) => f.codigo === codigoDestino);
    const atual = faseAtual(p);
    if (!destino || !atual || destino.ordem <= atual.ordem) return;
    if (destino.status === "dispensada") return setErro(`A fase "${destino.nome}" está dispensada neste processo.`);
    // conclui a fase atual e dispensa as intermediárias ainda pendentes, até chegar ao destino
    const sb = supabase();
    // intermediárias primeiro, a atual por último: o processo salta direto para o destino
    const passos = minhas
      .filter((x) => x.ordem >= atual.ordem && x.ordem < destino.ordem)
      .sort((a, b) => (a.ordem === atual.ordem ? 1 : b.ordem === atual.ordem ? -1 : a.ordem - b.ordem));
    for (const f of passos) {
      if (f.status === "concluida" || f.status === "dispensada") continue;
      const { error } = await sb.rpc("soc_mudar_fase", {
        p_fase: f.id,
        p_status: f.ordem === atual.ordem ? "concluida" : "dispensada",
      });
      if (error) {
        setErro(traduzirErro(error));
        break;
      }
    }
    void carregar();
  }

  const ufs = [...new Set(processos.map((p) => p.uf).filter(Boolean))] as string[];
  const podeOperar = pode("societario", "operar");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold text-[var(--marca)]">Processos societários</h1>
        <div className="flex rounded-lg border border-[var(--borda)] bg-white p-0.5 text-sm">
          {(["quadro", "lista"] as Visao[]).map((v) => (
            <button
              key={v}
              className={`rounded-md px-3 py-1 ${visao === v ? "bg-[var(--marca)] text-white" : ""}`}
              onClick={() => {
                setVisao(v);
                try {
                  localStorage.setItem("mdc-societario:visao", v);
                } catch {}
              }}
            >
              {v === "quadro" ? "Quadro" : "Lista"}
            </button>
          ))}
        </div>
        {podeOperar && (
          <button className="btn-primario" onClick={() => setNovo(true)}>
            Novo processo
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <input className="entrada w-56" placeholder="Buscar cliente, nº, CNPJ…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select className="entrada" value={situacao} onChange={(e) => setSituacao(e.target.value as typeof situacao)}>
          <option value="aberto">Em andamento</option>
          <option value="concluido">Concluídos</option>
          <option value="todos">Todos</option>
        </select>
        <select className="entrada" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="">Todos os tipos</option>
          {tipos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
            </option>
          ))}
        </select>
        <select className="entrada" value={resp} onChange={(e) => setResp(e.target.value)}>
          <option value="">Todos os responsáveis</option>
          {membros
            .filter((m) => m.ativo)
            .map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.nome}
              </option>
            ))}
        </select>
        {ufs.length > 1 && (
          <select className="entrada" value={uf} onChange={(e) => setUf(e.target.value)}>
            <option value="">Todas as UFs</option>
            {ufs.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        )}
        <select className="entrada" value={parado} onChange={(e) => setParado(Number(e.target.value))}>
          <option value={0}>Qualquer tempo na fase</option>
          <option value={3}>Parado há 3+ dias</option>
          <option value={5}>Parado há 5+ dias</option>
          <option value={10}>Parado há 10+ dias</option>
        </select>
      </div>

      {erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{erro}</p>}

      {visao === "quadro" ? (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {COLUNAS.map((col) => {
            const cartoes = filtrados.filter((p) => p.status === "aberto" && faseAtual(p)?.codigo === col.codigo);
            return (
              <div
                key={col.codigo}
                className={`w-64 shrink-0 rounded-xl bg-[#ece8dc] p-2 ${arrastando ? "ring-1 ring-[var(--destaque)]" : ""}`}
                onDragOver={(e) => podeOperar && e.preventDefault()}
                onDrop={(e) => soltar(e.dataTransfer.getData("text/plain"), col.codigo)}
              >
                <div className="mb-2 flex items-center justify-between px-1 text-xs font-semibold text-neutral-600">
                  <span>{col.nome}</span>
                  <span>{cartoes.length}</span>
                </div>
                <div className="space-y-2">
                  {cartoes.map((p) => {
                    const f = faseAtual(p)!;
                    const d = diasAte(f.prazo_em, org.fuso);
                    const parados = diasParado(f.mudou_em);
                    return (
                      <Link
                        key={p.id}
                        href={`/societario/${p.id}`}
                        draggable={podeOperar}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", p.id);
                          setArrastando(p.id);
                        }}
                        onDragEnd={() => setArrastando(null)}
                        className="block rounded-lg border border-[var(--borda)] bg-white p-2.5 text-sm shadow-sm hover:border-[var(--destaque-escuro)]"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium leading-tight">{nomeCliente(p)}</span>
                          <span className="text-xs text-neutral-400">#{p.numero}</span>
                        </div>
                        <div className="mt-0.5 text-xs text-neutral-600">{nomeTipo(p.tipo_id)}</div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          <span className={`chip ${corStatusFase(f.status)}`}>{nomeStatusFase(f.status)}</span>
                          {d !== null && d < 0 && <span className="chip bg-red-50 text-red-700">atrasada {-d}d</span>}
                          {parados >= 5 && <span className="chip bg-amber-50 text-amber-800">parada {parados}d</span>}
                          {p.exigencias > 0 && <span className="chip bg-neutral-100 text-neutral-600">{p.exigencias} exig.</span>}
                        </div>
                        <div className="mt-1.5 text-xs text-neutral-500">{nomeMembro(f.responsavel_id ?? p.responsavel_id)}</div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="cartao overflow-x-auto">
          <table className="tabela">
            <thead>
              <tr>
                <th>Nº</th>
                <th>Cliente</th>
                <th>Tipo</th>
                <th>Fase atual</th>
                <th>Prazo da fase</th>
                <th>Na fase há</th>
                <th>Responsável</th>
                <th>UF</th>
                <th>Pedido</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p) => {
                const f = faseAtual(p);
                const d = f ? diasAte(f.prazo_em, org.fuso) : null;
                return (
                  <tr
                    key={p.id}
                    className="cursor-pointer hover:bg-[var(--fundo)]"
                    onClick={() => (window.location.href = caminho(`/societario/${p.id}`))}
                  >
                    <td className="text-neutral-500">#{p.numero}</td>
                    <td className="font-medium">{nomeCliente(p)}</td>
                    <td>{nomeTipo(p.tipo_id)}</td>
                    <td>
                      {p.status === "aberto" && f ? (
                        <span className="flex items-center gap-2">
                          {f.nome}
                          <span className={`chip ${corStatusFase(f.status)}`}>{nomeStatusFase(f.status)}</span>
                        </span>
                      ) : (
                        <span className="chip bg-emerald-50 text-emerald-800">{p.status === "concluido" ? "Concluído" : "Cancelado"}</span>
                      )}
                    </td>
                    <td className={d !== null && d < 0 && p.status === "aberto" ? "text-red-700" : ""}>{fmtData(f?.prazo_em ?? null)}</td>
                    <td>{p.status === "aberto" && f ? `${diasParado(f.mudou_em)} d` : "—"}</td>
                    <td>{nomeMembro(f?.responsavel_id ?? p.responsavel_id)}</td>
                    <td>{p.uf ?? "—"}</td>
                    <td>{fmtData(p.pedido_em)}</td>
                  </tr>
                );
              })}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-neutral-500">
                    Nenhum processo com esses filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {visao === "quadro" && podeOperar && (
        <p className="text-xs text-neutral-500">
          Arraste um cartão para uma coluna à frente: a fase atual é concluída e as intermediárias pendentes são dispensadas.
        </p>
      )}

      {novo && (
        <NovoProcesso
          tipos={tipos}
          aoFechar={() => setNovo(false)}
          aoCriar={(id) => (window.location.href = caminho(`/societario/${id}`))}
        />
      )}
    </div>
  );
}

function NovoProcesso({ tipos, aoFechar, aoCriar }: { tipos: SocTipo[]; aoFechar: () => void; aoCriar: (id: string) => void }) {
  const { org, eu, clientes, membros } = useOrg();
  const [tipoId, setTipoId] = useState(tipos[0]?.id ?? "");
  const [cliente, setCliente] = useState("");
  const [futuro, setFuturo] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [uf, setUf] = useState("SP");
  const [descricao, setDescricao] = useState("");
  const [resp, setResp] = useState(eu.user_id);
  const [previsao, setPrevisao] = useState("");
  const [dispensar, setDispensar] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const tipo = tipos.find((t) => t.id === tipoId);
  const abertura = tipo?.codigo === "abertura";

  useEffect(() => {
    // viabilidade só quando muda endereço/CNAE ou na abertura
    setDispensar(tipo && !["abertura", "filial"].includes(tipo.codigo) ? ["viabilidade"] : []);
  }, [tipo]);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    const { data, error } = await supabase().rpc("soc_abrir_processo", {
      p_org: org.id,
      p_tipo: tipoId,
      p_cliente: abertura ? null : cliente || null,
      p_futuro: abertura ? futuro : null,
      p_cnpj: cnpj || null,
      p_uf: uf || null,
      p_descricao: descricao,
      p_responsavel: resp || null,
      p_previsao: previsao || null,
      p_dispensar: dispensar,
    });
    setEnviando(false);
    if (error) return setErro(traduzirErro(error));
    aoCriar(data as string);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={aoFechar}>
      <form
        onSubmit={criar}
        onClick={(e) => e.stopPropagation()}
        className="cartao max-h-[92vh] w-full max-w-xl space-y-3 overflow-y-auto p-5"
      >
        <h2 className="text-lg font-semibold text-[var(--marca)]">Novo processo societário</h2>
        <label className="campo">
          <span>Tipo</span>
          <select value={tipoId} onChange={(e) => setTipoId(e.target.value)}>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </label>
        {abertura ? (
          <div className="grid grid-cols-3 gap-3">
            <label className="campo col-span-2">
              <span>Nome da empresa a abrir</span>
              <input required value={futuro} onChange={(e) => setFuturo(e.target.value)} />
            </label>
            <label className="campo">
              <span>UF</span>
              <input maxLength={2} value={uf} onChange={(e) => setUf(e.target.value.toUpperCase())} />
            </label>
          </div>
        ) : (
          <label className="campo">
            <span>Cliente</span>
            <select required value={cliente} onChange={(e) => setCliente(e.target.value)}>
              <option value="">Escolha…</option>
              {clientes
                .filter((c) => c.ativo)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.codigo_dominio ? `${c.codigo_dominio} · ` : ""}
                    {c.nome_fantasia || c.razao_social}
                  </option>
                ))}
            </select>
          </label>
        )}
        {abertura && (
          <label className="campo">
            <span>CNPJ (quando sair)</span>
            <input value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
          </label>
        )}
        <label className="campo">
          <span>O que muda / observações</span>
          <textarea
            rows={3}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex.: endereço, entrada de sócio, capital, CNAE…"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="campo">
            <span>Responsável</span>
            <select value={resp} onChange={(e) => setResp(e.target.value)}>
              {membros
                .filter((m) => m.ativo)
                .map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.nome}
                  </option>
                ))}
            </select>
          </label>
          <label className="campo">
            <span>Previsão de conclusão</span>
            <input type="date" value={previsao} onChange={(e) => setPrevisao(e.target.value)} />
          </label>
        </div>
        {tipo && (
          <fieldset className="rounded-lg border border-[var(--borda)] p-3">
            <legend className="px-1 text-xs text-neutral-500">Fases deste processo (desmarque as que não se aplicam)</legend>
            <div className="grid grid-cols-2 gap-1 text-sm">
              {tipo.fases
                .filter((f) => f.codigo !== "exigencias")
                .map((f) => (
                  <label key={f.codigo} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!dispensar.includes(f.codigo)}
                      onChange={(e) => setDispensar((d) => (e.target.checked ? d.filter((x) => x !== f.codigo) : [...d, f.codigo]))}
                    />
                    {f.nome}
                  </label>
                ))}
            </div>
            <p className="mt-2 text-xs text-neutral-500">A fase de exigências só abre se houver exigência.</p>
          </fieldset>
        )}
        {erro && <p className="text-sm text-red-700">{erro}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={aoFechar}>
            Cancelar
          </button>
          <button className="btn-primario" disabled={enviando}>
            {enviando ? "Abrindo…" : "Abrir processo"}
          </button>
        </div>
      </form>
    </div>
  );
}
