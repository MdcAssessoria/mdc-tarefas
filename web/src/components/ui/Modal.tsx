"use client";
// Janela de diálogo sobre a tela (formulários de cadastro, confirmações com escolhas). Acessível: role="dialog",
// aria-modal, fecha com Esc ou clique fora, põe o foco no primeiro campo, mantém o Tab dentro e devolve o foco ao sair.
import { useEffect, useEffectEvent, useId, useRef } from "react";

const LARGURAS = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg", xl: "max-w-xl", "2xl": "max-w-2xl" } as const;
const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  titulo,
  descricao,
  aoFechar,
  largura = "md",
  espaco = 3,
  children,
}: {
  titulo: React.ReactNode;
  /** Texto curto abaixo do título, explicando o que a janela faz. */
  descricao?: React.ReactNode;
  aoFechar: () => void;
  largura?: keyof typeof LARGURAS;
  /** Espaço entre os blocos do conteúdo (3 = 0,75rem; 4 = 1rem). */
  espaco?: 3 | 4;
  children: React.ReactNode;
}) {
  const idTitulo = useId();
  const caixa = useRef<HTMLDivElement>(null);
  const fechar = useEffectEvent(aoFechar);

  useEffect(() => {
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const el = caixa.current;
    (el?.querySelector<HTMLElement>(FOCAVEIS) ?? el)?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        fechar();
      } else if (e.key === "Tab" && el) {
        // mantém o Tab circulando dentro da janela
        const lista = [...el.querySelectorAll<HTMLElement>(FOCAVEIS)];
        if (!lista.length) return;
        const [primeiro, ultimo] = [lista[0], lista[lista.length - 1]];
        if (e.shiftKey && document.activeElement === primeiro) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault();
          primeiro.focus();
        }
      }
    };
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("keydown", tecla);
      anterior?.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={aoFechar}>
      <div
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`cartao w-full ${LARGURAS[largura]} ${espaco === 4 ? "space-y-4" : "space-y-3"} p-5 outline-none`}
      >
        <div>
          <h2 id={idTitulo} className="text-lg font-semibold text-[var(--marca)]">
            {titulo}
          </h2>
          {descricao && <p className="text-sm text-neutral-600">{descricao}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
