// Quadrinho "Regra fiscal deste serviço" que aparece no contrato e no item de serviço depois de escolher o tipo da LC 116:
// mostra NBS, ISS e retenção da regra (Contratos › Regras fiscais) ou avisa que ainda não há regra para o código.
"use client";

import Link from "next/link";
import { Icone } from "@/components/ui/Icone";
import { regraDoCodigo, resumoRegra } from "../regrasFiscais";
import type { RegraServico } from "../tipos";

export function ResumoRegra({ codigo, regras }: { codigo: string; regras: RegraServico[] | null }) {
  if (!regras) return null;
  const r = regraDoCodigo(regras, codigo);
  if (!r)
    return (
      <p className="flex items-start gap-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
        <Icone nome="alerta" className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Ainda não há regra fiscal para este serviço (NBS, ISS e retenção). Quem gere Contratos cadastra em{" "}
          <Link href="/contratos/nota-fiscal" className="underline">
            Contratos › Regras fiscais
          </Link>
          ; até lá a nota usa o NBS padrão.
        </span>
      </p>
    );
  return (
    <p className="flex items-start gap-2 rounded-md bg-[var(--fundo)] p-2 text-xs text-[var(--texto-suave)]">
      <Icone nome="check" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--marca)]" />
      <span>
        Regra fiscal <b className="text-[var(--marca)]">{r.nome}</b>: {resumoRegra(r)}.
        {r.iss_retencao !== "nao" && " Com ISS retido, a nota é emitida pelo Emissor Nacional (o HUB avisa na fatura)."}
      </span>
    </p>
  );
}
