// Guarda de módulo: bloqueia a tela de uma ferramenta que não foi liberada para a pessoa.
"use client";

import Link from "next/link";
import { useOrg } from "@/lib/org";
import { NAV } from "./navegacao";
import type { Modulo } from "./navegacao";

/** Bloqueia a tela de um módulo que não foi liberado para a pessoa. */
export function Guarda({ modulo, children }: { modulo: Modulo; children: React.ReactNode }) {
  const { pode, appsCarregados } = useOrg();
  if (modulo === "hub") return <>{children}</>;
  if (!appsCarregados) return <p className="p-10 text-center text-sm text-neutral-500">Carregando…</p>;
  if (!pode(modulo))
    return (
      <div className="mx-auto max-w-lg p-10 text-center">
        <h1 className="text-lg font-semibold text-[var(--marca)]">Ferramenta não liberada</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Você ainda não tem acesso a {NAV[modulo].titulo}. Peça ao administrador do Hub para liberar.
        </p>
        <Link href="/" className="btn-primario mt-5">
          Voltar ao início
        </Link>
      </div>
    );
  return <>{children}</>;
}
