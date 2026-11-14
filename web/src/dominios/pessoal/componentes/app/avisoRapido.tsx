// Aviso rápido do app da família ("Aluguel paga", "Gasto salvo"): aparece por 2,5 s acima da barra de baixo.
// Qualquer tela chama avisoRapido(texto); o componente AvisoRapido (na barra) mostra.
"use client";

import { useEffect, useState } from "react";
import { Icone } from "@/components/ui/Icone";

const EVENTO = "pessoal:aviso";

export function avisoRapido(texto: string) {
  window.dispatchEvent(new CustomEvent<string>(EVENTO, { detail: texto }));
}

export function AvisoRapido() {
  const [aviso, setAviso] = useState<{ texto: string; n: number } | null>(null);
  useEffect(() => {
    let tempo: ReturnType<typeof setTimeout> | undefined;
    const mostrar = (e: Event) => {
      const texto = (e as CustomEvent<string>).detail;
      setAviso((a) => ({ texto, n: (a?.n ?? 0) + 1 }));
      clearTimeout(tempo);
      tempo = setTimeout(() => setAviso(null), 2500);
    };
    window.addEventListener(EVENTO, mostrar);
    return () => {
      window.removeEventListener(EVENTO, mostrar);
      clearTimeout(tempo);
    };
  }, []);
  if (!aviso) return null;
  return (
    <div
      key={aviso.n}
      role="status"
      className="surgir fixed bottom-28 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-xl bg-emerald-900 px-4 py-3 text-sm font-semibold text-white shadow-lg lg:bottom-8"
    >
      <Icone nome="check" className="h-4 w-4" />
      {aviso.texto}
    </div>
  );
}
