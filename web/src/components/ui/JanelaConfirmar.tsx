// Confirmação "sim ou não" sem motivo, numa janela acessível (Modal), no lugar de window.confirm (proibido pelo ESLint).
// Duas formas de usar:
//   1. <JanelaConfirmar titulo=… botao="Excluir" aoConfirmar={…} aoFechar={…} />, controlada pela tela;
//   2. const [janela, confirmar] = useConfirmar(); … if (await confirmar({ titulo, botao })) { … }  e {janela} no JSX.
// Quando a ação precisa de motivo guardado no histórico, use JanelaMotivo.
"use client";

import { useCallback, useRef, useState } from "react";
import { traduzirErro } from "@/lib/erros";
import { Modal } from "./Modal";

export interface OpcoesConfirmar {
  titulo: string;
  descricao?: React.ReactNode;
  /** Texto do botão de confirmar, dizendo a ação ("Excluir", "Enviar agora"). */
  botao: string;
  /** Texto do botão de desistir (padrão "Voltar"). */
  voltar?: string;
  /** Ação que apaga ou cancela algo: botão vermelho. */
  perigo?: boolean;
}

export function JanelaConfirmar({
  titulo,
  descricao,
  botao,
  voltar = "Voltar",
  perigo,
  aoConfirmar,
  aoFechar,
}: OpcoesConfirmar & {
  /** Pode ser assíncrona: a janela mostra "Aguarde…" e, se der erro, mostra a mensagem e continua aberta. */
  aoConfirmar: () => void | Promise<void>;
  aoFechar: () => void;
}) {
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  async function confirmar() {
    setOcupado(true);
    setErro("");
    try {
      await aoConfirmar();
    } catch (e) {
      setErro(traduzirErro(e));
      setOcupado(false);
    }
  }
  return (
    <Modal titulo={titulo} descricao={descricao} aoFechar={aoFechar} largura="sm">
      {erro && (
        <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-800">
          {erro}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <button className="btn" onClick={aoFechar} disabled={ocupado}>
          {voltar}
        </button>
        <button
          className={`btn-primario ${perigo ? "!bg-[var(--perigo)] !border-[var(--perigo)]" : ""}`}
          onClick={confirmar}
          disabled={ocupado}
        >
          {ocupado ? "Aguarde…" : botao}
        </button>
      </div>
    </Modal>
  );
}

/**
 * Troca direta de `window.confirm`: `await confirmar({...})` devolve true (confirmou) ou false (voltou).
 * Ponha o `janela` devolvido em qualquer lugar do JSX da tela.
 */
export function useConfirmar(): [React.ReactNode, (o: OpcoesConfirmar) => Promise<boolean>] {
  const [opcoes, setOpcoes] = useState<OpcoesConfirmar | null>(null);
  const resolver = useRef<((sim: boolean) => void) | null>(null);
  const confirmar = useCallback((o: OpcoesConfirmar) => {
    resolver.current?.(false);
    setOpcoes(o);
    return new Promise<boolean>((r) => {
      resolver.current = r;
    });
  }, []);
  const responder = (sim: boolean) => {
    resolver.current?.(sim);
    resolver.current = null;
    setOpcoes(null);
  };
  const janela = opcoes ? <JanelaConfirmar {...opcoes} aoConfirmar={() => responder(true)} aoFechar={() => responder(false)} /> : null;
  return [janela, confirmar];
}
