// Janela "Chave do Ledgra" do contrato (migração 067): mostra a chave em uso do cliente (só o começo dela), quando foi
// usada pela última vez e o que o Ledgra recebeu; gera uma chave nova (a anterior para de valer) e revoga com motivo.
// O texto completo da chave aparece UMA vez, logo depois de gerar, para copiar e colar na ficha da empresa no Ledgra.
"use client";

import { useCallback, useState } from "react";
import { traduzirErro } from "@/lib/erros";
import { useConsulta } from "@/lib/useConsulta";
import { supabase } from "@/lib/supabase";
import { Modal } from "@/components/ui/Modal";
import { Carregando } from "@/components/ui/Carregando";
import { Icone } from "@/components/ui/Icone";
import { gerarChaveLedgra, revogarChaveLedgra } from "../repositorio";
import type { Contrato } from "../tipos";

interface ChaveLedgra {
  id: string;
  prefixo: string;
  criada_em: string;
  ultimo_uso_em: string | null;
  ultimo_uso_situacao: string | null;
}

const SITUACAO: Record<string, string> = {
  ativa: "Licença ativa",
  bloqueada: "Cliente bloqueado",
  sem_contrato: "Sem contrato com módulos do Ledgra",
  cnpj_diferente: "CNPJ da empresa no Ledgra é diferente do cliente",
};
const quando = (s: string | null) => (s ? new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "nunca");

export function JanelaChaveLedgra({ contrato, cliente, aoFechar }: { contrato: Contrato; cliente: string; aoFechar: () => void }) {
  const q = useConsulta(
    useCallback(async () => {
      const { data, error } = await supabase()
        .from("lic_ledgra_chaves")
        .select("id,prefixo,criada_em,ultimo_uso_em,ultimo_uso_situacao")
        .eq("cliente_id", contrato.cliente_id)
        .is("revogada_em", null)
        .maybeSingle();
      if (error) throw error;
      return data as ChaveLedgra | null;
    }, [contrato.cliente_id]),
  );
  const [nova, setNova] = useState<string | null>(null);
  const [confirmarNova, setConfirmarNova] = useState(false);
  const [revogando, setRevogando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [copiada, setCopiada] = useState(false);
  const atual = q.dados ?? null;
  const temLedgra = contrato.modalidade === "full" || contrato.produtos.length > 0;

  async function gerar() {
    setOcupado(true);
    setErro("");
    try {
      setNova(await gerarChaveLedgra(contrato.cliente_id));
      setConfirmarNova(false);
      q.recarregar();
    } catch (e) {
      setErro(traduzirErro(e));
    }
    setOcupado(false);
  }
  async function revogar() {
    if (!atual) return;
    if (motivo.replace(/[^\p{L}]/gu, "").length < 5) return setErro("Escreva o motivo (pelo menos 5 letras).");
    setOcupado(true);
    setErro("");
    try {
      await revogarChaveLedgra(atual.id, motivo.trim());
      setRevogando(false);
      setMotivo("");
      setNova(null);
      q.recarregar();
    } catch (e) {
      setErro(traduzirErro(e));
    }
    setOcupado(false);
  }
  async function copiar() {
    if (!nova) return;
    try {
      await navigator.clipboard.writeText(nova);
      setCopiada(true);
    } catch {
      setErro("Não deu para copiar sozinho. Selecione a chave e copie.");
    }
  }

  return (
    <Modal
      titulo="Chave do Ledgra"
      descricao={`${cliente} · a chave liga a empresa no ERP Ledgra a este contrato e libera os módulos contratados.`}
      aoFechar={aoFechar}
      largura="xl"
      avisoRodape={erro && <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{erro}</p>}
      rodape={
        <>
          {revogando ? (
            <button className="btn-perigo" onClick={revogar} disabled={ocupado}>
              <Icone nome="cancelar" />
              {ocupado ? "Revogando…" : "Revogar chave"}
            </button>
          ) : (
            (!atual || confirmarNova) && (
              <button className="btn-primario" onClick={gerar} disabled={ocupado || q.carregando}>
                <Icone nome="atualizar" />
                {ocupado ? "Gerando…" : atual ? "Gerar nova chave" : "Gerar chave"}
              </button>
            )
          )}
          <button
            className="btn"
            onClick={revogando ? () => setRevogando(false) : confirmarNova ? () => setConfirmarNova(false) : aoFechar}
          >
            <Icone nome="voltar" />
            Voltar
          </button>
        </>
      }
    >
      {q.carregando ? (
        <Carregando />
      ) : q.erro ? (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{q.erro}</p>
      ) : (
        <>
          {nova && (
            <div className="rounded-lg border-2 border-emerald-600 bg-emerald-50 p-3">
              <p className="text-sm font-semibold text-emerald-900">Chave nova. Copie agora: ela não aparece de novo.</p>
              <p className="mt-2 select-all break-all rounded-md bg-white p-2 font-mono text-base font-bold tracking-wide">{nova}</p>
              <button className="btn mt-2" onClick={copiar}>
                <Icone nome={copiada ? "check" : "copiar"} />
                {copiada ? "Copiada" : "Copiar chave"}
              </button>
              <p className="mt-2 text-xs text-emerald-900">
                No Ledgra: Empresas › ficha da empresa › aba Licença › cole a chave e clique em Salvar e conferir.
              </p>
            </div>
          )}
          {!temLedgra && (
            <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
              Este contrato não tem módulo do Ledgra. A chave funciona, mas o Ledgra vai mostrar &quot;Sem contrato&quot;.
            </p>
          )}
          {atual ? (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-neutral-500">Chave em uso</dt>
                <dd className="font-mono font-semibold">{atual.prefixo}…</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Gerada em</dt>
                <dd>{quando(atual.criada_em)}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Última conferência do Ledgra</dt>
                <dd>{quando(atual.ultimo_uso_em)}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">O Ledgra recebeu</dt>
                <dd>{atual.ultimo_uso_situacao ? (SITUACAO[atual.ultimo_uso_situacao] ?? atual.ultimo_uso_situacao) : "—"}</dd>
              </div>
            </dl>
          ) : (
            !nova && (
              <p className="text-sm text-neutral-700">
                Este cliente ainda não tem chave. Gere uma e cole no Ledgra; o CNPJ da empresa lá precisa ser o mesmo do cliente aqui.
              </p>
            )
          )}
          {atual && !revogando && !confirmarNova && (
            <div className="flex flex-wrap gap-2">
              <button className="btn" onClick={() => setConfirmarNova(true)}>
                <Icone nome="atualizar" />
                Trocar a chave
              </button>
              <button className="btn-perigo" onClick={() => setRevogando(true)}>
                <Icone nome="cancelar" />
                Revogar
              </button>
            </div>
          )}
          {confirmarNova && (
            <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
              A chave atual ({atual?.prefixo}…) deixa de valer na hora. Cole a nova no Ledgra logo em seguida para não fechar os módulos do
              cliente na próxima conferência.
            </p>
          )}
          {revogando && (
            <label className="campo">
              <span>Motivo da revogação</span>
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex.: cliente encerrou o contrato"
                autoFocus
                required
              />
              <span className="text-xs text-neutral-600">Na próxima conferência o Ledgra fecha os módulos pagos desta empresa.</span>
            </label>
          )}
        </>
      )}
    </Modal>
  );
}
