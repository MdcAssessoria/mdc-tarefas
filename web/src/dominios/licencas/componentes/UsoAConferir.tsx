// Uso de licença acima do teto (migração 103, SEG-06): o sistema informou mais usuários do que vale para a cobrança.
// Mostra o aviso na linha da licença e, para quem gere valores, a janela para aceitar o número ou manter o que estava.
"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Icone } from "@/components/ui/Icone";
import { traduzirErro } from "@/lib/erros";
import { conferirUso } from "../leituras";
import type { Uso } from "../tipos";

export function UsoAConferir({ uso, podeGerir, aoConferir }: { uso: Uso; podeGerir: boolean; aoConferir: () => void }) {
  const [aberta, setAberta] = useState(false);
  return (
    <span className="block text-xs text-amber-800">
      {uso.usuarios_informados} informados · a conferir
      {podeGerir && (
        <button className="btn !min-h-8 !px-3 mt-1" onClick={() => setAberta(true)}>
          <Icone nome="alerta" className="h-4 w-4" /> Conferir
        </button>
      )}
      {aberta && (
        <JanelaConferir
          uso={uso}
          aoFechar={() => setAberta(false)}
          aoConferir={() => {
            setAberta(false);
            aoConferir();
          }}
        />
      )}
    </span>
  );
}

function JanelaConferir({ uso, aoFechar, aoConferir }: { uso: Uso; aoFechar: () => void; aoConferir: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  async function decidir(aceitar: boolean) {
    if (motivo.trim().length < 5) return setErro("Escreva o motivo (pelo menos 5 letras). Ele fica no histórico.");
    setOcupado(true);
    setErro("");
    try {
      await conferirUso(uso.contrato_id, uso.competencia, aceitar, motivo.trim());
      aoConferir();
    } catch (e) {
      setErro(traduzirErro(e));
      setOcupado(false);
    }
  }
  return (
    <Modal
      titulo="Conferir usuários informados"
      descricao={`O sistema informou ${uso.usuarios_informados} usuários neste mês. Até você conferir, a cobrança usa ${uso.usuarios}.`}
      aoFechar={aoFechar}
      rodape={
        <>
          <button className="btn-primario" onClick={() => decidir(true)} disabled={ocupado}>
            <Icone nome="check" className="h-4 w-4" /> {ocupado ? "Aguarde…" : `Aceitar ${uso.usuarios_informados}`}
          </button>
          <button className="btn" onClick={() => decidir(false)} disabled={ocupado}>
            <Icone nome="escudo" className="h-4 w-4" /> Manter {uso.usuarios}
          </button>
          <button className="btn" onClick={aoFechar}>
            <Icone nome="voltar" className="h-4 w-4" /> Voltar
          </button>
        </>
      }
    >
      <p className="text-sm text-neutral-700">
        Aceite se o cliente de fato tem esse número de pessoas com acesso. Mantenha se o número parece errado (chave usada por outra pessoa,
        teste ou falha do sistema).
      </p>
      <label className="campo">
        <span>Motivo</span>
        <textarea
          rows={3}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ex.: conferido com o cliente por telefone"
        />
      </label>
      {erro && <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{erro}</p>}
    </Modal>
  );
}
