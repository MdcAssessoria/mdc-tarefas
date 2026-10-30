"use client";

import { useState } from "react";
import { SUPABASE_KEY, SUPABASE_URL, supabase } from "@/lib/supabase";

/** Baixa o PDF das demonstrações no padrão MDC (assinado digitalmente quando o mês está publicado e há certificado). */
export function BotaoPdf({ balanceteId, rascunho }: { balanceteId: string; rascunho?: boolean }) {
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
        body: JSON.stringify({ balancete_id: balanceteId }),
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
      setMsg(r.headers.get("x-assinado") === "1" ? "PDF assinado digitalmente pela MDC." : rascunho ? "PDF de rascunho (sem assinatura)." : null);
      setEstado("livre");
    } catch (e) {
      setMsg((e as Error).message);
      setEstado("erro");
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button className="btn" onClick={baixar} disabled={estado === "gerando"}>
        {estado === "gerando" ? "Gerando PDF…" : rascunho ? "PDF (rascunho)" : "Baixar PDF"}
      </button>
      {msg && <span className={`text-[11px] ${estado === "erro" ? "text-red-700" : "text-emerald-700"}`}>{msg}</span>}
    </span>
  );
}
