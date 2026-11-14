// Menu lateral do MDC · Pessoal (075): marca própria, só Início, Tarefas, Finanças (com as telas embaixo) e Família.
// A moldura troca o menu do HUB por este quando a organização da aba é uma família (org.tipo = "pessoal").
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { supabase } from "@/lib/supabase";
import { caminho } from "@/lib/caminho";
import { Icone } from "@/components/ui/Icone";
import type { NomeIcone } from "@/components/ui/Icone";
import { rotaNoPessoal } from "@/dominios/pessoal/entrada";
import { BotaoInstalarApp } from "./InstalarApp";
import { filtrarLinks, linkAtivo } from "./navegacao";
import type { Modulo } from "./navegacao";

export function MenuPessoal({ modulo, recolhido, aoRecolher }: { modulo: Modulo; recolhido: boolean; aoRecolher?: () => void }) {
  const { org, orgs, eu, papel, pode, podeEditarCadastros, trocarOrg } = useOrg();
  const rota = usePathname();
  const familias = orgs.filter((o) => o.tipo === "pessoal");
  const temHub = orgs.some((o) => o.tipo !== "pessoal");
  const telasFinancas = filtrarLinks("financeiro", { pode, podeEditarCadastros }).filter((l) => rotaNoPessoal(l.href));

  const item = (href: string, nome: string, icone: NomeIcone, ativo: boolean) => (
    <Link
      key={href}
      href={href}
      title={recolhido ? nome : undefined}
      aria-current={ativo ? "page" : undefined}
      className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] transition-colors ${
        ativo ? "bg-white/[0.08] font-medium text-white" : "hover:bg-white/[0.05] hover:text-white"
      } ${recolhido ? "justify-center" : ""}`}
    >
      <span
        className={`absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--destaque)] ${ativo ? "opacity-100" : "opacity-0"}`}
        aria-hidden="true"
      />
      <Icone nome={icone} className={`h-5 w-5 shrink-0 ${ativo ? "text-[var(--destaque)]" : ""}`} />
      {!recolhido && <span className="truncate">{nome}</span>}
    </Link>
  );

  return (
    <>
      <div className={`px-4 pb-4 pt-5 ${recolhido ? "px-2 text-center" : ""}`}>
        <Link href="/" className="flex items-center gap-2.5" title="Início do MDC · Pessoal">
          <img src={caminho("/logo-mdc-dourado.png")} alt="MDC" className={recolhido ? "mx-auto h-7 w-auto" : "h-9 w-auto"} />
          {!recolhido && <span className="font-display text-xl text-white">Pessoal</span>}
        </Link>
        {!recolhido && <div className="mt-3 truncate text-[13px] text-[var(--nevoa)]/80">{org.nome}</div>}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3" aria-label="MDC · Pessoal">
        {item("/", "Início", "casa", modulo === "hub" && rota === "/")}
        {pode("tarefas") && item("/tarefas", "Tarefas", "check", modulo === "tarefas")}
        {pode("financeiro") && (
          <div>
            {item("/financeiro", "Finanças", "carteira", modulo === "financeiro" && rota === "/financeiro")}
            {!recolhido && (
              <div className="mb-1 ml-5 space-y-0.5 border-l border-white/10 pl-2">
                {telasFinancas
                  .filter((l) => l.href !== "/financeiro")
                  .map((l) => {
                    const ativo = linkAtivo(rota, l.href, "financeiro");
                    return (
                      <Link
                        key={l.href}
                        href={l.href}
                        aria-current={ativo ? "page" : undefined}
                        className={`flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13.5px] transition-colors ${
                          ativo ? "bg-white/[0.07] font-medium text-white" : "hover:bg-white/[0.05] hover:text-white"
                        }`}
                      >
                        {l.icone && (
                          <Icone nome={l.icone} className={`h-4 w-4 shrink-0 ${ativo ? "text-[var(--destaque)]" : "opacity-70"}`} />
                        )}
                        <span className="truncate">{l.nome}</span>
                      </Link>
                    );
                  })}
              </div>
            )}
          </div>
        )}
        {item("/familia", "Família", "pessoas", modulo === "familia")}
      </nav>

      <div className="border-t border-white/10 p-3">
        <BotaoInstalarApp variante="menu" recolhido={recolhido} />
        {!recolhido && familias.length > 1 && (
          <select
            value={org.id}
            onChange={(e) => trocarOrg(e.target.value)}
            className="mb-2 w-full rounded-lg bg-white/[0.07] px-2 py-1.5 text-sm text-white"
            aria-label="Família"
          >
            {familias.map((o) => (
              <option key={o.id} value={o.id} className="text-black">
                {o.nome}
              </option>
            ))}
          </select>
        )}
        {temHub && !recolhido && (
          <a
            href={caminho("/")}
            target="_blank"
            rel="noopener"
            className="mb-2 flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-[var(--nevoa)]/90 hover:bg-white/[0.05] hover:text-white"
          >
            <Icone nome="externo" className="h-4 w-4" />
            Abrir o HUB da MDC
          </a>
        )}
        <div className={`flex items-center gap-2.5 ${recolhido ? "flex-col" : ""}`}>
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--destaque)] text-[12px] font-semibold text-[var(--marca)]"
            aria-hidden="true"
          >
            {eu.nome
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((p) => p[0])
              .join("")
              .toUpperCase()}
          </span>
          {!recolhido && (
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[13px] font-medium text-white">{eu.nome}</div>
              <div className="truncate text-[12px] text-[var(--nevoa)]/80">
                {papel === "admin" ? "Responsável pela família" : "Membro da família"}
              </div>
            </div>
          )}
          <button
            className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/10 hover:text-white"
            title="Sair"
            aria-label="Sair"
            onClick={async () => {
              await supabase().auth.signOut();
              window.location.replace(caminho("/pessoal"));
            }}
          >
            <Icone nome="sair" className="h-[18px] w-[18px]" />
          </button>
        </div>
        {aoRecolher && (
          <button
            onClick={aoRecolher}
            className={`mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] text-[var(--nevoa)]/80 hover:bg-white/[0.05] hover:text-white ${recolhido ? "justify-center" : ""}`}
            aria-label={recolhido ? "Expandir menu" : "Recolher menu"}
          >
            <Icone nome={recolhido ? "expandir" : "recolher"} className="h-4 w-4" />
            {!recolhido && "Recolher menu"}
          </button>
        )}
      </div>
    </>
  );
}
