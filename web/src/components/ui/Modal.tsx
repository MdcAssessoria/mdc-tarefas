"use client";
// Janela de diálogo sobre a tela (formulários de cadastro, confirmações com escolhas). Acessível: role="dialog",
// aria-modal, fecha com Esc ou clique fora, põe o foco no primeiro campo, mantém o Tab dentro e devolve o foco ao sair.
// A janela nunca passa da altura da tela: o título fica fixo em cima, só o corpo rola e, com `rodape`, os botões
// ficam fixos embaixo (o botão principal sempre à vista). Formulário longo: largura "5xl"/"6xl"/"7xl" e as colunas de
// `ColunasFormulario` (duas no computador, uma no celular). Regra em docs/08-convencoes.md, seção 8.3.1.
import { useEffect, useEffectEvent, useId, useRef } from "react";

const LARGURAS = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
  "6xl": "max-w-6xl",
  "7xl": "max-w-7xl",
} as const;
const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  titulo,
  descricao,
  aoFechar,
  largura = "md",
  espaco = 3,
  celularCheio = false,
  rodape,
  avisoRodape,
  children,
}: {
  titulo: React.ReactNode;
  /** Texto curto abaixo do título, explicando o que a janela faz. */
  descricao?: React.ReactNode;
  aoFechar: () => void;
  largura?: keyof typeof LARGURAS;
  /** Espaço entre os blocos do conteúdo (3 = 0,75rem; 4 = 1rem). */
  espaco?: 3 | 4;
  /** No celular a janela ocupa a tela inteira (listas longas, como o "Ver caminho"); no computador nada muda. */
  celularCheio?: boolean;
  /** Botões da janela (Cancelar, Salvar…), fixos embaixo: ficam à vista mesmo quando o corpo rola. Escreva na ordem
   *  de sempre; a regra do globals.css põe o botão principal antes do Cancelar. Num `<form>`, o botão de enviar
   *  aqui leva `form="<id do form>"`. */
  rodape?: React.ReactNode;
  /** Mensagem logo acima dos botões fixos (erro do salvar, aviso), para a pessoa ver sem rolar. */
  avisoRodape?: React.ReactNode;
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
    <div className={`fixed inset-0 z-50 grid place-items-center bg-black/40 ${celularCheio ? "p-0 sm:p-4" : "p-4"}`} onClick={aoFechar}>
      <div
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`cartao flex w-full flex-col overflow-hidden ${LARGURAS[largura]} outline-none ${
          celularCheio
            ? "h-[100dvh] max-h-[100dvh] rounded-none sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:rounded-[12px]"
            : "max-h-[calc(100dvh-2rem)]"
        }`}
      >
        <div className="shrink-0 px-4 pb-2 pt-4 sm:px-5 sm:pt-5">
          <h2 id={idTitulo} className="text-lg font-semibold text-[var(--marca)]">
            {titulo}
          </h2>
          {descricao && <p className="text-sm text-neutral-600">{descricao}</p>}
        </div>
        <div
          data-corpo-janela
          className={`min-h-0 flex-1 overflow-y-auto px-4 pt-1 sm:px-5 ${rodape ? "pb-4" : "pb-4 sm:pb-5"} ${
            espaco === 4 ? "space-y-4" : "space-y-3"
          }`}
        >
          {children}
        </div>
        {rodape && (
          <div data-rodape-janela className="shrink-0 space-y-2 border-t border-[var(--borda)] bg-[var(--superficie)] px-4 py-3 sm:px-5">
            {avisoRodape}
            <div className="flex flex-wrap items-center justify-end gap-2">{rodape}</div>
          </div>
        )}
      </div>
    </div>
  );
}
