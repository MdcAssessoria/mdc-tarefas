// Botão "Baixar PDF" dos demonstrativos: pede o PDF oficial (timbrado, assinado quando publicado) à Função Edge demonstrativo-pdf.
"use client";

import { useState } from "react";
import { chamarFuncaoBruta } from "@/lib/funcoesEdge";
import { traduzirErro } from "@/lib/erros";
import { listarMeses, selecionar } from "@/dominios/demonstrativos/selecaoPeriodo";
import type { Escolha, RegPeriodo } from "@/dominios/demonstrativos/selecaoPeriodo";
import { situacaoPdf } from "@/dominios/demonstrativos/pdfPeriodo";

/**
 * O que o botão do PDF vai entregar para o período escolhido, com a mesma regra do servidor (pdfPeriodo.ts):
 * texto do botão, aviso antes de baixar e bloqueio quando o PDF não pode sair (mês publicado faltando no meio).
 * `historico` pode ter rascunhos (tela da equipe): o PDF de trimestre, semestre ou ano usa só os publicados.
 */
export function estadoPdf<T extends RegPeriodo & { status: string }>(historico: T[], escolha: Escolha | null, paraCliente = false) {
  if (!escolha || escolha.visao === "mensal") return { aviso: null, bloqueio: null };
  const rotulo = selecionar(historico, escolha)?.rotulo ?? "o período";
  const sel = selecionar(
    historico.filter((b) => b.status === "publicado"),
    escolha,
  );
  // o cliente não publica nada: para ele a mensagem diz o que a MDC ainda vai fechar
  const pedir = (meses: string) =>
    paraCliente
      ? `O PDF de ${rotulo} fica disponível quando a MDC concluir ${meses}.`
      : `Para baixar o PDF de ${rotulo}, publique antes: ${meses}.`;
  if (!sel)
    return {
      aviso: null,
      bloqueio: paraCliente
        ? `O PDF de ${rotulo} fica disponível quando a MDC concluir o período.`
        : `Nenhum mês de ${rotulo} foi publicado ainda: publique os meses para baixar o PDF.`,
    };
  const sit = situacaoPdf(sel.meses, sel.importados);
  if (sit.tipo === "lacuna") return { aviso: null, bloqueio: pedir(listarMeses(sit.faltam)) };
  if (sit.tipo === "parcial")
    return {
      aviso: `Período parcial: o PDF sai só com ${listarMeses(sel.importados)}, marcado como parcial e sem assinatura.`,
      bloqueio: null,
    };
  return { aviso: null, bloqueio: null };
}

/**
 * Baixa o PDF completo das demonstrações no padrão MDC, do período escolhido na tela (mês, trimestre, semestre ou
 * ano). O servidor refaz o cálculo do período só com meses publicados e assina digitalmente quando há certificado.
 * `aviso` explica, antes de baixar, o que fica de fora (ex.: meses ainda em rascunho).
 */
export function BotaoPdf({
  balanceteId,
  periodo,
  rotulo,
  rascunho,
  aviso,
  bloqueio,
}: {
  balanceteId: string;
  periodo?: Escolha | null;
  rotulo?: string;
  rascunho?: boolean;
  aviso?: string | null;
  /** Quando preenchido, o PDF não pode sair: botão desligado e o motivo embaixo. */
  bloqueio?: string | null;
}) {
  const [estado, setEstado] = useState<"livre" | "gerando" | "erro">("livre");
  const [msg, setMsg] = useState<string | null>(null);

  async function baixar() {
    setEstado("gerando");
    setMsg(null);
    try {
      const r = await chamarFuncaoBruta("demonstrativo-pdf", { corpo: { balancete_id: balanceteId, periodo: periodo ?? null } });
      const blob = await r.blob();
      const nome = /filename="([^"]+)"/.exec(r.headers.get("content-disposition") ?? "")?.[1] ?? "demonstrativos-MDC.pdf";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = nome;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      setMsg(
        r.headers.get("x-assinado") === "1" ? "PDF assinado digitalmente pela MDC." : rascunho ? "PDF de rascunho (sem assinatura)." : null,
      );
      setEstado("livre");
    } catch (e) {
      setMsg(traduzirErro(e));
      setEstado("erro");
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        className="btn"
        onClick={baixar}
        disabled={estado === "gerando" || !!bloqueio}
        title={rotulo ? `PDF completo de ${rotulo}, no papel timbrado da MDC` : "PDF completo no papel timbrado da MDC"}
      >
        {estado === "gerando" ? "Gerando PDF…" : `${rascunho ? "PDF (rascunho)" : "Baixar PDF"}${rotulo ? ` · ${rotulo}` : ""}`}
      </button>
      {(bloqueio || aviso) && !msg && <span className="max-w-72 text-right text-[11px] text-amber-800">{bloqueio ?? aviso}</span>}
      {msg && <span className={`text-[11px] ${estado === "erro" ? "text-red-700" : "text-emerald-700"}`}>{msg}</span>}
    </span>
  );
}
