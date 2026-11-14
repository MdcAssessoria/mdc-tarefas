// Uma conta da família numa linha (app no celular): ícone do tipo de gasto, nome, quando vence e o valor, com o botão
// Pagar/Recebi à mão. Tocar na linha abre a tela de pagar com os detalhes.
"use client";

import { Icone } from "@/components/ui/Icone";
import { brl } from "@/lib/formato/moeda";
import { falta, iconeDaCategoria, quando, quitada, textoVencimento } from "../../app";
import type { ContaApp } from "../../app";

export function corDaConta(c: ContaApp, hoje: string) {
  if (quitada(c) || c.tipo === "receber") return { fundo: "bg-emerald-50", cor: "text-emerald-800", texto: "text-emerald-800" };
  const q = quando(c.vencimento, hoje);
  if (q === "atrasada") return { fundo: "bg-red-50", cor: "text-red-700", texto: "text-red-700" };
  if (q === "hoje") return { fundo: "bg-amber-50", cor: "text-amber-800", texto: "text-amber-800" };
  return { fundo: "bg-[#F1EEE5]", cor: "text-[var(--marca)]", texto: "text-neutral-600" };
}

export function LinhaConta({
  c,
  hoje,
  aoAbrir,
  aoPagar,
  botao = true,
}: {
  c: ContaApp;
  hoje: string;
  aoAbrir: () => void;
  aoPagar: () => void;
  botao?: boolean;
}) {
  const paga = quitada(c);
  const tom = corDaConta(c, hoje);
  const parcela = c.parcelas && c.parcelas > 1 ? ` · ${c.parcela}/${c.parcelas}` : "";
  return (
    <li className="flex items-center gap-3 border-b border-[#EEEAE0] py-3 last:border-b-0">
      <button type="button" onClick={aoAbrir} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tom.fundo} ${tom.cor}`}>
          <Icone nome={paga ? "check" : iconeDaCategoria(c.categoria ?? c.descricao, c.tipo)} className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className={`block truncate text-[15px] font-semibold ${paga ? "text-neutral-500" : "text-neutral-900"}`}>{c.descricao}</span>
          <span className={`block truncate text-[13px] font-medium ${tom.texto}`}>
            {paga ? (c.tipo === "receber" ? "Recebido" : "Paga") : textoVencimento(c, hoje)}
            {parcela}
          </span>
        </span>
      </button>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className={`num text-[15px] font-semibold ${c.tipo === "receber" ? "text-emerald-800" : "text-neutral-900"}`}>
          {c.tipo === "receber" ? "+ " : ""}
          {brl(paga ? c.valor : falta(c))}
        </span>
        {botao && !paga && (
          <button type="button" onClick={aoPagar} className="btn-primario !min-h-8 !px-3 !py-1 text-[13px]">
            <Icone nome="check" className="h-4 w-4" />
            {c.tipo === "receber" ? "Recebi" : "Pagar"}
          </button>
        )}
      </span>
    </li>
  );
}
