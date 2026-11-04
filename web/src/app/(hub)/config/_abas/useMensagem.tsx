// Aviso temporário das abas de Configurações (sucesso some em 3,5 s; erro em 8 s), anunciado ao leitor de tela.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useMensagem() {
  const [msg, setMsg] = useState<{ erro: boolean; texto: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const mostrar = useCallback((texto: string, erro = false) => {
    setMsg({ erro, texto });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), erro ? 8000 : 3500);
  }, []);
  // a caixa fica sempre na tela (vazia quando não há aviso) para o leitor de tela anunciar quando o texto chega
  const el = (
    <div role={msg?.erro ? "alert" : "status"} aria-live={msg?.erro ? "assertive" : "polite"} className={msg ? "" : "sr-only"}>
      {msg && (
        <div
          className={`cartao p-3 text-sm ${
            msg.erro ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {msg.texto}
        </div>
      )}
    </div>
  );
  return { mostrar, el };
}
