// Aba "Obrigações recorrentes" das Configurações: modelos de tarefa por regime, segmento e grupo, e a geração
// das tarefas de uma competência.
"use client";

import { gruposDosClientes } from "@/dominios/clientes/grupos";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { supabase } from "@/lib/supabase";
import { mesAnteriorISO } from "@/lib/datas";
import { PRIORIDADES } from "@/dominios/tarefas/tipos";
import { REGIMES, SEGMENTOS, nomeSegmento } from "@/dominios/clientes/tipos";
import { Etiquetas } from "@/components/ui/Etiquetas";
import type { Modelo, Prioridade } from "@/dominios/tarefas/tipos";
import { traduzirErro } from "@/lib/erros";
import { fmtCompetencia } from "@/lib/formato/datas";
import { useMensagem } from "./useMensagem";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const MODELO_VAZIO: Omit<Modelo, "id" | "org_id"> = {
  titulo: "",
  descricao: null,
  setor_id: null,
  prioridade: "media",
  por_cliente: true,
  regimes: null,
  segmentos: null,
  grupos: null,
  meses: null,
  dia_vencimento: 20,
  meses_apos_competencia: 1,
  ajuste: "antecipa",
  ativo: true,
};

export function AbaObrigacoes() {
  const { org, setores, setorPorId, clientes } = useOrg();
  const todosGrupos = useMemo(() => gruposDosClientes(clientes), [clientes]);
  const [alcance, setAlcance] = useState<number | null>(null);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [editando, setEditando] = useState<(Partial<Modelo> & typeof MODELO_VAZIO) | null>(null);
  const [comp, setComp] = useState(() => mesAnteriorISO(org.fuso));
  const { mostrar, el } = useMensagem();

  const carregar = useCallback(async () => {
    const { data, error } = await supabase().from("modelos_recorrentes").select("*").eq("org_id", org.id).order("titulo");
    if (error) return mostrar(traduzirErro(error), true);
    setModelos((data as Modelo[]) ?? []);
  }, [org.id, mostrar]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!editando) return;
    const { id, ...dados } = editando;
    const sb = supabase();
    const { error } = id
      ? await sb.from("modelos_recorrentes").update(dados).eq("id", id)
      : await sb.from("modelos_recorrentes").insert({ ...dados, org_id: org.id });
    if (error) return mostrar(traduzirErro(error), true);
    setEditando(null);
    void carregar();
  }

  // prévia: quantos clientes ativos a obrigação vai pegar com os filtros
  useEffect(() => {
    if (!editando?.por_cliente) return setAlcance(null);
    let vivo = true;
    supabase()
      .rpc("prever_rotina", {
        p_org: org.id,
        p_regimes: editando.regimes ?? null,
        p_segmentos: editando.segmentos ?? null,
        p_grupos: editando.grupos ?? null,
      })
      .then(({ data }) => vivo && setAlcance((data as number) ?? null));
    return () => {
      vivo = false;
    };
  }, [org.id, editando?.por_cliente, editando?.regimes, editando?.segmentos, editando?.grupos]);

  async function gerar() {
    const { data, error } = await supabase().rpc("gerar_competencia", { p_org: org.id, p_competencia: comp + "-01" });
    if (error) return mostrar(traduzirErro(error), true);
    mostrar(data ? `${data} tarefas criadas para ${fmtCompetencia(comp)}.` : "Nenhuma tarefa nova: a competência já estava gerada.");
  }

  const descreverMeses = (m: number[] | null) =>
    !m
      ? "Mensal"
      : m.length === 4 && [3, 6, 9, 12].every((x) => m.includes(x))
        ? "Trimestral"
        : m.length === 1
          ? `Anual (comp. ${MESES[m[0] - 1].toLowerCase()})`
          : m.map((x) => MESES[x - 1]).join(", ");

  return (
    <div className="space-y-4">
      <div className="cartao flex flex-wrap items-end gap-3 p-4">
        <div className="mr-auto max-w-xl text-sm text-[var(--texto-suave)]">
          As tarefas são criadas automaticamente todo dia às 06:05 para a competência anterior, uma por cliente ativo que se encaixe no
          regime, segmento e grupo indicados. Para antecipar ou refazer uma competência, gere manualmente:
        </div>
        <label className="campo">
          <span>Competência</span>
          <input type="month" value={comp} onChange={(e) => setComp(e.target.value)} className="entrada" />
        </label>
        <button className="btn-primario" onClick={gerar}>
          Gerar tarefas
        </button>
        <button className="btn" onClick={() => setEditando({ ...MODELO_VAZIO })}>
          + Nova obrigação
        </button>
      </div>
      {el}

      {editando && (
        <form onSubmit={salvar} className="cartao grid gap-4 p-5 md:grid-cols-4">
          <label className="campo md:col-span-2">
            <span>Título</span>
            <input required value={editando.titulo} onChange={(e) => setEditando({ ...editando, titulo: e.target.value })} />
          </label>
          <label className="campo">
            <span>Setor</span>
            <select value={editando.setor_id ?? ""} onChange={(e) => setEditando({ ...editando, setor_id: e.target.value || null })}>
              <option value="">—</option>
              {setores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Prioridade</span>
            <select value={editando.prioridade} onChange={(e) => setEditando({ ...editando, prioridade: e.target.value as Prioridade })}>
              {PRIORIDADES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Dia do prazo</span>
            <input
              type="number"
              min={1}
              max={31}
              required
              value={editando.dia_vencimento}
              onChange={(e) => setEditando({ ...editando, dia_vencimento: Number(e.target.value) })}
            />
          </label>
          <label className="campo">
            <span>Meses após a competência</span>
            <input
              type="number"
              min={0}
              max={12}
              required
              value={editando.meses_apos_competencia}
              onChange={(e) => setEditando({ ...editando, meses_apos_competencia: Number(e.target.value) })}
            />
          </label>
          <label className="campo">
            <span>Fim de semana/feriado</span>
            <select value={editando.ajuste} onChange={(e) => setEditando({ ...editando, ajuste: e.target.value as Modelo["ajuste"] })}>
              <option value="antecipa">Antecipa</option>
              <option value="posterga">Posterga</option>
              <option value="nenhum">Mantém</option>
            </select>
          </label>
          <label className="campo">
            <span>Gera</span>
            <select
              value={editando.por_cliente ? "1" : "0"}
              onChange={(e) => setEditando({ ...editando, por_cliente: e.target.value === "1" })}
            >
              <option value="1">Uma por cliente</option>
              <option value="0">Uma só (interna)</option>
            </select>
          </label>
          <label className="campo">
            <span>Portal do Cliente</span>
            <select
              value={editando.visivel_cliente === false ? "0" : "1"}
              onChange={(e) => setEditando({ ...editando, visivel_cliente: e.target.value === "1" })}
            >
              <option value="1">Visível ao cliente</option>
              <option value="0">Só interna</option>
            </select>
          </label>
          <fieldset className="campo md:col-span-2">
            <span>Regimes (nenhum marcado = todos)</span>
            <div className="flex flex-wrap gap-3 pt-1 text-sm text-[var(--texto)]">
              {REGIMES.map((r) => (
                <label key={r.id} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    className="accent-[var(--marca)]"
                    checked={editando.regimes?.includes(r.id) ?? false}
                    onChange={(e) => {
                      const atual = new Set(editando.regimes ?? []);
                      if (e.target.checked) atual.add(r.id);
                      else atual.delete(r.id);
                      setEditando({ ...editando, regimes: atual.size ? [...atual] : null });
                    }}
                  />
                  {r.nome}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="campo md:col-span-2">
            <span>Segmentos (nenhum marcado = todos)</span>
            <div className="flex flex-wrap gap-3 pt-1 text-sm text-[var(--texto)]">
              {SEGMENTOS.map((r) => (
                <label key={r.id} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    className="accent-[var(--marca)]"
                    checked={editando.segmentos?.includes(r.id) ?? false}
                    onChange={(e) => {
                      const atual = new Set(editando.segmentos ?? []);
                      if (e.target.checked) atual.add(r.id);
                      else atual.delete(r.id);
                      setEditando({ ...editando, segmentos: atual.size ? [...atual] : null });
                    }}
                  />
                  {r.nome}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="campo md:col-span-2">
            <span>Grupos de clientes (vazio = todos; vale para quem tiver qualquer um)</span>
            <Etiquetas
              valor={editando.grupos ?? []}
              aoMudar={(g) => setEditando({ ...editando, grupos: g.length ? g : null })}
              sugestoes={todosGrupos}
              placeholder="Ex.: Com empregados, Grupo Clara… (Enter)"
            />
          </div>
          {editando.por_cliente && (
            <p className="rounded-lg bg-[var(--fundo)] px-3 py-2 text-sm md:col-span-4">
              Alcance: <b className="text-[var(--marca)]">{alcance ?? "…"}</b> cliente(s) ativo(s) recebem esta tarefa a cada competência
              com os filtros acima.
            </p>
          )}
          <fieldset className="campo md:col-span-2">
            <span>Meses de competência (nenhum marcado = todo mês)</span>
            <div className="flex flex-wrap gap-2 pt-1 text-sm text-[var(--texto)]">
              {MESES.map((m, i) => (
                <label key={m} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    className="accent-[var(--marca)]"
                    checked={editando.meses?.includes(i + 1) ?? false}
                    onChange={(e) => {
                      const atual = new Set(editando.meses ?? []);
                      if (e.target.checked) atual.add(i + 1);
                      else atual.delete(i + 1);
                      setEditando({ ...editando, meses: atual.size ? [...atual].sort((a, b) => a - b) : null });
                    }}
                  />
                  {m}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="campo md:col-span-4">
            <span>Descrição / checklist</span>
            <textarea
              rows={2}
              value={editando.descricao ?? ""}
              onChange={(e) => setEditando({ ...editando, descricao: e.target.value || null })}
            />
          </label>
          <div className="flex gap-2 md:col-span-4">
            <button className="btn-primario">Salvar</button>
            <button type="button" className="btn" onClick={() => setEditando(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead>
            <tr>
              <th>Obrigação</th>
              <th>Setor</th>
              <th>Periodicidade</th>
              <th>Prazo</th>
              <th>Alcance</th>
              <th>Ativa</th>
            </tr>
          </thead>
          <tbody>
            {modelos.map((m) => (
              <tr
                key={m.id}
                className={`cursor-pointer hover:bg-[var(--fundo)] ${m.ativo ? "" : "opacity-50"}`}
                onClick={() => setEditando(m)}
              >
                <td className="font-medium">{m.titulo}</td>
                <td>{setorPorId(m.setor_id)?.nome ?? "—"}</td>
                <td>{descreverMeses(m.meses)}</td>
                <td className="whitespace-nowrap">
                  Dia {m.dia_vencimento}
                  {m.meses_apos_competencia === 0
                    ? " do mês"
                    : m.meses_apos_competencia === 1
                      ? " do mês seguinte"
                      : ` (+${m.meses_apos_competencia} meses)`}
                </td>
                <td className="text-[var(--texto-suave)]">
                  {!m.regimes && !m.segmentos?.length && !m.grupos?.length
                    ? "Todos os clientes"
                    : [
                        m.regimes && m.regimes.map((r) => REGIMES.find((x) => x.id === r)?.nome ?? r).join(", "),
                        m.segmentos?.length && m.segmentos.map((x) => nomeSegmento(x)).join(", "),
                        m.grupos?.length && `grupos: ${m.grupos.join(", ")}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-[var(--marca)]"
                    checked={m.ativo}
                    onChange={async (e) => {
                      const { error } = await supabase().from("modelos_recorrentes").update({ ativo: e.target.checked }).eq("id", m.id);
                      if (error) return mostrar(traduzirErro(error), true);
                      void carregar();
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {modelos.length === 0 && <p className="p-6 text-center text-sm text-[var(--texto-suave)]">Nenhuma obrigação cadastrada.</p>}
      </div>
    </div>
  );
}
