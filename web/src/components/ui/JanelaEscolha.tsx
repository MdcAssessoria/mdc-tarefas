// Janela com duas ou mais escolhas (além de "Voltar"), no lugar do window.confirm de "OK = isto · Cancelar = aquilo",
// que confunde quem lê pouco e faz "fechar a janela" virar uma das opções sem querer.
// Uso: const [janela, escolher] = useEscolha(); const r = await escolher({ titulo, opcoes: [{ id: "todas", nome: … }] });
//      if (r === null) return;  // voltou sem escolher       … e {janela} no JSX.
"use client";

import { useCallback, useRef, useState } from "react";
import { Modal } from "./Modal";

export interface OpcaoEscolha {
  id: string;
  /** Texto do botão (diz a ação: "Só para esta empresa"). */
  nome: string;
  /** Explicação curta abaixo do botão. */
  detalhe?: string;
  /** Botão em destaque (a escolha mais comum). */
  principal?: boolean;
}

export interface OpcoesEscolha {
  titulo: string;
  descricao?: React.ReactNode;
  opcoes: OpcaoEscolha[];
}

export function JanelaEscolha({
  titulo,
  descricao,
  opcoes,
  aoEscolher,
  aoFechar,
}: OpcoesEscolha & { aoEscolher: (id: string) => void; aoFechar: () => void }) {
  return (
    <Modal titulo={titulo} descricao={descricao} aoFechar={aoFechar}>
      <div className="space-y-2">
        {opcoes.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => aoEscolher(o.id)}
            className={`w-full rounded-lg border p-3 text-left transition hover:border-[var(--destaque-escuro)] ${o.principal ? "border-[var(--marca)] bg-[var(--fundo)]" : "border-[var(--borda)]"}`}
          >
            <span className="block text-sm font-semibold text-[var(--marca)]">{o.nome}</span>
            {o.detalhe && <span className="mt-0.5 block text-xs text-neutral-600">{o.detalhe}</span>}
          </button>
        ))}
      </div>
      <div className="flex justify-end pt-1">
        <button type="button" className="btn" onClick={aoFechar}>
          Voltar sem mudar
        </button>
      </div>
    </Modal>
  );
}

/** `await escolher({...})` devolve o id da opção escolhida, ou null se a pessoa voltou. Ponha `janela` no JSX. */
export function useEscolha(): [React.ReactNode, (o: OpcoesEscolha) => Promise<string | null>] {
  const [opcoes, setOpcoes] = useState<OpcoesEscolha | null>(null);
  const resolver = useRef<((id: string | null) => void) | null>(null);
  const escolher = useCallback((o: OpcoesEscolha) => {
    resolver.current?.(null);
    setOpcoes(o);
    return new Promise<string | null>((r) => {
      resolver.current = r;
    });
  }, []);
  const responder = (id: string | null) => {
    resolver.current?.(id);
    resolver.current = null;
    setOpcoes(null);
  };
  const janela = opcoes ? <JanelaEscolha {...opcoes} aoEscolher={responder} aoFechar={() => responder(null)} /> : null;
  return [janela, escolher];
}
