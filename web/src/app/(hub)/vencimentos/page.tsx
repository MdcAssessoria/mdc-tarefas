"use client";

import { TIPOS_VENC, nomeTipo } from "@/dominios/vencimentos/tipos";
import type { Vencimento } from "@/dominios/vencimentos/tipos";
import { useCallback, useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { diasAte } from "@/lib/datas";
import { fmtData } from "@/lib/formato/datas";
import { nomeCliente } from "@/dominios/clientes/nome";
import { exigir } from "@/lib/exigir";
import { useConsulta } from "@/lib/useConsulta";
import { Aviso } from "@/components/ui/Aviso";
import { Modal } from "@/components/ui/Modal";

export default function PaginaVencimentos() {
  return <Vencimentos />;
}

function Vencimentos() {
  const { org, clientes, clientePorId, nomeMembro, membros, pode } = useOrg();
  const [erro, setErro] = useState<string | null>(null);
  const [janela, setJanela] = useState(90);
  const [tipo, setTipo] = useState("");
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<Vencimento | null | undefined>(undefined);
  const podeOperar = pode("vencimentos", "operar");

  const consulta = useConsulta(
    useCallback(
      async () =>
        exigir(
          await supabase().from("venc_itens").select("*").eq("org_id", org.id).eq("status", "ativo").order("vence_em").limit(3000),
        ) as Vencimento[],
      [org.id],
    ),
  );
  const itens = useMemo(() => consulta.dados ?? [], [consulta.dados]);
  const recarregar = consulta.recarregar;

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens.filter((i) => {
      const d = diasAte(i.vence_em, org.fuso) ?? 0;
      if (janela && d > janela) return false;
      if (tipo && i.tipo !== tipo) return false;
      if (q) {
        const c = clientePorId(i.cliente_id);
        if (!`${c?.razao_social} ${c?.nome_fantasia} ${i.descricao}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [itens, janela, tipo, busca, org.fuso, clientePorId]);

  const contagem = {
    vencidos: itens.filter((i) => (diasAte(i.vence_em, org.fuso) ?? 0) < 0).length,
    d7: itens.filter((i) => {
      const d = diasAte(i.vence_em, org.fuso) ?? 0;
      return d >= 0 && d <= 7;
    }).length,
    d30: itens.filter((i) => {
      const d = diasAte(i.vence_em, org.fuso) ?? 0;
      return d >= 0 && d <= 30;
    }).length,
    d60: itens.filter((i) => {
      const d = diasAte(i.vence_em, org.fuso) ?? 0;
      return d >= 0 && d <= 60;
    }).length,
  };

  async function renovar(i: Vencimento) {
    const nova = prompt(`Nova data de vencimento de ${nomeTipo(i.tipo)} (dd/mm/aaaa):`);
    if (!nova) return;
    const m = nova.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!m) return setErro("Data inválida. Use dd/mm/aaaa.");
    const { error } = await supabase().rpc("venc_renovar", { p_item: i.id, p_nova_data: `${m[3]}-${m[2]}-${m[1]}`, p_obs: null });
    if (error) return setErro(traduzirErro(error));
    setErro(null);
    recarregar();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold text-[var(--marca)]">Vencimentos</h1>
        {podeOperar && (
          <button className="btn-primario" onClick={() => setEditando(null)}>
            Novo vencimento
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { r: "Vencidos", v: contagem.vencidos, cor: "text-[var(--perigo)]" },
          { r: "Em até 7 dias", v: contagem.d7, cor: "text-[var(--perigo)]" },
          { r: "Em até 30 dias", v: contagem.d30, cor: "text-[var(--alerta)]" },
          { r: "Em até 60 dias", v: contagem.d60, cor: "text-[var(--marca)]" },
        ].map((k) => (
          <div key={k.r} className="cartao p-3">
            <div className={`text-2xl font-semibold tabular-nums ${k.v ? k.cor : "text-[var(--marca)]"}`}>{k.v}</div>
            <div className="text-xs text-neutral-600">{k.r}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <input className="entrada w-60" placeholder="Buscar cliente…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select className="entrada" value={janela} onChange={(e) => setJanela(Number(e.target.value))}>
          <option value={30}>Próximos 30 dias</option>
          <option value={60}>Próximos 60 dias</option>
          <option value={90}>Próximos 90 dias</option>
          <option value={0}>Todos</option>
        </select>
        <select className="entrada" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="">Todos os tipos</option>
          {TIPOS_VENC.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
            </option>
          ))}
        </select>
      </div>
      {(erro ?? consulta.erro) && <Aviso>{erro ?? consulta.erro}</Aviso>}
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead>
            <tr>
              <th>Vence em</th>
              <th>Tipo</th>
              <th>Cliente</th>
              <th>Descrição</th>
              <th>Responsável</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((i) => {
              const d = diasAte(i.vence_em, org.fuso) ?? 0;
              const c = clientePorId(i.cliente_id);
              return (
                <tr key={i.id}>
                  <td className="whitespace-nowrap">
                    {fmtData(i.vence_em)}{" "}
                    <span
                      className={`chip ${d < 0 ? "bg-red-50 text-red-700" : d <= 7 ? "bg-red-50 text-red-700" : d <= 30 ? "bg-amber-50 text-amber-800" : "bg-neutral-100 text-neutral-600"}`}
                    >
                      {d < 0 ? `vencido há ${-d}d` : d === 0 ? "hoje" : `${d} dias`}
                    </span>
                  </td>
                  <td>{nomeTipo(i.tipo)}</td>
                  <td>{nomeCliente(c, "MDC")}</td>
                  <td className="text-neutral-600">
                    {i.descricao}
                    {i.tarefa_id && <span className="chip ml-2 bg-sky-50 text-sky-800">tarefa de renovação</span>}
                  </td>
                  <td>{nomeMembro(i.responsavel_id)}</td>
                  <td className="whitespace-nowrap text-right">
                    {podeOperar && (
                      <>
                        <button className="btn-link" onClick={() => renovar(i)}>
                          renovado
                        </button>
                        <button className="btn-link ml-3" onClick={() => setEditando(i)}>
                          editar
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {lista.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-neutral-500">
                  {consulta.dados ? "Nada vencendo nesse período." : "Carregando…"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-neutral-500">
        Avisos automáticos no sino aos 60, 30 e 7 dias e no dia do vencimento. Aos 30 dias nasce a tarefa “Renovar…” no MDC Tarefas. Ao
        marcar como renovado, informe a nova data: o item seguinte é criado e a tarefa é concluída.
      </p>
      {editando !== undefined && (
        <Editor
          item={editando}
          clientes={clientes.filter((c) => c.ativo)}
          membros={membros.filter((m) => m.ativo)}
          podeExcluir={pode("vencimentos", "gerir")}
          aoFechar={() => setEditando(undefined)}
          aoSalvar={() => {
            setEditando(undefined);
            recarregar();
          }}
        />
      )}
    </div>
  );
}

function Editor({
  item,
  clientes,
  membros,
  podeExcluir,
  aoFechar,
  aoSalvar,
}: {
  item: Vencimento | null;
  clientes: { id: string; razao_social: string; nome_fantasia: string | null; codigo_dominio?: string | null }[];
  membros: { user_id: string; nome: string }[];
  podeExcluir: boolean;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const { org, eu } = useOrg();
  const [f, setF] = useState({
    cliente_id: item?.cliente_id ?? "",
    tipo: item?.tipo ?? "certificado_a1",
    descricao: item?.descricao ?? "",
    vence_em: item?.vence_em ?? "",
    responsavel_id: item?.responsavel_id ?? eu.user_id,
    visivel_cliente: item?.visivel_cliente ?? true,
    observacao: item?.observacao ?? "",
  });
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const dados = {
      ...f,
      cliente_id: f.cliente_id || null,
      responsavel_id: f.responsavel_id || null,
      descricao: f.descricao || null,
      observacao: f.observacao || null,
    };
    const sb = supabase();
    const r = item
      ? await sb
          .from("venc_itens")
          .update({ ...dados, avisos: item.vence_em !== f.vence_em ? [] : undefined })
          .eq("id", item.id)
      : await sb.from("venc_itens").insert({ ...dados, org_id: org.id, criado_por: eu.user_id });
    if (r.error) return setErro(traduzirErro(r.error));
    aoSalvar();
  }

  return (
    <Modal titulo={item ? "Editar vencimento" : "Novo vencimento"} aoFechar={aoFechar}>
      <form onSubmit={salvar} className="space-y-3">
        <label className="campo">
          <span>Tipo</span>
          <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
            {TIPOS_VENC.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Cliente (vazio = da própria MDC)</span>
          <select value={f.cliente_id} onChange={(e) => setF({ ...f, cliente_id: e.target.value })}>
            <option value="">MDC</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo_dominio ? `${c.codigo_dominio} · ` : ""}
                {nomeCliente(c)}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="campo">
            <span>Vence em</span>
            <input type="date" required value={f.vence_em} onChange={(e) => setF({ ...f, vence_em: e.target.value })} />
          </label>
          <label className="campo">
            <span>Responsável</span>
            <select value={f.responsavel_id} onChange={(e) => setF({ ...f, responsavel_id: e.target.value })}>
              {membros.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.nome}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="campo">
          <span>Descrição</span>
          <input
            value={f.descricao}
            onChange={(e) => setF({ ...f, descricao: e.target.value })}
            placeholder="Ex.: e-CNPJ A1 da matriz, Alvará nº…"
          />
        </label>
        <label className="campo">
          <span>Observação</span>
          <textarea rows={2} value={f.observacao} onChange={(e) => setF({ ...f, observacao: e.target.value })} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.visivel_cliente} onChange={(e) => setF({ ...f, visivel_cliente: e.target.checked })} /> Mostrar
          no Portal do Cliente
        </label>
        {erro && <p className="text-sm text-red-700">{erro}</p>}
        <div className="flex justify-between gap-2">
          {item && podeExcluir ? (
            <button
              type="button"
              className="btn text-[var(--perigo)]"
              onClick={async () => {
                if (!confirm("Excluir este vencimento?")) return;
                const { error } = await supabase().from("venc_itens").delete().eq("id", item.id);
                if (error) return setErro(traduzirErro(error));
                aoSalvar();
              }}
            >
              Excluir
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={aoFechar}>
              Cancelar
            </button>
            <button className="btn-primario">Salvar</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
