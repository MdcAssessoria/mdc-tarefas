// Moldura do HUB: menu lateral, gaveta no celular, barra superior, busca rápida (Ctrl/⌘ K) e a guarda do módulo.
// Montada uma vez só pelo layout do grupo de rotas app/(hub); o módulo ativo vem da rota (navegacao.ts).
"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CHAVES, useEstadoLembrado } from "@/lib/armazenamentoLocal";
import { BarraSuperior } from "./BarraSuperior";
import { BuscaRapida } from "./BuscaRapida";
import { Guarda } from "./Guarda";
import { MenuLateral } from "./MenuLateral";
import { moduloDaRota } from "./navegacao";

/** Estrutura do Hub: menu lateral (recolhível; gaveta no celular), barra superior com as abas do módulo, busca rápida e sino. */
export function Moldura({ children }: { children: React.ReactNode }) {
  const [menuRecolhido, setMenuRecolhido] = useEstadoLembrado<"0" | "1">(CHAVES.menuRecolhido, "0", (v) => v === "0" || v === "1");
  const recolhido = menuRecolhido === "1";
  const [gaveta, setGaveta] = useState(false);
  const [busca, setBusca] = useState(false);
  const rota = usePathname();
  const modulo = moduloDaRota(rota);

  useEffect(() => setGaveta(false), [rota]);
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setBusca((x) => !x);
      }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);

  const alternar = () => setMenuRecolhido(recolhido ? "0" : "1");

  return (
    <div className="min-h-screen lg:flex">
      {/* menu lateral fixo (desktop) */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col bg-[var(--marca)] text-[var(--nevoa)] transition-[width] duration-200 print:hidden lg:flex ${
          recolhido ? "w-[72px]" : "w-[248px]"
        }`}
      >
        <MenuLateral modulo={modulo} recolhido={recolhido} aoRecolher={alternar} />
      </aside>

      {/* gaveta (celular e tablet) */}
      {gaveta && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button className="absolute inset-0 bg-black/40" aria-label="Fechar menu" onClick={() => setGaveta(false)} />
          <aside className="surgir absolute inset-y-0 left-0 flex w-[280px] flex-col bg-[var(--marca)] text-[var(--nevoa)] shadow-2xl">
            <MenuLateral modulo={modulo} recolhido={false} />
          </aside>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <BarraSuperior modulo={modulo} aoMenu={() => setGaveta(true)} aoBuscar={() => setBusca(true)} />
        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
          <Guarda modulo={modulo}>{children}</Guarda>
        </main>
      </div>

      {busca && <BuscaRapida aoFechar={() => setBusca(false)} />}
    </div>
  );
}
