// Barra superior do HUB: botão do menu no celular, abas do módulo ativo, botão de busca rápida e sino de notificações.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useOrg } from "@/lib/org";
import { Icone } from "@/components/Icone";
import { NAV, filtrarLinks } from "./navegacao";
import type { Modulo } from "./navegacao";
import { Sino } from "./Sino";

export function BarraSuperior({ modulo, aoMenu, aoBuscar }: { modulo: Modulo; aoMenu: () => void; aoBuscar: () => void }) {
  const rota = usePathname();
  const { pode, podeEditarCadastros } = useOrg();
  const links = filtrarLinks(modulo, { pode, podeEditarCadastros });
  const ativo = (href: string) => rota === href || (href !== `/${modulo}` && rota.startsWith(href + "/"));
  const mac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--borda)] bg-white/85 backdrop-blur print:hidden">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button
          className="grid h-9 w-9 place-items-center rounded-lg text-[var(--marca)] hover:bg-[var(--fundo)] lg:hidden"
          onClick={aoMenu}
          aria-label="Abrir menu"
        >
          <Icone nome="menu" />
        </button>
        <span className="font-semibold text-[var(--marca)] lg:hidden">{NAV[modulo].titulo}</span>
        {links.length > 1 && (
          <nav className="-mb-px hidden h-14 items-stretch gap-1 md:flex" aria-label={NAV[modulo].titulo}>
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={ativo(l.href) ? "page" : undefined}
                className={`flex items-center border-b-2 px-3 text-[14px] ${
                  ativo(l.href)
                    ? "border-[var(--destaque-escuro)] font-medium text-[var(--marca)]"
                    : "border-transparent text-[var(--texto-suave)] hover:text-[var(--marca)]"
                }`}
              >
                {l.nome}
              </Link>
            ))}
          </nav>
        )}
        {links.length === 1 && <span className="hidden font-semibold text-[var(--marca)] lg:inline">{NAV[modulo].titulo}</span>}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={aoBuscar}
            className="flex h-9 items-center gap-2 rounded-lg border border-[var(--borda)] bg-white px-3 text-[13px] text-[var(--texto-suave)] hover:border-[var(--destaque-escuro)] sm:w-64"
            aria-label="Buscar ou ir para"
          >
            <Icone nome="busca" className="h-4 w-4" />
            <span className="hidden sm:inline">Buscar ou ir para…</span>
            <kbd className="ml-auto hidden rounded border border-[var(--borda)] px-1.5 text-[11px] sm:inline">{mac ? "⌘" : "Ctrl"} K</kbd>
          </button>
          <Sino />
        </div>
      </div>
      {links.length > 1 && (
        <nav className="flex gap-1 overflow-x-auto border-t border-[var(--borda)] px-3 md:hidden" aria-label={NAV[modulo].titulo}>
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-[13px] ${ativo(l.href) ? "border-[var(--destaque-escuro)] font-medium text-[var(--marca)]" : "border-transparent text-[var(--texto-suave)]"}`}
            >
              {l.nome}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
