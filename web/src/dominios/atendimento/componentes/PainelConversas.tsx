// Moldura das conversas (Atendimento da equipe e "Fale com a MDC" do Portal): lista à esquerda e a conversa aberta à
// direita. No celular mostra uma coisa de cada vez: a lista; ao tocar numa conversa, só ela, com o botão "Voltar".
"use client";

import { useEffect, useRef } from "react";
import { Icone } from "@/components/ui/Icone";
import { Chip } from "@/components/ui/Chip";
import type { Tom } from "@/components/ui/Tons";
import type { Conversa } from "../chat";

/** Tom do chip de cada situação da conversa (mesmo significado das listas: vermelho = precisa de ação). */
export const TOM_CONVERSA: Record<Conversa["status"], Tom> = {
  novo: "vermelho",
  em_atendimento: "azul",
  aguardando_cliente: "violeta",
  resolvido: "verde",
};

export function ChipConversa({ status, nome }: { status: Conversa["status"]; nome: string }) {
  return <Chip tom={TOM_CONVERSA[status] ?? "neutro"}>{nome}</Chip>;
}

export function PainelConversas({
  lista,
  conversa,
  aberta,
  alturaComputador = "lg:h-[calc(100dvh-220px)]",
}: {
  /** Topo da lista (filtros, botão de nova) e os itens. */
  lista: React.ReactNode;
  /** A conversa aberta (ou o formulário de nova, ou a mensagem "escolha uma conversa"). */
  conversa: React.ReactNode;
  /** true quando há conversa (ou formulário) aberta: no celular esconde a lista. */
  aberta: boolean;
  /** Altura do quadro no computador (as duas colunas rolam por dentro). Classe escrita por inteiro ("lg:h-[…]"). */
  alturaComputador?: string;
}) {
  const quadro = useRef<HTMLElement>(null);
  // no celular, ao abrir uma conversa, leva a tela até ela
  useEffect(() => {
    if (aberta && window.matchMedia("(max-width: 1023px)").matches) quadro.current?.scrollIntoView({ block: "start" });
  }, [aberta]);
  return (
    <div className={`grid gap-3 lg:min-h-[480px] lg:grid-cols-[340px_minmax(0,1fr)] ${alturaComputador}`}>
      <aside className={`cartao min-h-0 flex-col overflow-hidden ${aberta ? "hidden lg:flex" : "flex"}`} aria-label="Conversas">
        {lista}
      </aside>
      <section
        ref={quadro}
        className={`cartao min-h-0 scroll-mt-4 flex-col overflow-hidden ${aberta ? "flex h-[calc(100dvh-120px)] min-h-[420px] lg:h-auto" : "hidden lg:flex"}`}
        aria-label="Conversa"
      >
        {conversa}
      </section>
    </div>
  );
}

/** Botão "Voltar às conversas", só no celular (no computador a lista está sempre ao lado). */
export function VoltarConversas({ aoVoltar }: { aoVoltar: () => void }) {
  return (
    <button type="button" className="btn !min-h-9 !px-2.5 lg:hidden" onClick={aoVoltar} aria-label="Voltar às conversas">
      <Icone nome="voltar" className="h-4 w-4" />
      <span className="sr-only sm:not-sr-only">Voltar</span>
    </button>
  );
}
