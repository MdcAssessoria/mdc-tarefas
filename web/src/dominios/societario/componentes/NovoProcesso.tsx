// Janela "Novo processo societário": tipo, cliente (ou empresa ainda fora do cadastro), responsável, previsão e as
// fases que se aplicam. Grava pela função soc_abrir_processo (cria o processo, as fases e a tarefa da primeira fase).
"use client";

import { useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { nomeCliente } from "@/dominios/clientes/nome";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { Modal } from "@/components/ui/Modal";
import { Icone } from "@/components/ui/Icone";
import { CampoCnpj, ResumoCnpj } from "@/components/ui/CampoCnpj";
import { resumoCnpj } from "@/lib/consultaCnpj";
import type { DadosCnpj } from "@/lib/consultaCnpj";
import type { SocTipo } from "../processos";

/** Valor do seletor de cliente para "empresa ainda não cadastrada" (não é um id). */
export const FORA_DO_CADASTRO = "__fora_do_cadastro__";

/** Viabilidade só quando muda endereço/CNAE ou na abertura: nos outros tipos já vem desmarcada. */
const dispensaPadrao = (t: SocTipo | undefined) => (t && !["abertura", "filial"].includes(t.codigo) ? ["viabilidade"] : []);

export function NovoProcesso({ tipos, aoFechar, aoCriar }: { tipos: SocTipo[]; aoFechar: () => void; aoCriar: (id: string) => void }) {
  const { org, eu, clientes, membros } = useOrg();
  const ativos = tipos.filter((t) => t.ativo);
  const [tipoId, setTipoId] = useState(ativos[0]?.id ?? "");
  const [cliente, setCliente] = useState("");
  const [futuro, setFuturo] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [uf, setUf] = useState("SP");
  const [descricao, setDescricao] = useState("");
  const [receita, setReceita] = useState<DadosCnpj | null>(null);
  const [anotado, setAnotado] = useState(false);
  const [resp, setResp] = useState(eu.user_id);
  const [previsao, setPrevisao] = useState("");
  const [dispensar, setDispensar] = useState<string[]>(() => dispensaPadrao(ativos[0]));
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const tipo = ativos.find((t) => t.id === tipoId);
  const abertura = tipo?.codigo === "abertura";
  // empresa que ainda não está no cadastro (ex.: chegou à MDC já precisando de alteração); liga ao cliente depois
  const foraDoCadastro = !abertura && cliente === FORA_DO_CADASTRO;
  const semCliente = abertura || foraDoCadastro;

  function trocarTipo(id: string) {
    setTipoId(id);
    setDispensar(dispensaPadrao(ativos.find((t) => t.id === id)));
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    const { data, error } = await supabase().rpc("soc_abrir_processo", {
      p_org: org.id,
      p_tipo: tipoId,
      p_cliente: semCliente ? null : cliente || null,
      p_futuro: semCliente ? futuro : null,
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
    <Modal
      titulo="Novo processo societário"
      descricao="Abertura, alteração ou baixa. O HUB cria as fases e a tarefa da primeira fase para o responsável."
      aoFechar={aoFechar}
      largura="xl"
    >
      <form onSubmit={criar} className="space-y-3">
        <label className="campo">
          <span>Tipo</span>
          <select value={tipoId} onChange={(e) => trocarTipo(e.target.value)}>
            {ativos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </label>
        {!abertura && (
          <label className="campo">
            <span>Cliente</span>
            <select required value={cliente} onChange={(e) => setCliente(e.target.value)}>
              <option value="">Escolha…</option>
              <option value={FORA_DO_CADASTRO}>➕ Empresa ainda não cadastrada no HUB</option>
              {clientes
                .filter((c) => c.ativo)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.codigo_dominio ? `${c.codigo_dominio} · ` : ""}
                    {nomeCliente(c)}
                  </option>
                ))}
            </select>
          </label>
        )}
        {semCliente && (
          <>
            {foraDoCadastro && (
              <CampoCnpj
                valor={cnpj}
                aoMudar={(v) => {
                  setCnpj(v);
                  setReceita(null);
                }}
                aoCarregar={(d) => {
                  setReceita(d);
                  setAnotado(false);
                  setFuturo(d.razaoSocial);
                  if (d.uf) setUf(d.uf);
                }}
              />
            )}
            {foraDoCadastro && receita && (
              <ResumoCnpj
                d={receita}
                acao={
                  <button
                    type="button"
                    className="btn text-sm"
                    disabled={anotado}
                    onClick={() => {
                      const r = resumoCnpj(receita, new Date().toLocaleDateString("pt-BR"));
                      setDescricao((t) => (t.trim() ? `${t.trim()}\n\n${r}` : r));
                      setAnotado(true);
                    }}
                  >
                    <Icone nome={anotado ? "check" : "editar"} className="h-4 w-4" />
                    {anotado ? "Anotado nas observações" : "Anotar estes dados nas observações"}
                  </button>
                }
              />
            )}
            <div className="grid grid-cols-3 gap-3">
              <label className="campo col-span-2">
                <span>{abertura ? "Nome da empresa a abrir" : "Razão social da empresa"}</span>
                <input required value={futuro} onChange={(e) => setFuturo(e.target.value)} />
              </label>
              <label className="campo">
                <span>UF</span>
                <input maxLength={2} value={uf} onChange={(e) => setUf(e.target.value.toUpperCase())} />
              </label>
            </div>
            {abertura && (
              <label className="campo">
                <span>CNPJ (quando sair)</span>
                <input value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" inputMode="numeric" />
              </label>
            )}
            {foraDoCadastro && (
              <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                <Icone nome="info" className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  O processo anda normalmente sem o cadastro. Quando a empresa for cadastrada em Clientes, abra o processo e use{" "}
                  <b>Ligar ao cliente</b> para juntar tudo (tarefas e histórico).
                </span>
              </p>
            )}
          </>
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
        <div className="grid gap-3 sm:grid-cols-2">
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
            <legend className="px-1 text-xs text-[var(--texto-suave)]">Fases deste processo (desmarque as que não se aplicam)</legend>
            <div className="grid gap-1 text-sm sm:grid-cols-2">
              {tipo.fases
                .filter((f) => f.codigo !== "exigencias")
                .map((f) => (
                  <label key={f.codigo} className="flex min-h-9 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!dispensar.includes(f.codigo)}
                      onChange={(e) => setDispensar((d) => (e.target.checked ? d.filter((x) => x !== f.codigo) : [...d, f.codigo]))}
                    />
                    {f.nome}
                  </label>
                ))}
            </div>
            <p className="mt-2 text-xs text-[var(--texto-suave)]">A fase de exigências só abre se houver exigência.</p>
          </fieldset>
        )}
        {erro && (
          <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
            {erro}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button type="button" className="btn" onClick={aoFechar}>
            Voltar
          </button>
          <button className="btn-primario" disabled={enviando || !tipoId}>
            <Icone nome="check" className="h-4 w-4" />
            {enviando ? "Abrindo…" : "Abrir processo"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
