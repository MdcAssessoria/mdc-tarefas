// Guarda das telas da equipe: bloqueia, com uma mensagem só, a tela que a pessoa não pode abrir. Confere o módulo
// (ferramenta liberada) e o nível que a aba da rota exige (`minimo`/`gestor` do NAV e TELAS_RESTRITAS, navegacao.ts).
// As páginas não repetem essa checagem. O banco confere de novo em tudo que grava ou lê (cap. 5).
"use client";

import Link from "next/link";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { NAV, podeAbrirRota } from "./navegacao";
import type { Modulo } from "./navegacao";

export function Guarda({ modulo, rota, children }: { modulo: Modulo; rota: string; children: React.ReactNode }) {
  const { pode, appsCarregados, podeEditarCadastros, papel } = useOrg();
  if (modulo === "hub") return <>{children}</>;
  if (!appsCarregados) return <p className="p-10 text-center text-sm text-neutral-500">Carregando…</p>;
  if (!podeAbrirRota(rota, modulo, { pode, podeEditarCadastros, admin: papel === "admin" })) return <TelaNaoLiberada nome={NAV[modulo].titulo} />;
  return <>{children}</>;
}

/** Mensagem padrão de tela bloqueada (a mesma para módulo não liberado e para nível insuficiente). */
export function TelaNaoLiberada({ nome }: { nome: string }) {
  return (
    <div className="mx-auto max-w-lg p-10 text-center">
      <h1 className="text-lg font-semibold text-[var(--marca)]">Esta tela não está liberada para você</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Seu acesso em {nome} não inclui esta tela. Peça ao administrador do Hub para liberar em Pessoas e acessos.
      </p>
      <Link href="/" className="btn-primario mt-5">
        Voltar ao início
      </Link>
    </div>
  );
}
