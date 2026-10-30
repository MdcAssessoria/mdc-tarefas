"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { abrirArquivo, enviarArquivo } from "@/lib/arquivos";
import { useMensagens } from "@/lib/chat";
import type { Mensagem } from "@/lib/chat";

/** Conversa (lado equipe ou lado cliente): mensagens em tempo real, anexo e envio. */
export function ChatMensagens({
  conversaId,
  orgId,
  clienteId,
  lado,
  fechada,
}: {
  conversaId: string;
  orgId: string;
  clienteId: string;
  lado: "equipe" | "cliente";
  fechada?: boolean;
}) {
  const { mensagens } = useMensagens(conversaId);
  const [texto, setTexto] = useState("");
  const [interna, setInterna] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [anexos, setAnexos] = useState<Record<string, { nome: string; caminho: string }>>({});
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    const ids = mensagens.map((m) => m.anexo_id).filter((x): x is string => !!x && !anexos[x]);
    if (ids.length)
      supabase()
        .from("hub_arquivos")
        .select("id,nome,caminho")
        .in("id", ids)
        .then(({ data }) =>
          setAnexos((a) => ({ ...a, ...Object.fromEntries(((data as { id: string; nome: string; caminho: string }[]) ?? []).map((x) => [x.id, x])) })),
        );
  }, [mensagens, anexos]);

  async function enviar(e?: React.FormEvent, arquivo?: File) {
    e?.preventDefault();
    if (!texto.trim() && !arquivo) return;
    setEnviando(true);
    setErro(null);
    try {
      let anexo_id: string | null = null;
      if (arquivo) {
        const a = await enviarArquivo(arquivo, {
          org: orgId,
          app: lado === "cliente" ? "portal" : "atendimento",
          ref: conversaId,
          cliente: clienteId,
          visivelCliente: !interna,
        });
        anexo_id = a.id;
      }
      const { error } = await supabase()
        .from("portal_mensagens")
        .insert({ conversa_id: conversaId, org_id: orgId, texto: texto.trim() || (arquivo ? `📎 ${arquivo.name}` : ""), anexo_id, interna: lado === "equipe" && interna });
      if (error) throw error;
      setTexto("");
    } catch (er) {
      setErro(traduzirErro(er));
    }
    setEnviando(false);
  }

  const bolha = (m: Mensagem) => {
    const minha = (lado === "equipe" && m.autor_tipo === "equipe") || (lado === "cliente" && m.autor_tipo === "cliente");
    if (m.autor_tipo === "sistema")
      return (
        <div key={m.id} className="text-center text-xs text-neutral-500">
          {m.texto}
        </div>
      );
    return (
      <div key={m.id} className={`flex ${minha ? "justify-end" : "justify-start"}`}>
        <div
          className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
            m.interna ? "border border-dashed border-amber-400 bg-amber-50" : minha ? "bg-[var(--marca)] text-white" : "bg-white ring-1 ring-[var(--borda)]"
          }`}
        >
          <div className={`mb-0.5 text-[11px] ${minha && !m.interna ? "text-[#C6D3CC]" : "text-neutral-500"}`}>
            {m.autor_nome ?? (m.autor_tipo === "equipe" ? "MDC" : "Cliente")}
            {m.interna && " · nota interna"} · {new Date(m.criado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
          </div>
          <div className="whitespace-pre-wrap">{m.texto}</div>
          {m.anexo_id && anexos[m.anexo_id] && (
            <button
              className={`mt-1 text-xs underline ${minha && !m.interna ? "text-[var(--destaque)]" : "text-[var(--destaque-escuro)]"}`}
              onClick={() => abrirArquivo(anexos[m.anexo_id!].caminho, anexos[m.anexo_id!].nome).catch((er) => setErro(traduzirErro(er)))}
            >
              📎 {anexos[m.anexo_id].nome}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto bg-[var(--fundo)] p-3">
        {mensagens.map(bolha)}
        <div ref={fim} />
      </div>
      {erro && <p className="bg-red-50 px-3 py-1 text-xs text-red-800">{erro}</p>}
      {fechada && lado === "cliente" ? (
        <p className="border-t border-[var(--borda)] p-3 text-center text-xs text-neutral-500">Atendimento resolvido. Escreva abaixo para reabrir.</p>
      ) : null}
      <form onSubmit={enviar} className="flex items-end gap-2 border-t border-[var(--borda)] bg-white p-2">
        <label className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-md text-neutral-500 hover:bg-[var(--fundo)]" title="Anexar arquivo">
          📎
          <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && enviar(undefined, e.target.files[0])} />
        </label>
        <textarea
          className="entrada min-h-9 flex-1 resize-none"
          rows={1}
          placeholder={lado === "equipe" && interna ? "Nota interna (o cliente não vê)…" : "Escreva sua mensagem…"}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              enviar();
            }
          }}
        />
        {lado === "equipe" && (
          <label className="flex shrink-0 items-center gap-1 text-xs text-neutral-600" title="Nota que só a equipe vê">
            <input type="checkbox" checked={interna} onChange={(e) => setInterna(e.target.checked)} /> interna
          </label>
        )}
        <button className="btn-primario shrink-0" disabled={enviando}>
          Enviar
        </button>
      </form>
    </div>
  );
}
