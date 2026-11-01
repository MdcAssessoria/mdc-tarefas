"use client";

import { useState } from "react";
import { SUPABASE_KEY, SUPABASE_URL, supabase } from "@/lib/supabase";
import { listarMeses, selecionar } from "@/dominios/demonstrativos/selecaoPeriodo";
import type { Escolha, RegPeriodo } from "@/dominios/demonstrativos/selecaoPeriodo";
import { situacaoPdf } from "@/dominios/demonstrativos/pdfPeriodo";

/**
 * O que o botão do PDF vai entregar para o período escolhido, com a mesma regra do servidor (pdfPeriodo.ts):
 * texto do botão, aviso antes de baixar e bloqueio quando o PDF não pode sair (mês publicado faltando no meio).
 * `historico` pode ter rascunhos (tela da equipe): o PDF de trimestre, semestre ou ano usa só os publicados.
 */
export function estadoPdf<T extends RegPeriodo & { status: string }>(historico: T[], escolha: Escolha | null) {
  if (!escolha || escolha.visao === "mensal") return { aviso: null, bloqueio: null };
  const rotulo = selecionar(historico, escolha)?.rotulo ?? "o período";
  const sel = selecionar(
    historico.filter((b) => b.status === "publicado"),
    escolha,
  );
  if (!sel) return { aviso: null, bloqueio: `Nenhum mês de ${rotulo} foi publicado ainda: publique os meses para baixar o PDF.` };
  const sit = situacaoPdf(sel.meses, sel.importados);
  if (sit.tipo === "lacuna")
    return { aviso: null, bloqueio: `Para baixar o PDF de ${sel.rotulo}, publique antes: ${listarMeses(sit.faltam)}.` };
  if (sit.tipo === "parcial")
    return {
      aviso: `Período em andamento: o PDF sai só com ${listarMeses(sel.importados)}, marcado como parcial e sem assinatura.`,
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
      const { data } = await supabase().auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sua sessão expirou. Entre de novo.");
      const r = await fetch(`${SUPABASE_URL}/functions/v1/demonstrativo-pdf`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ balancete_id: balanceteId, periodo: periodo ?? null }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        throw new Error(j?.erro ?? "Não foi possível gerar o PDF agora. Tente de novo em instantes.");
      }
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
      setMsg((e as Error).message);
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
