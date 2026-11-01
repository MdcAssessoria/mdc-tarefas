"use client";

import { useState } from "react";
import { SUPABASE_KEY, SUPABASE_URL, supabase } from "@/lib/supabase";
import type { Escolha } from "@/dominios/demonstrativos/selecaoPeriodo";

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
}: {
  balanceteId: string;
  periodo?: Escolha | null;
  rotulo?: string;
  rascunho?: boolean;
  aviso?: string | null;
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
        disabled={estado === "gerando"}
        title={rotulo ? `PDF completo de ${rotulo}, no papel timbrado da MDC` : "PDF completo no papel timbrado da MDC"}
      >
        {estado === "gerando" ? "Gerando PDF…" : `${rascunho ? "PDF (rascunho)" : "Baixar PDF"}${rotulo ? ` · ${rotulo}` : ""}`}
      </button>
      {aviso && !msg && <span className="max-w-72 text-right text-[11px] text-amber-800">{aviso}</span>}
      {msg && <span className={`text-[11px] ${estado === "erro" ? "text-red-700" : "text-emerald-700"}`}>{msg}</span>}
    </span>
  );
}
