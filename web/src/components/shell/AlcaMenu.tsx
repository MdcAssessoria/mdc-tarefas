// Alça na borda direita do menu lateral: arrastar alarga ou estreita o menu; duplo clique volta ao tamanho padrão.
// Também funciona pelo teclado (setas ← → e Home), para quem não usa mouse.
"use client";

import { useRef } from "react";
import { LARGURA_MENU, limitarLarguraMenu } from "@/lib/larguraMenu";

export function AlcaMenu({
  largura,
  aoMudar,
  aoTerminar,
}: {
  largura: number;
  /** Durante o arraste (só na tela). */
  aoMudar: (px: number) => void;
  /** Ao soltar: a largura final, para guardar. */
  aoTerminar: (px: number) => void;
}) {
  const inicio = useRef<{ x: number; largura: number } | null>(null);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Largura do menu"
      aria-valuemin={LARGURA_MENU.minima}
      aria-valuemax={LARGURA_MENU.maxima}
      aria-valuenow={largura}
      tabIndex={0}
      title="Arraste para alargar ou estreitar o menu. Duplo clique volta ao tamanho padrão."
      className="group absolute inset-y-0 -right-1.5 z-20 w-3 cursor-col-resize touch-none outline-none"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        inicio.current = { x: e.clientX, largura };
        document.body.style.userSelect = "none";
      }}
      onPointerMove={(e) => {
        if (!inicio.current) return;
        aoMudar(limitarLarguraMenu(inicio.current.largura + e.clientX - inicio.current.x));
      }}
      onPointerUp={(e) => {
        if (!inicio.current) return;
        const final = limitarLarguraMenu(inicio.current.largura + e.clientX - inicio.current.x);
        inicio.current = null;
        document.body.style.userSelect = "";
        aoTerminar(final);
      }}
      onPointerCancel={() => {
        inicio.current = null;
        document.body.style.userSelect = "";
      }}
      onDoubleClick={() => aoTerminar(LARGURA_MENU.padrao)}
      onKeyDown={(e) => {
        const passo = e.key === "ArrowRight" ? LARGURA_MENU.passo : e.key === "ArrowLeft" ? -LARGURA_MENU.passo : 0;
        if (passo) {
          e.preventDefault();
          aoTerminar(limitarLarguraMenu(largura + passo));
        } else if (e.key === "Home") {
          e.preventDefault();
          aoTerminar(LARGURA_MENU.padrao);
        }
      }}
    >
      {/* linha que aparece ao passar o mouse ou com o foco do teclado */}
      <span className="absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-[var(--destaque)] opacity-0 transition-opacity group-hover:opacity-70 group-focus-visible:opacity-100" />
    </div>
  );
}
