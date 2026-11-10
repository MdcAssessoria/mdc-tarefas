// Aviso do Portal do Cliente quando a MDC bloqueou o acesso aos módulos pagos (licença). Aparece no lugar dos módulos
// pagos; as áreas do serviço contábil (demonstrativos, rotinas, chat, documentos) continuam abertas. Não mostra o
// motivo do bloqueio (é anotação interna da MDC). Desde 03/11/2026 o cliente não tem mais Financeiro, Entradas etc.
// no Portal (a gestão do HUB é só da MDC): esses módulos não entram no aviso, e o texto fala do Portal, não do "HUB"
// (UX-02 da reauditoria).
"use client";

import { useCallback } from "react";
import { useConsulta } from "@/lib/useConsulta";
import { lerSituacaoPortal } from "../leituras";

/** Módulos da gestão (mesma lista de MODULOS_GESTAO em components/shell/navegacao.ts): não existem mais no Portal. */
const SO_DA_MDC = new Set([
  "financeiro",
  "entradas",
  "saidas",
  "estoque",
  "centros_custo",
  "plano_contas",
  "relatorios",
  "contratos",
  "licencas",
]);
const ehModuloGestao = (slug: string) => SO_DA_MDC.has(slug);

export function AvisoBloqueioPortal({ cliente, telefone, aoFalar }: { cliente: string; telefone: string; aoFalar?: () => void }) {
  const { dados } = useConsulta(useCallback(() => lerSituacaoPortal(cliente), [cliente]));
  if (!dados?.bloqueado) return null;
  const doPortal = dados.modulos.filter((m) => !ehModuloGestao(m.slug));
  if (dados.modulos.length > 0 && doPortal.length === 0) return null;
  const modulos = doPortal.map((m) => m.nome).join(", ");
  return (
    <section role="status" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
      <h2 className="font-semibold">Parte do seu Portal está pausada</h2>
      <p className="mt-1 text-sm">
        {modulos ? `O acesso a ${modulos} está pausado no momento.` : "Parte do Portal está pausada no momento."} Seus dados continuam
        guardados com segurança e voltam a aparecer assim que tudo for regularizado.
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
