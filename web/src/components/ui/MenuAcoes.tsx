// Menu "Mais ações" (botão de três pontinhos) das linhas das listas. A lista fica dentro de um quadro com rolagem, que
// cortava o menu aberto nas últimas linhas (09/11/2026). Aqui o menu abre "solto" na tela (position: fixed), alinhado
// ao botão: para baixo quando cabe, para cima quando não cabe, e com rolagem própria se for maior que a tela. Acompanha o
// botão ao rolar a página e fecha ao clicar fora, com Esc ou ao escolher uma ação (os itens continuam chamando
// `closest("details")?.removeAttribute("open")`).
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Icone } from "./Icone";

const MARGEM = 8;

export function MenuAcoes({
  children,
  rotulo = "Mais ações",
  largura = 224,
  className = "",
  grande = false,
}: {
  children: ReactNode;
  rotulo?: string;
  /** Largura do menu em px (padrão 224 = w-56). */
  largura?: number;
  className?: string;
  /** Botão de 40×40 px (listas que viram cartão no celular e pedem alvo de toque maior). */
  grande?: boolean;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const painel = useRef<HTMLDivElement>(null);
  const [estilo, setEstilo] = useState<CSSProperties>({ visibility: "hidden" });

  const fechar = useCallback(() => ref.current?.removeAttribute("open"), []);

  const posicionar = useCallback(() => {
    const d = ref.current;
    const p = painel.current;
    if (!d || !p) return;
    const b = d.querySelector("summary")!.getBoundingClientRect();
    const alto = p.scrollHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const larg = Math.min(largura, vw - 2 * MARGEM);
    const left = Math.max(MARGEM, Math.min(b.right - larg, vw - larg - MARGEM));
    const abaixo = vh - b.bottom - MARGEM;
    const acima = b.top - MARGEM;
    const paraCima = alto > abaixo && acima > abaixo;
    const espaco = Math.max(120, (paraCima ? acima : abaixo) - 4);
    setEstilo({
      position: "fixed",
      left,
      width: larg,
      maxHeight: espaco,
      ...(paraCima ? { bottom: vh - b.top + 4 } : { top: b.bottom + 4 }),
    });
  }, [largura]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    function aoAlternar() {
      if (!d!.open) return setEstilo({ visibility: "hidden" });
      posicionar();
    }
    function foraDele(e: Event) {
      if (d!.open && !d!.contains(e.target as Node)) fechar();
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape" && d!.open) {
        fechar();
        d!.querySelector("summary")?.focus();
      }
    }
    function rolou() {
      // ao rolar, o menu acompanha o botão (no celular o próprio toque rola a página)
      if (d!.open) posicionar();
    }
    d.addEventListener("toggle", aoAlternar);
    document.addEventListener("pointerdown", foraDele);
    document.addEventListener("keydown", tecla);
    window.addEventListener("scroll", rolou, true);
    window.addEventListener("resize", rolou);
    return () => {
      d.removeEventListener("toggle", aoAlternar);
      document.removeEventListener("pointerdown", foraDele);
      document.removeEventListener("keydown", tecla);
      window.removeEventListener("scroll", rolou, true);
      window.removeEventListener("resize", rolou);
    };
  }, [fechar, posicionar]);

  return (
    <details ref={ref} className={`relative ${className}`}>
      <summary
        className={`btn list-none [&::-webkit-details-marker]:hidden ${grande ? "!min-h-10 !w-10 !p-0" : "!min-h-8 !px-2.5"}`}
        aria-label={rotulo}
        title={rotulo}
      >
        <Icone nome="reticencias" className="h-5 w-5" />
      </summary>
      <div
        ref={painel}
        style={estilo}
        className="menu-acoes z-50 overflow-y-auto rounded-xl border border-[var(--borda)] bg-white p-1 text-left text-sm shadow-lg"
      >
        {children}
      </div>
    </details>
  );
}
