// Aviso temporário das abas de Configurações (sucesso some em 3,5 s; erro em 8 s).
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
  const el = msg && (
    <div
      className={`cartao p-3 text-sm ${
        msg.erro ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"
      }`}
    >
      {msg.texto}
    </div>
  );
  return { mostrar, el };
}
