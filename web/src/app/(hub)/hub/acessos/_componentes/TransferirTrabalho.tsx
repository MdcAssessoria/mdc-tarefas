// Janela para transferir o trabalho de uma pessoa (tarefas, carteira, processos, atendimentos...) para outra,
// opcionalmente inativando quem sai.
"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { supabase } from "@/lib/supabase";
import type { Membro } from "@/dominios/organizacao/tipos";

const ROTULO_PENDENCIA: Record<string, string> = {
  tarefas: "tarefas em aberto",
  carteira: "clientes na carteira (responsável por setor)",
  processos: "processos societários",
  fases: "fases de processos",
  atendimentos: "atendimentos do portal",
  vencimentos: "vencimentos acompanhados",
  oportunidades: "oportunidades no CRM",
};

export function TransferirTrabalho({
  m,
  inativar,
  destinos,
  aoFechar,
  aoConcluir,
  aoErro,
}: {
  m: Membro;
  inativar: boolean;
  destinos: Membro[];
  aoFechar: () => void;
  aoConcluir: (texto: string) => void;
  aoErro: (e: unknown) => void;
}) {
  const { org } = useOrg();
  const [pend, setPend] = useState<Record<string, number> | null>(null);
  const [para, setPara] = useState("");
  const [carteira, setCarteira] = useState(true);
  const [enviando, setEnviando] = useState(false);

  // aoErro muda a cada render do pai; useEffectEvent evita refazer a consulta por causa disso
  const avisarErro = useEffectEvent(aoErro);
  useEffect(() => {
    void supabase()
      .rpc("hub_pendencias_membro", { p_org: org.id, p_user: m.user_id })
      .then(({ data, error }) => (error ? avisarErro(error) : setPend(data as Record<string, number>)));
  }, [org.id, m.user_id]);

  const total = pend ? Object.values(pend).reduce((a, b) => a + Number(b), 0) : 0;
  const itens = pend ? Object.entries(pend).filter(([, v]) => Number(v) > 0) : [];

  async function concluir() {
    setEnviando(true);
    const sb = supabase();
    let texto = "";
    if (total > 0) {
      const { data, error } = await sb.rpc("hub_transferir_trabalho", {
        p_org: org.id,
        p_de: m.user_id,
        p_para: para,
        p_carteira: carteira,
      });
      if (error) {
        setEnviando(false);
        return aoErro(error);
      }
      const r = data as Record<string, number>;
      const destino = destinos.find((d) => d.user_id === para)?.nome ?? "";
      texto = `${r.tarefas ?? 0} tarefa(s)${carteira ? `, ${r.carteira ?? 0} cliente(s) da carteira` : ""} e demais itens passaram de ${m.nome} para ${destino}.`;
    }
    if (inativar) {
      const { error } = await sb.rpc("hub_editar_membro", {
        p_org: org.id,
        p_user: m.user_id,
        p_nome: m.nome,
        p_papel: m.papel,
        p_setor: m.setor_id,
        p_perfil: m.perfil_id ?? null,
        p_ativo: false,
      });
      if (error) {
        setEnviando(false);
        return aoErro(error);
      }
      texto = `${texto ? texto + " " : ""}${m.nome} foi inativado.`;
    }
    setEnviando(false);
    aoConcluir(texto || "Nada a transferir.");
  }

  const precisaDestino = total > 0;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={aoFechar}>
      <div onClick={(e) => e.stopPropagation()} className="cartao w-full max-w-md space-y-4 p-5">
        <div>
          <h2 className="text-lg font-semibold text-[var(--marca)]">
            {inativar ? `Inativar ${m.nome}` : `Transferir trabalho de ${m.nome}`}
          </h2>
          <p className="text-sm text-neutral-600">
            {inativar
              ? "Antes de inativar, todo o trabalho em aberto passa para outra pessoa. O histórico fica guardado."
              : "Passa tudo o que está em aberto com esta pessoa para outra, de uma vez."}
          </p>
        </div>
        {!pend ? (
          <p className="text-sm text-neutral-500">Verificando o que está com {m.nome}…</p>
        ) : total === 0 ? (
          <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">Nenhum trabalho em aberto com {m.nome}.</p>
        ) : (
          <>
            <ul className="divide-y divide-[var(--borda)] rounded-lg border border-[var(--borda)] text-sm">
              {itens.map(([k, v]) => (
                <li key={k} className="flex justify-between px-3 py-2">
                  <span>{ROTULO_PENDENCIA[k] ?? k}</span>
                  <b className="tabular-nums text-[var(--marca)]">{v}</b>
                </li>
              ))}
            </ul>
            <label className="campo">
              <span>Passar para</span>
              <select value={para} onChange={(e) => setPara(e.target.value)}>
                <option value="">Escolha a pessoa…</option>
                {destinos.map((d) => (
                  <option key={d.user_id} value={d.user_id}>
                    {d.nome}
                  </option>
                ))}
              </select>
            </label>
            {Number(pend.carteira) > 0 && (
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-[var(--marca)]"
                  checked={carteira}
                  onChange={(e) => setCarteira(e.target.checked)}
                />
                <span>Transferir também a carteira de clientes (as próximas rotinas já nascem com a nova pessoa)</span>
              </label>
            )}
            {inativar && !carteira && Number(pend.carteira) > 0 && (
              <p className="text-xs text-[var(--perigo)]">Para inativar, a carteira também precisa ser transferida.</p>
            )}
          </>
        )}
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={aoFechar}>
            Cancelar
          </button>
          <button
            className={inativar ? "btn-primario !bg-[var(--perigo)]" : "btn-primario"}
            disabled={
              !pend ||
              enviando ||
              (precisaDestino && !para) ||
              (inativar && !carteira && Number(pend?.carteira) > 0) ||
              (!inativar && total === 0)
            }
            onClick={concluir}
          >
            {enviando ? "Aguarde…" : inativar ? (total > 0 ? "Transferir e inativar" : "Inativar") : "Transferir"}
          </button>
        </div>
      </div>
    </div>
  );
}
