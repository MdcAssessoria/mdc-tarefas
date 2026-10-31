// Menu lateral do HUB: logo, ferramentas liberadas, administração, troca de organização, pessoa logada e sair.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { supabase } from "@/lib/supabase";
import { PAPEIS } from "@/dominios/organizacao/tipos";
import { PAPEIS_APP } from "@/dominios/acessos/tipos";
import type { PapelApp } from "@/dominios/acessos/tipos";
import { caminho } from "@/lib/caminho";
import { Icone } from "@/components/ui/Icone";
import type { Modulo } from "./navegacao";

function Iniciais({ nome, className = "" }: { nome: string; className?: string }) {
  const ini = nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full bg-[var(--destaque)] font-semibold text-[var(--marca)] ${className}`}
      aria-hidden="true"
    >
      {ini}
    </span>
  );
}

export function MenuLateral({ modulo, recolhido, aoRecolher }: { modulo: Modulo; recolhido: boolean; aoRecolher?: () => void }) {
  const { apps, eu, papel, org, orgs, trocarOrg, podeEditarCadastros } = useOrg();
  const rota = usePathname();
  const ferramentas = apps.filter((a) => a.papel && a.status !== "em_breve");

  const item = (o: { href: string; nome: string; icone: string; ativo: boolean; externo?: boolean; nivel?: PapelApp | null }) => {
    const conteudo = (
      <>
        <span
          className={`absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--destaque)] transition-opacity ${o.ativo ? "opacity-100" : "opacity-0"}`}
          aria-hidden="true"
        />
        <Icone nome={o.icone} className={`h-[19px] w-[19px] shrink-0 ${o.ativo ? "text-[var(--destaque)]" : ""}`} />
        {!recolhido && <span className="truncate">{o.nome}</span>}
        {!recolhido && o.externo && <Icone nome="externo" className="ml-auto h-3.5 w-3.5 opacity-50" />}
      </>
    );
    const cls = `group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] transition-colors ${
      o.ativo ? "bg-white/[0.07] font-medium text-white" : "hover:bg-white/[0.05] hover:text-white"
    } ${recolhido ? "justify-center" : ""}`;
    const titulo = recolhido ? o.nome : o.nivel ? `${o.nome} · seu nível: ${PAPEIS_APP.find((p) => p.id === o.nivel)?.nome}` : undefined;
    return o.externo ? (
      <a key={o.href} href={o.href} target="_blank" rel="noopener" className={cls} title={titulo}>
        {conteudo}
      </a>
    ) : (
      <Link key={o.href} href={o.href} className={cls} title={titulo} aria-current={o.ativo ? "page" : undefined}>
        {conteudo}
      </Link>
    );
  };

  return (
    <>
      <div className={`flex items-center gap-2 px-4 pb-4 pt-5 ${recolhido ? "justify-center px-2" : ""}`}>
        <Link href="/" className="flex items-center gap-2.5" title="Início do HUB-MDC">
          <img src={caminho("/logo-mdc-dourado.png")} alt="MDC Assessoria" className={recolhido ? "h-7 w-auto" : "h-9 w-auto"} />
          {!recolhido && <span className="text-[13px] font-medium tracking-wide text-[var(--nevoa)]/80">HUB</span>}
        </Link>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3" aria-label="Ferramentas">
        {item({ href: "/", nome: "Início", icone: "casa", ativo: modulo === "hub" && rota === "/" })}
        {!recolhido && <div className="px-3 pb-1.5 pt-5 text-[12px] text-[var(--nevoa)]/55">Suas ferramentas</div>}
        {recolhido && <div className="mx-3 my-3 h-px bg-white/10" />}
        {ferramentas.map((a) =>
          item({
            href: a.rota,
            // TODO: o nome deveria vir só de hub_apps.nome; mantido fixo para não mudar o menu atual
            nome: a.slug === "comercial" ? "CRM Comercial" : a.nome,
            icone: a.icone,
            ativo: modulo === a.slug,
            externo: a.externo,
            nivel: a.papel,
          }),
        )}
        {(papel === "admin" || podeEditarCadastros) && (
          <>
            {!recolhido && <div className="px-3 pb-1.5 pt-5 text-[12px] text-[var(--nevoa)]/55">Administração</div>}
            {recolhido && <div className="mx-3 my-3 h-px bg-white/10" />}
            {papel === "admin" &&
              item({ href: "/hub/acessos", nome: "Pessoas e acessos", icone: "pessoas", ativo: rota.startsWith("/hub/acessos") })}
            {podeEditarCadastros &&
              item({ href: "/config", nome: "Configurações", icone: "engrenagem", ativo: rota.startsWith("/config") })}
          </>
        )}
      </nav>

      <div className="border-t border-white/10 p-3">
        {!recolhido && orgs.length > 1 && (
          <select
            value={org.id}
            onChange={(e) => trocarOrg(e.target.value)}
            className="mb-2 w-full rounded-lg bg-white/[0.07] px-2 py-1.5 text-sm text-white"
            aria-label="Organização"
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.id} className="text-black">
                {o.nome}
              </option>
            ))}
          </select>
        )}
        <div className={`flex items-center gap-2.5 ${recolhido ? "flex-col" : ""}`}>
          <Iniciais nome={eu.nome} className="h-8 w-8 text-[12px]" />
          {!recolhido && (
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[13px] font-medium text-white">{eu.nome}</div>
              <div className="truncate text-[12px] text-[var(--nevoa)]/60">{PAPEIS.find((p) => p.id === papel)?.nome}</div>
            </div>
          )}
          <button
            className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/10 hover:text-white"
            title="Sair"
            aria-label="Sair"
            onClick={async () => {
              await supabase().auth.signOut();
              window.location.replace(caminho("/login"));
            }}
          >
            <Icone nome="sair" className="h-[18px] w-[18px]" />
          </button>
        </div>
        {aoRecolher && (
          <button
            onClick={aoRecolher}
            className={`mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] text-[var(--nevoa)]/60 hover:bg-white/[0.05] hover:text-white ${recolhido ? "justify-center" : ""}`}
            aria-label={recolhido ? "Expandir menu" : "Recolher menu"}
            title={recolhido ? "Expandir menu" : "Recolher menu"}
          >
            <Icone nome={recolhido ? "expandir" : "recolher"} className="h-4 w-4" />
            {!recolhido && "Recolher menu"}
          </button>
        )}
      </div>
    </>
  );
}
