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
import { CHAVES, useEstadoLembrado } from "@/lib/armazenamentoLocal";
import { useState } from "react";
import { ehModuloGestao, filtrarLinks, linkAtivo, podeModulo } from "./navegacao";
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

/** Módulos da Gestão que abrem as telas deles embaixo, no próprio menu (05/11/2026). O PN também abre. */
const COM_SUBMENU = ["financeiro"];

/**
 * Cor do quadradinho de cada módulo (pedido do Edvaldo, 05/11/2026: reconhecer pelo desenho antes de ler o nome).
 * `tile` = normal (fundo translúcido e ícone colorido, sobre o verde do menu); `ativo` = módulo aberto (cheio).
 * Classes escritas por inteiro para o Tailwind gerar.
 */
const COR: Record<string, { tile: string; ativo: string }> = {
  padrao: { tile: "bg-white/[0.07] text-[var(--nevoa)]", ativo: "bg-[var(--destaque)] text-[var(--marca)]" },
  inicio: { tile: "bg-amber-400/15 text-amber-300", ativo: "bg-amber-300 text-[var(--marca)]" },
  tarefas: { tile: "bg-emerald-400/15 text-emerald-300", ativo: "bg-emerald-300 text-[var(--marca)]" },
  societario: { tile: "bg-sky-400/15 text-sky-300", ativo: "bg-sky-300 text-[var(--marca)]" },
  demonstrativos: { tile: "bg-violet-400/15 text-violet-300", ativo: "bg-violet-300 text-[var(--marca)]" },
  atendimento: { tile: "bg-teal-400/15 text-teal-300", ativo: "bg-teal-300 text-[var(--marca)]" },
  vencimentos: { tile: "bg-orange-400/15 text-orange-300", ativo: "bg-orange-300 text-[var(--marca)]" },
  comercial: { tile: "bg-rose-400/15 text-rose-300", ativo: "bg-rose-300 text-[var(--marca)]" },
  financeiro: { tile: "bg-lime-400/15 text-lime-300", ativo: "bg-lime-300 text-[var(--marca)]" },
  contratos: { tile: "bg-blue-400/15 text-blue-300", ativo: "bg-blue-300 text-[var(--marca)]" },
  relatorios: { tile: "bg-indigo-400/15 text-indigo-300", ativo: "bg-indigo-300 text-[var(--marca)]" },
  cadastros: { tile: "bg-cyan-400/15 text-cyan-300", ativo: "bg-cyan-300 text-[var(--marca)]" },
  centros_custo: { tile: "bg-yellow-400/15 text-yellow-300", ativo: "bg-yellow-300 text-[var(--marca)]" },
  plano_contas: { tile: "bg-stone-300/15 text-stone-200", ativo: "bg-stone-200 text-[var(--marca)]" },
  admin: { tile: "bg-white/[0.07] text-[var(--nevoa)]", ativo: "bg-[var(--destaque)] text-[var(--marca)]" },
};

/** Cadastros de apoio da Gestão: ficam no fim do grupo, depois de Fornecedores e clientes (060). */
const CADASTROS_DE_APOIO = ["centros_custo", "plano_contas"];

