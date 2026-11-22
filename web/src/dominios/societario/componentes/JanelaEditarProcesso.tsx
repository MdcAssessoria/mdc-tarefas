// Janela "Editar dados do processo" (113): nome da empresa (enquanto não ligada a um cliente), CNPJ, UF, observações,
// responsável e previsão. Grava por soc_processo_editar, que registra o antes e o depois na linha do tempo.
"use client";

import { useId, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { cnpjValido, formatarDocumento, soDigitos } from "@/lib/documento";
import { Modal } from "@/components/ui/Modal";
import { ColunaFormulario, ColunasFormulario } from "@/components/ui/ColunasFormulario";
import { Icone } from "@/components/ui/Icone";
import { UFS } from "../consultasAbertura";

export interface DadosEditaveis {
  id: string;
  cliente_id: string | null;
  futuro_cliente: string | null;
  cnpj: string | null;
  uf: string | null;
  descricao: string | null;
  responsavel_id: string | null;
  previsao_em: string | null;
}

export function JanelaEditarProcesso({
  processo,
  abertura,
  aoFechar,
  aoSalvar,
}: {
  processo: DadosEditaveis;
  abertura: boolean;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const { membros } = useOrg();
  const idForm = useId();
  const [futuro, setFuturo] = useState(processo.futuro_cliente ?? "");
  const [cnpj, setCnpj] = useState(processo.cnpj ? formatarDocumento(processo.cnpj) : "");
  const [uf, setUf] = useState(processo.uf ?? "");
  const [descricao, setDescricao] = useState(processo.descricao ?? "");
  const [resp, setResp] = useState(processo.responsavel_id ?? "");
  const [previsao, setPrevisao] = useState(processo.previsao_em ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const semCliente = !processo.cliente_id;
  const cnpjDig = soDigitos(cnpj);
  const cnpjRuim = cnpjDig.length > 0 && !cnpjValido(cnpjDig);
  // quem já saiu da equipe continua aparecendo se for o responsável atual
  const opcoes = membros.filter((m) => m.ativo || m.user_id === processo.responsavel_id);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (cnpjRuim) return setErro("CNPJ inválido: confira os números.");
    setSalvando(true);
    setErro(null);
    const { error } = await supabase().rpc("soc_processo_editar", {
      p_proc: processo.id,
      p: {
        ...(semCliente ? { futuro_cliente: futuro } : {}),
        cnpj: cnpjDig || null,
        uf,
        descricao,
        responsavel_id: resp,
        previsao_em: previsao || null,
      },
    });
    setSalvando(false);
    if (error) return setErro(traduzirErro(error));
    aoSalvar();
  }

  return (
    <Modal
      titulo="Editar dados do processo"
      descricao="O que mudar fica registrado na linha do tempo, com o antes e o depois."
      aoFechar={aoFechar}
      largura="4xl"
      avisoRodape={
        erro && (
          <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
            {erro}
          </p>
        )
      }
      rodape={
        <>
          <button type="button" className="btn" onClick={aoFechar}>
            <Icone nome="voltar" className="h-4 w-4" />
            Voltar
          </button>
          <button type="submit" form={idForm} className="btn-primario" disabled={salvando}>
            <Icone nome="check" className="h-4 w-4" />
            {salvando ? "Salvando…" : "Salvar"}
          </button>
        </>
      }
    >
      <form id={idForm} onSubmit={salvar}>
        <ColunasFormulario>
          <ColunaFormulario>
            {semCliente ? (
              <label className="campo">
                <span>{abertura ? "Nome da empresa a abrir" : "Razão social da empresa"}</span>
                <input required maxLength={150} value={futuro} onChange={(e) => setFuturo(e.target.value)} />
                {abertura && <small className="text-xs text-[var(--texto-suave)]">Muda também a razão social da ficha de abertura.</small>}
              </label>
            ) : (
              <p className="flex items-start gap-2 rounded-lg bg-[var(--fundo)] p-3 text-sm">
                <Icone nome="info" className="mt-0.5 h-4 w-4 shrink-0" />
                O nome vem do cadastro do cliente: para mudar, edite o cliente em Clientes.
              </p>
            )}
            <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
              <label className="campo">
                <span>{abertura ? "CNPJ (quando sair)" : "CNPJ"}</span>
                <input
                  inputMode="numeric"
                  value={cnpj}
                  aria-invalid={cnpjRuim}
                  placeholder="00.000.000/0000-00"
                  onChange={(e) => setCnpj(formatarDocumento(soDigitos(e.target.value).slice(0, 14)))}
                />
                {cnpjRuim && <small className="text-xs text-red-700">CNPJ inválido</small>}
              </label>
              <label className="campo">
                <span>UF</span>
                <select value={uf} onChange={(e) => setUf(e.target.value)}>
                  <option value="">—</option>
                  {UFS.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="campo">
                <span>Responsável</span>
                <select required value={resp} onChange={(e) => setResp(e.target.value)}>
                  {opcoes.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.nome}
                      {m.ativo ? "" : " (inativo)"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="campo">
                <span>Previsão de conclusão</span>
                <input type="date" value={previsao} onChange={(e) => setPrevisao(e.target.value)} />
              </label>
            </div>
          </ColunaFormulario>
          <ColunaFormulario>
            <label className="campo">
              <span>O que muda / observações</span>
              <textarea rows={8} maxLength={4000} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
            </label>
          </ColunaFormulario>
        </ColunasFormulario>
      </form>
    </Modal>
  );
}
