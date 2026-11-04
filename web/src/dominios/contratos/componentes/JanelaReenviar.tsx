// "Reenviar" um e-mail ou WhatsApp da fatura (053): pede o motivo (fica no histórico do contrato e na Auditoria) e
// devolve o envio para a fila agora. Quem pode: quem opera Contratos (o banco confere em fin_envio_reenviar).
"use client";

import { useState } from "react";
import { traduzirErro } from "@/lib/erros";
import { Icone } from "@/components/ui/Icone";
import { Modal } from "@/components/ui/Modal";
import { CANAIS_ENVIO, fmtWhatsapp } from "../faturamento";
import { reenviarEnvio } from "../repositorio";
import type { EnvioDaFatura } from "../tipos";

export function JanelaReenviar({
  envio: e,
  numero,
  aoFechar,
  aoReenviar,
}: {
  envio: EnvioDaFatura;
  numero: string;
  aoFechar: () => void;
  aoReenviar: (msg: string) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const canal = CANAIS_ENVIO.find((c) => c.id === e.canal)?.nome ?? e.canal;
  const destino = e.canal === "whatsapp" ? fmtWhatsapp(e.destino) : e.destino;

  async function reenviar(ev: React.FormEvent) {
    ev.preventDefault();
    setErro("");
    if (motivo.replace(/[^\p{L}]/gu, "").length < 5) return setErro("Escreva o motivo (pelo menos 5 letras). Ele fica guardado no histórico do contrato.");
    setOcupado(true);
    try {
      const r = await reenviarEnvio(e.id, motivo.trim());
      aoReenviar(
        r.situacao === "pendente"
          ? `Fatura ${numero}: ${canal} de volta na fila. Sai na próxima rodada (até 10 minutos).`
          : `Fatura ${numero}: ${canal} de volta na fila, esperando a configuração do canal.`,
      );
    } catch (x) {
      setErro(traduzirErro(x));
      setOcupado(false);
    }
  }

  return (
    <Modal
      titulo={`Reenviar a fatura ${numero}`}
      descricao={`${canal} para ${destino}. Se o endereço estiver errado, corrija primeiro no contrato: o reenvio usa o mesmo destino.`}
      aoFechar={aoFechar}
      rodape={
        <>
          <button type="button" className="btn" onClick={aoFechar}>
            Voltar
          </button>
          <button type="submit" form="form-reenviar" className="btn-primario" disabled={ocupado}>
            <Icone nome="enviar" className="h-4 w-4" />
            {ocupado ? "Aguarde…" : "Reenviar"}
          </button>
        </>
      }
    >
      <form id="form-reenviar" onSubmit={reenviar} className="space-y-3">
        {e.ultimo_erro && (
          <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">
            <strong>Última falha:</strong> {e.ultimo_erro}
          </p>
        )}
        <label className="campo">
          <span>Motivo do reenvio</span>
          <textarea
            required
            rows={3}
            value={motivo}
            onChange={(x) => setMotivo(x.target.value)}
            placeholder="Ex.: cliente corrigiu o e-mail; cliente pediu de novo"
          />
        </label>
        {erro && <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{erro}</p>}
      </form>
    </Modal>
  );
}
