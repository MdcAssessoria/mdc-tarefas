// Confirmação que exige motivo (cancelar, estornar, excluir com histórico). O motivo vai para o banco junto da ação.
// Para "sim ou não" sem motivo use JanelaConfirmar. Nunca use window.confirm/prompt (regra do ESLint).
"use client";

import { useState } from "react";
import { traduzirErro } from "@/lib/erros";
import { Modal } from "./Modal";

export function JanelaMotivo({
  titulo,
  descricao,
  botao,
  aoConfirmar,
  aoFechar,
}: {
  titulo: string;
  descricao: React.ReactNode;
  botao: string;
  aoConfirmar: (motivo: string) => Promise<void>;
  aoFechar: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  async function confirmar() {
    if (!motivo.trim()) return setErro("Escreva o motivo. Ele fica guardado no histórico.");
    setOcupado(true);
    try {
      await aoConfirmar(motivo.trim());
    } catch (e) {
      setErro(traduzirErro(e));
      setOcupado(false);
    }
  }
  return (
    <Modal titulo={titulo} descricao={descricao} aoFechar={aoFechar}>
      <label className="campo">
        <span>Motivo</span>
        <textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: lançado em duplicidade" />
      </label>
      {erro && <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{erro}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <button className="btn" onClick={aoFechar}>
          Voltar
        </button>
        <button className="btn-primario !bg-[var(--perigo)] !border-[var(--perigo)]" onClick={confirmar} disabled={ocupado}>
          {ocupado ? "Aguarde…" : botao}
        </button>
      </div>
    </Modal>
  );
}
