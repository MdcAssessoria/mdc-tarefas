// Aviso do Portal do Cliente quando a MDC bloqueou o acesso aos módulos pagos (licença). Aparece no lugar dos módulos
// pagos; as áreas do serviço contábil (demonstrativos, rotinas, chat, documentos) continuam abertas. Não mostra o
// motivo do bloqueio (é anotação interna da MDC).
"use client";

import { useCallback } from "react";
import { useConsulta } from "@/lib/useConsulta";
import { lerSituacaoPortal } from "../leituras";

export function AvisoBloqueioPortal({ cliente, telefone, aoFalar }: { cliente: string; telefone: string; aoFalar?: () => void }) {
  const { dados } = useConsulta(useCallback(() => lerSituacaoPortal(cliente), [cliente]));
  if (!dados?.bloqueado) return null;
  const modulos = dados.modulos.map((m) => m.nome).join(", ");
  return (
    <section role="status" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
      <h2 className="font-semibold">Alguns serviços do HUB estão pausados</h2>
      <p className="mt-1 text-sm">
        {modulos ? `O acesso a ${modulos} está suspenso no momento.` : "O acesso aos módulos contratados está suspenso no momento."} Seus
        dados continuam guardados com segurança e voltam a aparecer assim que tudo for regularizado.
      </p>
      <p className="mt-2 text-sm">
        Fale com a MDC pelo telefone {telefone}
        {aoFalar ? (
          <>
            {" "}
            ou{" "}
            <button className="font-medium underline" onClick={aoFalar}>
              pelo chat
            </button>
          </>
        ) : null}
        .
      </p>
    </section>
  );
}
