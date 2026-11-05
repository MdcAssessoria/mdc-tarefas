// Campo NBS "conforme a legislação" (062): mostra só os NBS que a tabela oficial do governo (Anexo VIII da NFS-e
// Nacional) permite para o serviço escolhido (item da LC 116 / código de tributação nacional). A tabela é conferida
// toda segunda no portal da NFS-e (Função fiscal-tabelas) e atualizada sozinha quando sai versão nova. Se a tabela não
// traz NBS para o serviço, cai na busca na lista completa (CampoNbs), com aviso. Também devolve a atividade do Simples
// do NBS escolhido (COD_ATIV_SN: diz o anexo), usada no cálculo dos tributos aproximados.
"use client";

import { useCallback, useEffect } from "react";
import { useConsulta } from "@/lib/useConsulta";
import { fmtData } from "@/lib/formato/datas";
import { formatarNbs, nbsDigitos } from "@/lib/fiscal/servicos";
import { CampoNbs } from "@/components/ui/CampoServico";
import { Icone } from "@/components/ui/Icone";
import { lerNbsDoServico } from "../leituras";

export function CampoNbsLegal({
  servico,
  valor,
  aoMudar,
  rotulo = "NBS (Nomenclatura Brasileira de Serviços)",
  desabilitado = false,
  aoAtividade,
}: {
  /** Código de tributação nacional (17.19.01) ou item (17.19); vazio = ainda não escolhido. */
  servico: string | null | undefined;
  valor: string;
  aoMudar: (nbs: string) => void;
  rotulo?: string;
  desabilitado?: boolean;
  /** Atividade do Simples do NBS escolhido (ou da 1ª da lista), para o cálculo dos tributos aproximados. */
  aoAtividade?: (ativ: { codigo: string | null; descricao: string | null } | null) => void;
}) {
  const digitos = (servico ?? "").replace(/\D/g, "");
  const temServico = digitos.length >= 4;
  const consulta = useConsulta(useCallback(() => (temServico ? lerNbsDoServico(digitos) : Promise.resolve(null)), [temServico, digitos]));
  const tabela = consulta.dados;
  const lista = tabela?.nbs ?? [];
  const atual = nbsDigitos(valor);
  const escolhido = lista.find((n) => n.nbs === atual);
  const foraDaTabela = !!atual && lista.length > 0 && !escolhido;

  const ativ = escolhido ?? lista[0];
  useEffect(() => {
    aoAtividade?.(ativ ? { codigo: ativ.ativ_sn, descricao: ativ.ativ_sn_descricao } : null);
  }, [ativ?.ativ_sn, ativ?.ativ_sn_descricao]); // eslint-disable-line react-hooks/exhaustive-deps

  const fonte = tabela?.versao && (
    <small className="flex items-start gap-1 text-xs text-[var(--texto-suave)]">
      <Icone nome="escudo" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--destaque-escuro)]" />
      <span>
        Pela tabela oficial do governo (Anexo VIII da NFS-e Nacional, versão {tabela.versao}). O HUB confere toda segunda-feira se saiu
        versão nova{tabela.conferida_em ? ` (última conferência: ${fmtData(tabela.conferida_em.slice(0, 10))})` : ""}.
      </span>
    </small>
  );

  if (!temServico)
    return (
      <label className="campo">
        <span>{rotulo}</span>
        <select disabled aria-label={rotulo}>
          <option>Escolha antes o serviço (LC 116)</option>
        </select>
        <small className="text-xs text-[var(--texto-suave)]">A lista mostra só os NBS que a lei permite para o serviço escolhido.</small>
      </label>
    );

  if (consulta.carregando && !tabela)
    return (
      <label className="campo">
        <span>{rotulo}</span>
        <select disabled aria-label={rotulo}>
          <option>Carregando a tabela oficial…</option>
        </select>
      </label>
    );

  if (!lista.length)
    return (
      <div className="space-y-1">
        <CampoNbs valor={valor} aoMudar={aoMudar} />
        <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">
          A tabela oficial não traz NBS para o serviço {tabela?.item ?? digitos}. Busque na lista completa e confira com o Emissor Nacional.
        </p>
      </div>
    );

  return (
    <label className="campo">
      <span>{rotulo}</span>
      <select value={atual ?? ""} disabled={desabilitado} onChange={(e) => aoMudar(e.target.value)} aria-label={rotulo}>
        <option value="">{lista.length === 1 ? "Escolha o NBS" : `Escolha um dos ${lista.length} NBS permitidos`}</option>
        {foraDaTabela && <option value={atual ?? ""}>{formatarNbs(atual)} (fora da tabela oficial)</option>}
        {lista.map((n) => (
          <option key={n.nbs} value={n.nbs}>
            {formatarNbs(n.nbs)} — {n.descricao}
          </option>
        ))}
      </select>
      {foraDaTabela && (
        <small className="rounded-md bg-red-50 p-2 text-xs text-red-800">
          O NBS {formatarNbs(atual)} não está entre os permitidos para o serviço {tabela?.item} pela tabela oficial: o Emissor Nacional pode
          recusar a nota. Escolha um da lista.
        </small>
      )}
      {fonte}
    </label>
  );
}
