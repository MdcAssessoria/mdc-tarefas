// Janelas da tela de Vencimentos: cadastrar/editar (com "Encerrar", que pede motivo e chama venc_encerrar; nada se
// apaga) e "Marcar como renovado" (nova data, chama venc_renovar, que cria o próximo item e conclui a tarefa).
"use client";

import { useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { fmtData } from "@/lib/formato/datas";
import { Modal } from "@/components/ui/Modal";
import { JanelaMotivo } from "@/components/ui/JanelaMotivo";
import { Icone } from "@/components/ui/Icone";
import { nomeTipo, TIPOS_VENC } from "../tipos";
import type { Vencimento } from "../tipos";

export function EditorVencimento({
  item,
  clientes,
  membros,
  podeEncerrar,
  aoFechar,
  aoSalvar,
}: {
  item: Vencimento | null;
  clientes: { id: string; razao_social: string; nome_fantasia: string | null; codigo_dominio?: string | null }[];
  membros: { user_id: string; nome: string }[];
  podeEncerrar: boolean;
  aoFechar: () => void;
  aoSalvar: (mensagem: string) => void;
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
  const [salvando, setSalvando] = useState(false);
  const [encerrando, setEncerrando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    const dados = {
      ...f,
      cliente_id: f.cliente_id || null,
      responsavel_id: f.responsavel_id || null,
      descricao: f.descricao.trim() || null,
      observacao: f.observacao.trim() || null,
    };
    const sb = supabase();
    const r = item
      ? await sb
          .from("venc_itens")
          // data nova: zera os avisos já enviados para os avisos de 60/30/7 dias valerem de novo
          .update({ ...dados, avisos: item.vence_em !== f.vence_em ? [] : undefined })
          .eq("id", item.id)
      : await sb.from("venc_itens").insert({ ...dados, org_id: org.id, criado_por: eu.user_id });
    setSalvando(false);
    if (r.error) return setErro(traduzirErro(r.error));
    aoSalvar(item ? "Vencimento atualizado." : "Vencimento cadastrado.");
  }

  return (
    <Modal
      titulo={item ? "Editar vencimento" : "Novo vencimento"}
      descricao="O HUB avisa no sino aos 60, 30 e 7 dias e no dia do vencimento."
      aoFechar={aoFechar}
    >
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
        <div className="grid gap-3 sm:grid-cols-2">
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
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--marca)]"
            checked={f.visivel_cliente}
            onChange={(e) => setF({ ...f, visivel_cliente: e.target.checked })}
          />
          Mostrar no Portal do Cliente
        </label>
        {erro && (
          <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-800">
            {erro}
          </p>
        )}
        <div className="flex flex-wrap justify-between gap-2 pt-1">
          {item && podeEncerrar ? (
            <button type="button" className="btn text-[var(--perigo)]" onClick={() => setEncerrando(true)}>
              <Icone nome="cancelar" className="h-4 w-4" />
              Encerrar
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={aoFechar}>
              <Icone nome="voltar" className="h-4 w-4" />
              Voltar
            </button>
            <button className="btn-primario" disabled={salvando}>
              <Icone nome="check" className="h-4 w-4" />
              {salvando ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      </form>
      {encerrando && item && (
        <JanelaMotivo
          titulo="Encerrar vencimento"
          descricao="O vencimento sai da lista e para de avisar. Ele fica guardado, com o motivo, no histórico."
          botao="Encerrar"
          aoConfirmar={async (motivo) => {
            const { error } = await supabase().rpc("venc_encerrar", { p_item: item.id, p_motivo: motivo });
            if (error) throw error;
            aoSalvar("Vencimento encerrado.");
          }}
          aoFechar={() => setEncerrando(false)}
        />
      )}
    </Modal>
  );
}

/** "Marcar como renovado": pede a nova data (e uma observação opcional) no lugar do antigo window.prompt. */
export function JanelaRenovar({
  item,
  nomeDoCliente,
  aoFechar,
  aoSalvar,
}: {
  item: Vencimento;
  nomeDoCliente: string;
  aoFechar: () => void;
  aoSalvar: (mensagem: string) => void;
}) {
  const [data, setData] = useState("");
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return setErro("Informe a nova data de vencimento.");
    if (data <= item.vence_em) return setErro(`A nova data precisa ser depois do vencimento atual (${fmtData(item.vence_em)}).`);
    setSalvando(true);
    setErro(null);
    const { error } = await supabase().rpc("venc_renovar", { p_item: item.id, p_nova_data: data, p_obs: obs.trim() || undefined });
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    aoSalvar(`Renovado. O próximo vencimento ficou para ${fmtData(data)}.`);
  }

  return (
    <Modal
      titulo="Marcar como renovado"
      descricao={`${nomeTipo(item.tipo)} · ${nomeDoCliente} · vencia em ${fmtData(item.vence_em)}. O HUB cria o próximo vencimento com a nova data e conclui a tarefa de renovação.`}
      aoFechar={aoFechar}
      largura="sm"
    >
      <form onSubmit={confirmar} className="space-y-3">
        <label className="campo">
          <span>Nova data de vencimento</span>
          <input type="date" required min={item.vence_em} value={data} onChange={(e) => setData(e.target.value)} />
        </label>
        <label className="campo">
          <span>Observação (opcional)</span>
          <textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: renovado com a Certisign" />
        </label>
        {erro && (
          <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-800">
            {erro}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn" onClick={aoFechar}>
            <Icone nome="voltar" className="h-4 w-4" />
            Voltar
          </button>
          <button className="btn-primario" disabled={salvando}>
            <Icone nome="check" className="h-4 w-4" />
            {salvando ? "Aguarde…" : "Confirmar renovação"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