export function MenuLateral({ modulo, recolhido, aoRecolher }: { modulo: Modulo; recolhido: boolean; aoRecolher?: () => void }) {
  const { apps, eu, papel, org, orgs, trocarOrg, podeEditarCadastros, pode } = useOrg();
  const rota = usePathname();
  const ferramentas = apps.filter((a) => a.papel && a.status !== "em_breve");
  const escritorio = ferramentas.filter((a) => !ehModuloGestao(a.slug));
  const gestao = ferramentas.filter((a) => ehModuloGestao(a.slug));
  // Gestão em dois blocos (060): o dia a dia (Financeiro, Contratos, Relatórios) e, depois de Fornecedores e clientes,
  // os cadastros de apoio (Centros de custo, Plano de contas). A ordem dentro de cada bloco vem de hub_apps.ordem.
  const gestaoDiaADia = gestao.filter((a) => !CADASTROS_DE_APOIO.includes(a.slug));
  const gestaoApoio = gestao.filter((a) => CADASTROS_DE_APOIO.includes(a.slug));
  // Fornecedores e clientes só faz sentido com algum módulo de gestão em uso no menu (Cobrança Ledgra não usa)
  const temCadastros = gestao.some((a) => a.slug !== "licencas") && podeModulo("cadastros", pode);
  const naGestao = ehModuloGestao(modulo) || modulo === "cadastros";
  // grupo "Gestão": começa aberto; abrir/fechar fica lembrado no navegador (fechado, o título acende na tela dele)
  const [gestaoSalvo, setGestaoSalvo] = useEstadoLembrado<"1" | "0">(CHAVES.menuGestao, "1", (v) => v === "1" || v === "0");
  const abrirGestao = gestaoSalvo === "1";
  // submenus (Financeiro, PN): o do módulo aberto fica aberto; os outros, como a pessoa deixou nesta visita
  const [subs, setSubs] = useState<Record<string, boolean>>({});
  const subAberto = (m: Modulo) => subs[m] ?? modulo === m;
  const alternarSub = (m: string) => setSubs((x) => ({ ...x, [m]: !subAberto(m as Modulo) }));
  function alternarGestao() {
    setGestaoSalvo(abrirGestao ? "0" : "1");
  }

  const item = (o: {
    href: string;
    nome: string;
    icone: string;
    ativo: boolean;
    externo?: boolean;
    nivel?: PapelApp | null;
    cor?: string;
    /** Submenu aberto/fechado (Financeiro, PN): mostra a seta e o botão de abrir ao lado. */
    sub?: { aberto: boolean; alternar: () => void };
  }) => {
    const c = COR[o.cor ?? ""] ?? COR.padrao;
    const conteudo = (
      <>
        <span
          aria-hidden="true"
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors ${o.ativo ? c.ativo : c.tile}`}
        >
          <Icone nome={o.icone} className="h-[18px] w-[18px]" />
        </span>
        {!recolhido && <span className="truncate">{o.nome}</span>}
        {!recolhido && o.externo && <Icone nome="externo" className="ml-auto h-3.5 w-3.5 opacity-50" />}
      </>
    );
    const cls = `group relative flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-1.5 text-[14px] transition-colors ${
      o.ativo ? "bg-white/[0.09] font-medium text-white ring-1 ring-white/10" : "hover:bg-white/[0.05] hover:text-white"
    } ${recolhido ? "justify-center" : ""}`;
    const titulo = recolhido ? o.nome : o.nivel ? `${o.nome} · seu nível: ${PAPEIS_APP.find((p) => p.id === o.nivel)?.nome}` : undefined;
    const link = o.externo ? (
      <a key={o.href} href={o.href} target="_blank" rel="noopener" className={cls} title={titulo}>
        {conteudo}
      </a>
    ) : (
      <Link key={o.href} href={o.href} className={cls} title={titulo} aria-current={o.ativo ? "page" : undefined}>
        {conteudo}
      </Link>
    );
    if (!o.sub || recolhido) return link;
    return (
      <div key={o.href} className="flex items-center gap-1">
        {link}
        <button
          type="button"
          onClick={o.sub.alternar}
          aria-expanded={o.sub.aberto}
          aria-label={`${o.sub.aberto ? "Fechar" : "Abrir"} as telas de ${o.nome}`}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg hover:bg-white/[0.08] hover:text-white"
        >
          <Icone nome="chevron-baixo" className={`h-4 w-4 transition-transform ${o.sub.aberto ? "rotate-180" : ""}`} />
        </button>
      </div>
    );
  };

  /** Telas de um módulo, embaixo dele no menu (Financeiro, PN): ícone em quadradinho, a aberta em destaque. */
  const subitens = (m: Modulo, cor: string) => {
    const links = filtrarLinks(m, { pode, podeEditarCadastros });
    const c = COR[cor] ?? COR.padrao;
    let grupoAnterior: string | undefined;
    return (
      <div className="mb-1 ml-5 space-y-0.5 border-l border-white/10 pl-2">
        {links.map((l) => {
          const ativo = linkAtivo(rota, l.href, m);
          const titulo = l.grupo && l.grupo !== grupoAnterior ? l.grupo : null;
          grupoAnterior = l.grupo;
          return (
            <div key={l.href}>
              {titulo && <div className="px-2 pb-0.5 pt-1.5 text-[11px] uppercase tracking-wide text-[var(--nevoa)]/60">{titulo}</div>}
              <Link
                href={l.href}
                aria-current={ativo ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-lg px-2 py-1 text-[13px] transition-colors ${
                  ativo ? "bg-white/[0.09] font-medium text-white" : "hover:bg-white/[0.05] hover:text-white"
                }`}
              >
                <span aria-hidden="true" className={`grid h-6 w-6 shrink-0 place-items-center rounded-md ${ativo ? c.ativo : c.tile}`}>
                  <Icone nome={l.icone ?? "chevron-direita"} className="h-[14px] w-[14px]" />
                </span>
                <span className="truncate">{l.nome}</span>
              </Link>
            </div>
          );
        })}
      </div>
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
        {item({ href: "/", nome: "Início", icone: "casa", ativo: modulo === "hub" && rota === "/", cor: "inicio" })}
        {!recolhido && <div className="px-3 pb-1.5 pt-5 text-[12px] text-[var(--nevoa)]/80">Suas ferramentas</div>}
        {recolhido && <div className="mx-3 my-3 h-px bg-white/10" />}
        {escritorio.map((a) =>
          item({
            href: a.rota,
            // TODO: o nome deveria vir só de hub_apps.nome; mantido fixo para não mudar o menu atual
            nome: a.slug === "comercial" ? "CRM Comercial" : a.nome,
            icone: a.icone,
            ativo: modulo === a.slug,
            externo: a.externo,
            nivel: a.papel,
            cor: a.slug,
          }),
        )}
        {(gestao.length > 0 || temCadastros) && (
          <div className="pt-1">
            {recolhido ? (
              <div className="mx-3 my-3 h-px bg-white/10" />
            ) : (
              <button
                type="button"
                onClick={alternarGestao}
                aria-expanded={abrirGestao}
                className={`flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-[14px] font-medium transition-colors hover:bg-white/[0.05] hover:text-white ${
                  naGestao && !abrirGestao ? "text-white" : ""
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${naGestao ? "bg-[var(--destaque)]/20 text-[var(--destaque)]" : "bg-white/[0.07]"}`}
                >
                  <Icone nome="carteira" className="h-[18px] w-[18px]" />
                </span>
                <span className="truncate">Gestão</span>
                <Icone nome={abrirGestao ? "recolher" : "expandir"} className="ml-auto h-3.5 w-3.5 rotate-90 opacity-60" />
              </button>
            )}
            {(abrirGestao || recolhido) && (
              <div className={recolhido ? "space-y-0.5" : "ml-4 space-y-0.5 border-l border-white/10 pl-2 pt-0.5"}>
                {gestaoDiaADia.map((a) => (
                  <div key={a.slug}>
                    {item({
                      href: a.rota,
                      nome: a.nome,
                      icone: a.icone,
                      ativo: modulo === a.slug,
                      externo: a.externo,
                      nivel: a.papel,
                      cor: a.slug,
                      sub: COM_SUBMENU.includes(a.slug)
                        ? { aberto: subAberto(a.slug as Modulo), alternar: () => alternarSub(a.slug) }
                        : undefined,
                    })}
                    {!recolhido && COM_SUBMENU.includes(a.slug) && subAberto(a.slug as Modulo) && subitens(a.slug as Modulo, a.slug)}
                  </div>
                ))}
                {/* PN - Parceiros de negócio: Clientes e Fornecedores (cadastro comum a todos os módulos de gestão) */}
                {temCadastros && (
                  <div>
                    {item({
                      href: "/cadastros/clientes",
                      nome: "PN - Parceiros de negócio",
                      icone: "pessoas",
                      ativo: modulo === "cadastros",
                      cor: "cadastros",
                      sub: { aberto: subAberto("cadastros"), alternar: () => alternarSub("cadastros") },
                    })}
                    {!recolhido && subAberto("cadastros") && subitens("cadastros", "cadastros")}
                  </div>
                )}
                {gestaoApoio.map((a) =>
                  item({
                    href: a.rota,
                    nome: a.nome,
                    icone: a.icone,
                    ativo: modulo === a.slug,
                    externo: a.externo,
                    nivel: a.papel,
                    cor: a.slug,
                  }),
                )}
              </div>
            )}
          </div>
        )}
        {(papel === "admin" || podeEditarCadastros) && (
          <>
            {!recolhido && <div className="px-3 pb-1.5 pt-5 text-[12px] text-[var(--nevoa)]/80">Administração</div>}
            {recolhido && <div className="mx-3 my-3 h-px bg-white/10" />}
            {papel === "admin" &&
              item({
                href: "/hub/acessos",
                nome: "Pessoas e acessos",
                icone: "pessoas",
                ativo: rota.startsWith("/hub/acessos"),
                cor: "admin",
              })}
            {podeEditarCadastros &&
              item({ href: "/config", nome: "Configurações", icone: "engrenagem", ativo: rota.startsWith("/config"), cor: "admin" })}
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
              <div className="truncate text-[12px] text-[var(--nevoa)]/80">{PAPEIS.find((p) => p.id === papel)?.nome}</div>
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
            className={`mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] text-[var(--nevoa)]/80 hover:bg-white/[0.05] hover:text-white ${recolhido ? "justify-center" : ""}`}
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
