"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { OrgProvider, useOrg } from "@/lib/org";
import { supabase } from "@/lib/supabase";
import { PAPEIS } from "@/lib/types";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <OrgProvider>
      <Cabecalho />
      <main className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6">{children}</main>
    </OrgProvider>
  );
}

function Cabecalho() {
  const { org, orgs, trocarOrg, eu, papel, podeEditarCadastros } = useOrg();
  const rota = usePathname();
  const links = [
    { href: "/tarefas", nome: "Tarefas" },
    { href: "/tv", nome: "Painel TV" },
    ...(podeEditarCadastros ? [{ href: "/config", nome: "Configurações" }] : []),
  ];
  return (
    <header className="bg-[var(--marca)] text-[#C6D3CC]">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/tarefas" className="flex items-center gap-2">
          {org.logo_url ? (
            <img
              src={org.logo_url}
              alt=""
              className="h-8 max-w-[110px] object-contain"
              onError={(e) => {
                e.currentTarget.src = "/icone.svg";
                e.currentTarget.className = "h-8 w-8";
              }}
            />
          ) : (
            <img src="/icone.svg" alt="" className="h-8 w-8" />
          )}
          <span className="font-semibold text-[var(--destaque)]">Tarefas</span>
        </Link>
        <nav className="flex gap-1 text-sm">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-md px-3 py-1.5 ${
                rota.startsWith(l.href) ? "bg-white/10 text-white" : "hover:text-white"
              }`}
            >
              {l.nome}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          {orgs.length > 1 ? (
            <select
              value={org.id}
              onChange={(e) => trocarOrg(e.target.value)}
              className="rounded-md bg-white/10 px-2 py-1 text-white"
              aria-label="Organização"
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.id} className="text-black">
                  {o.nome}
                </option>
              ))}
            </select>
          ) : (
            <span className="hidden sm:inline text-white">{org.nome}</span>
          )}
          <span className="hidden md:inline" title={PAPEIS.find((p) => p.id === papel)?.nome}>
            {eu.nome}
          </span>
          <button
            className="rounded-md border border-white/20 px-2.5 py-1 hover:text-white"
            onClick={async () => {
              await supabase().auth.signOut();
              window.location.replace("/login");
            }}
          >
            Sair
          </button>
        </div>
      </div>
    </header>
  );
}
