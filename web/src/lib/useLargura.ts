// Largura real de um quadro na tela, para gráficos em SVG que acompanham a largura (letra legível no celular).
import { useEffect, useRef, useState } from "react";

/**
 * Devolve `ref` (ponha no elemento que envolve o SVG) e a `largura` atual dele em px (mínimo `minimo`).
 * Use a largura no viewBox do SVG: o texto fica sempre do tamanho certo, sem virar miniatura no celular.
 */
export function useLargura(inicial = 720, minimo = 280) {
  const ref = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(inicial);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setLargura(Math.max(minimo, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [minimo]);
  return { ref, largura };
}
