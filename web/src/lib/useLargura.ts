// Largura real de um quadro na tela, para gráficos em SVG desenharem na medida certa (viewBox = largura em px).
// Assim a letra de 11 px no SVG fica com 11 px de verdade: no celular o gráfico não vira miniatura ilegível.
// Mesma ideia do gráfico do Financeiro (dominios/financeiro/componentes/GraficosPainel), agora em lib para todos.
"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Devolve `ref` (ponha no <div> que envolve o SVG) e `largura` em px, atualizada quando a tela muda de tamanho.
 * Antes de medir (primeiro desenho) usa `inicial`; nunca devolve menos que `minimo`.
 */
export function useLargura<T extends HTMLElement = HTMLDivElement>(inicial = 720, minimo = 260) {
  const ref = useRef<T>(null);
  const [largura, setLargura] = useState(inicial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = (w: number) => setLargura(Math.max(minimo, Math.round(w)));
    medir(el.getBoundingClientRect().width || inicial);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => medir(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [inicial, minimo]);
  return { ref, largura };
}

/** De quantos em quantos rótulos mostrar no eixo para cada um ter pelo menos `espaco` px (11 px de letra ≈ 44 px). */
export function saltoRotulos(passoPx: number, espaco = 46) {
  return Math.max(1, Math.ceil(espaco / Math.max(1, passoPx)));
}
