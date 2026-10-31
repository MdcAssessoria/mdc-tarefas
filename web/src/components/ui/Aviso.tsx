"use client";
// Caixa de mensagem (erro, sucesso ou atenção) e o hook useAviso, que mostra uma mensagem por alguns segundos.
import { useCallback, useEffect, useRef, useState } from "react";

export type TomAviso = "erro" | "sucesso" | "atencao";

const TONS: Record<TomAviso, string> = {
  erro: "bg-red-50 text-red-800",
  sucesso: "bg-emerald-50 text-emerald-800",
  atencao: "bg-amber-50 text-amber-900",
};

/** Mensagem em destaque. Erros são anunciados a leitores de tela (role="alert"). */
export function Aviso({ tom = "erro", children }: { tom?: TomAviso; children: React.ReactNode }) {
  return (
    <p role={tom === "erro" ? "alert" : "status"} className={`rounded-md p-3 text-sm ${TONS[tom]}`}>
      {children}
    </p>
  );
}

/**
 * Mensagem temporária: `mostrar("Salvo.")` ou `mostrar("Falhou…", "erro")`. Erros ficam 8 s, o resto 3,5 s.
 * Renderize `aviso` onde a mensagem deve aparecer.
 */
export function useAviso() {
  const [msg, setMsg] = useState<{ texto: string; tom: TomAviso } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const mostrar = useCallback((texto: string, tom: TomAviso = "sucesso") => {
    setMsg({ texto, tom });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), tom === "erro" ? 8000 : 3500);
  }, []);
  const aviso = msg && <Aviso tom={msg.tom}>{msg.texto}</Aviso>;
  return { aviso, mostrar };
}
