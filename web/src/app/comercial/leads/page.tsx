"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useOrg } from "@/lib/org";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { ETAPAS, ORIGENS, brl } from "@/lib/crm";
import type { Oportunidade } from "@/lib/crm";
import { exportarExcel } from "@/lib/excel";

export default function PaginaLeads() {
  return (
    <AppShell modulo="comercial">
      <Leads />
    </AppShell>
  );
}

const REGIME: Record<string, string> = { simples: "Simples", presumido: "Presumido", real: "Real", mei: "MEI" };
const nomeRegime = (r: unknown) => (typeof r === "string" ? REGIME[r.toLowerCase()] ?? r : "—");
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !isNaN(Number(v)) ? Number(v) : null);
const dataBr = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

type Situacao = "ativos" | "arquivados" | "todos";

function Leads() {
  const { org, pode } = useOrg();
  const router = useRouter();
  const [lista, setLista] = useState<Oportunidade[] | null>(null);
  const [busca, setBusca] = useState("");
  const [origem, setOrigem] = useState("simulador");
  const [etapa, setEtapa] = useState("");
  const [situacao, setSituacao] = useState<Situacao>("ativos");
  const [desde, setDesde] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const podeOperar = pode("comercial", "operar");
  const podeGerir = pode("comercial", "gerir");

  const carregar = useCallback(async () => {
    const { data, error } = await supabase().from("crm_oportunidades").select("*").eq("org_id", org.id).order("criado_em", { ascending: false }).limit(2000);
    if (error) return setErro(traduzirErro(error));
    setLista((data as Oportunidade[]) ?? []);
  }, [org.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const filtrada = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (lista ?? []).filter((o) => {
      if (situacao === "ativos" && o.arquivado_em) return false;
      if (situacao === "arquivados" && !o.arquivado_em) return false;
      if (origem && o.origem !== origem) return false;
      if (etapa && o.etapa !== etapa) return false;
      if (desde && o.criado_em.slice(0, 10) < desde) return false;
      if (q) {
        const d = o.dados_origem ?? {};
        const alvo = `${o.empresa} ${o.razao_social ?? ""} ${o.cnpj ?? ""} ${o.contato_nome ?? ""} ${o.email ?? ""} ${o.whatsapp ?? ""} ${o.cidade ?? ""} ${d.cnae_descricao ?? ""}`;
        if (!alvo.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [lista, busca, origem, etapa, situacao, desde]);

  const resumo = useMemo(() => {
    const l = filtrada;
    const econ = l.reduce((a, o) => a + (num(o.dados_origem?.economia_estimada) ?? 0), 0);
    return {
      total: l.length,
      novos: l.filter((o) => o.etapa === "novo").length,
      andamento: l.filter((o) => !["novo", "ganho", "perdido"].includes(o.etapa)).length,
      ganhos: l.filter((o) => o.etapa === "ganho").length,
      economia: econ,
    };
  }, [filtrada]);

  async function arquivar(ids: string[], arquivarSim: boolean) {
    if (!ids.length) return;
    const motivo = arquivarSim ? prompt("Motivo (opcional): sem retorno, sem interesse, duplicado…", "Sem retorno") : null;
    if (arquivarSim && motivo === null) return;
    const { data, error } = await supabase().rpc("crm_arquivar", { p_ids: ids, p_motivo: motivo, p_arquivar: arquivarSim });
    if (error) return setErro(traduzirErro(error));
    setSel(new Set());
    setAviso(arquivarSim ? `${data} lead(s) arquivado(s).` : `${data} lead(s) de volta ao funil.`);
    carregar();
  }

  async function excluir(ids: string[]) {
    const alvo = (lista ?? []).filter((o) => ids.includes(o.id) && !o.cliente_id);
    if (!alvo.length) return setErro("Leads que viraram cliente não podem ser excluídos; arquive-os.");
    if (!confirm(`Excluir ${alvo.length} lead(s) de vez? As atividades registradas também são apagadas.`)) return;
    const { error } = await supabase().from("crm_oportunidades").delete().in("id", alvo.map((o) => o.id));
    if (error) return setErro(traduzirErro(error));
    setSel(new Set());
    setAviso(`${alvo.length} lead(s) excluído(s).`);
    carregar();
  }

  async function exportar() {
    await exportarExcel(
      `Leads-MDC-${new Date().toISOString().slice(0, 10)}.xlsx`,
      "Leads do CRM",
      `${filtrada.length} lead(s) · gerado em ${new Date().toLocaleString("pt-BR")}`,
      [
        {
          nome: "Leads",
          colunas: [
            { titulo: "Recebido em", chave: "data", formato: "data", largura: 13 },
            { titulo: "Empresa", chave: "empresa", largura: 34 },
            { titulo: "CNPJ", chave: "cnpj", largura: 20 },
            { titulo: "Contato", chave: "contato", largura: 22 },
            { titulo: "WhatsApp", chave: "whatsapp", largura: 16 },
            { titulo: "E-mail", chave: "email", largura: 28 },
            { titulo: "Atividade", chave: "atividade", largura: 34 },
            { titulo: "Regime atual", chave: "regime", largura: 13 },
            { titulo: "Melhor regime", chave: "melhor", largura: 14 },
            { titulo: "Economia estimada", chave: "economia", formato: "moeda", largura: 16 },
            { titulo: "Etapa", chave: "etapa", largura: 13 },
            { titulo: "Situação", chave: "situacao", largura: 22 },
          ],
          linhas: filtrada.map((o) => ({
            data: o.criado_em,
            empresa: o.empresa,
            cnpj: o.cnpj,
            contato: o.contato_nome,
            whatsapp: o.whatsapp,
            email: o.email,
            atividade: (o.dados_origem?.cnae_descricao as string) ?? o.atividade,
            regime: nomeRegime(o.regime_atual),
            melhor: nomeRegime(o.dados_origem?.melhor_regime),
            economia: num(o.dados_origem?.economia_estimada),
            etapa: ETAPAS.find((e) => e.id === o.etapa)?.nome,
            situacao: o.arquivado_em ? `Arquivado: ${o.motivo_arquivo ?? ""}` : "No funil",
          })),
        },
      ],
    );
  }

  const todosSel = filtrada.length > 0 && filtrada.every((o) => sel.has(o.id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-xl font-semibold text-[var(--marca)]">Leads</h1>
          <p className="text-sm text-neutral-600">Quem chegou pelo Simulador de Regime e pelos demais canais. Cada lead já entra no funil como “Novo lead”.</p>
        </div>
        <button className="btn" onClick={exportar} disabled={!filtrada.length}>
          Exportar Excel
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ["Leads na lista", String(resumo.total)],
          ["Ainda não contatados", String(resumo.novos)],
          ["Em andamento", String(resumo.andamento)],
          ["Viraram cliente", String(resumo.ganhos)],
          ["Economia estimada somada", brl(resumo.economia)],
        ].map(([r, v]) => (
          <div key={r} className="cartao p-3">
            <div className="text-xs text-neutral-500">{r}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-[var(--marca)]">{v}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input className="entrada w-64" placeholder="Empresa, CNPJ, contato, atividade…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select className="entrada" value={origem} onChange={(e) => setOrigem(e.target.value)} aria-label="Origem">
          <option value="">Todas as origens</option>
          {ORIGENS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome}
            </option>
          ))}
        </select>
        <select className="entrada" value={etapa} onChange={(e) => setEtapa(e.target.value)} aria-label="Etapa">
          <option value="">Todas as etapas</option>
          {ETAPAS.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          Desde
          <input type="date" className="entrada" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <div className="ml-auto flex overflow-hidden rounded-lg border border-[var(--borda)] text-sm">
          {(["ativos", "arquivados", "todos"] as Situacao[]).map((s) => (
            <button key={s} onClick={() => setSituacao(s)} className={`px-3 py-1.5 ${situacao === s ? "bg-[var(--marca)] text-white" : "bg-white"}`}>
              {s === "ativos" ? "No funil" : s === "arquivados" ? "Arquivados" : "Todos"}
            </button>
          ))}
        </div>
      </div>

      {erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{erro}</p>}
      {aviso && <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">{aviso}</p>}

      {sel.size > 0 && (podeOperar || podeGerir) && (
        <div className="cartao sticky top-16 z-20 flex flex-wrap items-center gap-3 border-[var(--destaque-escuro)] p-3 text-sm">
          <b className="text-[var(--marca)]">{sel.size} selecionado(s)</b>
          {podeOperar && situacao !== "arquivados" && (
            <button className="btn" onClick={() => arquivar([...sel], true)}>
              Arquivar (dar baixa)
            </button>
          )}
          {podeOperar && situacao !== "ativos" && (
            <button className="btn" onClick={() => arquivar([...sel], false)}>
              Restaurar ao funil
            </button>
          )}
          {podeGerir && (
            <button className="btn !border-red-200 !text-[var(--perigo)]" onClick={() => excluir([...sel])}>
              Excluir
            </button>
          )}
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
                  checked={todosSel}
                  onChange={(e) => setSel(e.target.checked ? new Set(filtrada.map((o) => o.id)) : new Set())}
                />
              </th>
              <th>Recebido</th>
              <th>Empresa</th>
              <th>Contato</th>
              <th>Regime → melhor</th>
              <th className="text-right">Economia estimada</th>
              <th>Etapa</th>
            </tr>
          </thead>
          <tbody>
            {lista === null && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-sm text-neutral-500">
                  Carregando…
                </td>
              </tr>
            )}
            {lista !== null && filtrada.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-sm text-neutral-500">
                  Nenhum lead com esses filtros.
                </td>
              </tr>
            )}
            {filtrada.map((o) => {
              const d = o.dados_origem ?? {};
              const econ = num(d.economia_estimada);
              const zap = (o.whatsapp ?? "").replace(/\D/g, "");
              return (
                <tr key={o.id} className={`cursor-pointer hover:bg-[var(--fundo)] ${o.arquivado_em ? "opacity-60" : ""}`} onClick={() => router.push(`/comercial/${o.id}`)}>
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--marca)]"
                      aria-label={`Selecionar ${o.empresa}`}
                      checked={sel.has(o.id)}
                      onChange={(e) =>
                        setSel((x) => {
                          const n = new Set(x);
                          if (e.target.checked) n.add(o.id);
                          else n.delete(o.id);
                          return n;
                        })
                      }
                    />
                  </td>
                  <td className="whitespace-nowrap text-sm text-neutral-600">{dataBr(o.criado_em)}</td>
                  <td>
                    <div className="font-medium">{o.empresa}</div>
                    <div className="text-xs text-neutral-500">
                      {[o.cnpj, (d.cnae_descricao as string) ?? o.atividade].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td className="text-sm">
                    <div>{o.contato_nome ?? "—"}</div>
                    <div className="flex gap-2 text-xs" onClick={(e) => e.stopPropagation()}>
                      {zap && (
                        <a className="text-[var(--destaque-escuro)] hover:underline" href={`https://wa.me/${zap.length <= 11 ? "55" + zap : zap}`} target="_blank" rel="noopener">
                          WhatsApp
                        </a>
                      )}
                      {o.email && (
                        <a className="text-[var(--destaque-escuro)] hover:underline" href={`mailto:${o.email}`}>
                          E-mail
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap text-sm">
                    {nomeRegime(o.regime_atual)} → <b>{nomeRegime(d.melhor_regime)}</b>
                  </td>
                  <td className="text-right tabular-nums">{econ ? brl(econ) : "—"}</td>
                  <td>
                    <span className={`chip ${o.etapa === "ganho" ? "bg-emerald-50 text-emerald-800" : o.etapa === "perdido" ? "bg-red-50 text-red-800" : "bg-[var(--fundo)] text-neutral-700"}`}>
                      {ETAPAS.find((e) => e.id === o.etapa)?.nome}
                    </span>
                    {o.arquivado_em && <div className="mt-0.5 text-[11px] text-neutral-500">arquivado{o.motivo_arquivo ? `: ${o.motivo_arquivo}` : ""}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
