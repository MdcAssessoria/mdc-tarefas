// Barra superior do HUB: botão do menu no celular, abas do módulo ativo, botão de busca rápida e sino de notificações.
// Cada aba tem ícone (navegacao.ts, `icone`), também no menu do grupo e no celular. Módulo com abas agrupadas (navegacao.ts, campo `grupo`) mostra cada grupo como um menu suspenso no computador e,
// no celular, um botão com a página atual que abre a lista completa por grupos (não estoura com muitas telas). Sem
// grupos, até 3 telas aparecem lado a lado no celular; com mais, entra o mesmo botão "Telas" (nada fica escondido).
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { Icone } from "@/components/ui/Icone";
import { NAV, agruparLinks, filtrarLinks, linkAtivo, temGrupos } from "./navegacao";
import { rotaNoPessoal } from "@/dominios/pessoal/entrada";
import type { LinkModulo, Modulo } from "./navegacao";
import { Sino } from "./Sino";

/** Fecha ao clicar fora e ao apertar Esc (ao escolher uma tela, o clique no link fecha). */
function useFecharFora(aberto: boolean, fechar: () => void) {
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const clique = (e: MouseEvent) => !caixa.current?.contains(e.target as Node) && fechar();
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    document.addEventListener("mousedown", clique);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", clique);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto, fechar]);
  return caixa;
}

/** Ícone da aba (navegacao.ts, campo `icone`): dourado na aba aberta, cinza nas outras. */
function IconeAba({ link, ativa }: { link?: LinkModulo; ativa: boolean }) {
  if (!link?.icone) return null;
  return (
    <Icone
      nome={link.icone}
      className={`h-[17px] w-[17px] shrink-0 ${ativa ? "text-[var(--destaque-escuro)]" : "text-[var(--texto-suave)]"}`}
    />
  );
}

const classeAba = (ativa: boolean) =>
  `flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-[14px] ${
    ativa
      ? "border-[var(--destaque-escuro)] font-medium text-[var(--marca)]"
      : "border-transparent text-[var(--texto-suave)] hover:text-[var(--marca)]"
  }`;

/** Aba que abre um menu com as telas do grupo (computador). Mostra "Grupo · Tela atual" quando uma delas está aberta. */
function MenuGrupo({ nome, links, ativo }: { nome: string; links: LinkModulo[]; ativo: (href: string) => boolean }) {
  const [aberto, setAberto] = useState(false);
  const caixa = useFecharFora(aberto, () => setAberto(false));
  const atual = links.find((l) => ativo(l.href));
  return (
    <div ref={caixa} className="relative flex" onClick={(e) => (e.target as HTMLElement).closest("a") && setAberto(false)}>
      <button type="button" className={classeAba(!!atual)} aria-expanded={aberto} aria-haspopup="true" onClick={() => setAberto((x) => !x)}>
        <IconeAba link={links[0]} ativa={!!atual} />
        {nome}
        {atual && <span className="font-normal text-[var(--texto-suave)]">· {atual.nome}</span>}
        <Icone nome="chevron-baixo" className={`h-4 w-4 transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>
      {aberto && (
        <div className="surgir absolute left-0 top-full z-40 mt-1 min-w-56 rounded-xl border border-[var(--borda)] bg-white p-1.5 shadow-lg">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={ativo(l.href) ? "page" : undefined}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[14px] ${
                ativo(l.href) ? "bg-[var(--fundo)] font-medium text-[var(--marca)]" : "text-[var(--texto)] hover:bg-[var(--fundo)]"
              }`}
            >
              <IconeAba link={l} ativa={ativo(l.href)} />
              {l.nome}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** Celular: botão com a tela atual que abre todas as telas do módulo, separadas por grupo. */
function MenuModuloCelular({ modulo, links, ativo }: { modulo: Modulo; links: LinkModulo[]; ativo: (href: string) => boolean }) {
  const [aberto, setAberto] = useState(false);
  const caixa = useFecharFora(aberto, () => setAberto(false));
  const atual = links.find((l) => ativo(l.href));
  const entradas = agruparLinks(links, NAV[modulo].grupos);
  return (
    <div
      ref={caixa}
      className="relative border-t border-[var(--borda)] px-3 py-1.5 md:hidden"
      onClick={(e) => (e.target as HTMLElement).closest("a") && setAberto(false)}
    >
      <button
        type="button"
        onClick={() => setAberto((x) => !x)}
        aria-expanded={aberto}
        className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[14px]"
      >
        <span className="text-[var(--texto-suave)]">Você está em</span>
        <span className="font-medium text-[var(--marca)]">{atual?.nome ?? NAV[modulo].titulo}</span>
        <span className="ml-auto flex items-center gap-1 text-[13px] text-[var(--destaque-escuro)]">
          Telas
          <Icone nome="chevron-baixo" className={`h-4 w-4 transition-transform ${aberto ? "rotate-180" : ""}`} />
        </span>
      </button>
      {aberto && (
        <nav
          aria-label={NAV[modulo].titulo}
          className="surgir absolute inset-x-2 top-full z-40 max-h-[70vh] overflow-y-auto rounded-xl border border-[var(--borda)] bg-white p-2 shadow-xl"
        >
          {entradas.map((e) =>
            e.tipo === "link" ? (
              <Link
                key={e.link.href}
                href={e.link.href}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[15px] ${ativo(e.link.href) ? "bg-[var(--fundo)] font-medium text-[var(--marca)]" : ""}`}
              >
                <IconeAba link={e.link} ativa={ativo(e.link.href)} />
                {e.link.nome}
              </Link>
            ) : (
              <div key={e.nome} className="pt-2">
                <div className="px-3 pb-1 text-[12px] text-[var(--texto-suave)]">{e.nome}</div>
                {e.links.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[15px] ${ativo(l.href) ? "bg-[var(--fundo)] font-medium text-[var(--marca)]" : ""}`}
                  >
                    <IconeAba link={l} ativa={ativo(l.href)} />
                    {l.nome}
                  </Link>
                ))}
              </div>
            ),
          )}
        </nav>
      )}
    </div>
  );
}

export function BarraSuperior({ modulo, aoMenu, aoBuscar }: { modulo: Modulo; aoMenu: () => void; aoBuscar: () => void }) {
  const rota = usePathname();
  const { pode, podeEditarCadastros, pessoal } = useOrg();
  // MDC · Pessoal (075): sem as telas fora do app da família (ex.: certificado digital)
  const links = filtrarLinks(modulo, { pode, podeEditarCadastros }).filter((l) => !pessoal || rotaNoPessoal(l.href));
  const ativo = (href: string) => linkAtivo(rota, href, modulo);
  const agrupado = temGrupos(modulo);
  const entradas = agruparLinks(links, NAV[modulo].grupos);
  const mac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
  // módulo com menus suspensos (grupos) não rola de lado: até 1536 px a busca vira só a lupa para as abas caberem
  const compacta = agrupado;
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--borda)] bg-white/85 backdrop-blur print:hidden">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button
          className="grid h-11 w-11 place-items-center rounded-lg text-[var(--marca)] hover:bg-[var(--fundo)] lg:hidden"
          onClick={aoMenu}
          aria-label="Abrir menu"
        >
          <Icone nome="menu" />
        </button>
        <span className="font-semibold text-[var(--marca)] lg:hidden">
          {pessoal && modulo === "financeiro" ? "Finanças" : NAV[modulo].titulo}
        </span>
        {links.length > 1 && (
          <nav
            className={`-mb-px hidden h-14 min-w-0 items-stretch gap-1 md:flex ${agrupado ? "" : "overflow-x-auto"}`}
            aria-label={NAV[modulo].titulo}
          >
            {entradas.map((e) =>
              e.tipo === "link" ? (
                <Link
                  key={e.link.href}
                  href={e.link.href}
                  aria-current={ativo(e.link.href) ? "page" : undefined}
                  className={classeAba(ativo(e.link.href))}
                >
                  <IconeAba link={e.link} ativa={ativo(e.link.href)} />
                  {e.link.nome}
                </Link>
              ) : (
                <MenuGrupo key={e.nome} nome={e.nome} links={e.links} ativo={ativo} />
              ),
            )}
          </nav>
        )}
        {links.length === 1 && <span className="hidden font-semibold text-[var(--marca)] lg:inline">{NAV[modulo].titulo}</span>}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={aoBuscar}
            className={`flex h-11 min-w-11 items-center justify-center sm:justify-start md:h-9 gap-2 rounded-lg border border-[var(--borda)] bg-white px-3 text-[13px] text-[var(--texto-suave)] hover:border-[var(--destaque-escuro)] sm:w-48 2xl:w-64 ${compacta ? "md:w-auto" : ""}`}
            aria-label="Buscar ou ir para"
          >
            <Icone nome="busca" className="h-4 w-4" />
            <span className={`hidden whitespace-nowrap sm:inline ${compacta ? "md:hidden 2xl:inline" : ""}`}>Buscar ou ir para…</span>
            <kbd className="ml-auto hidden whitespace-nowrap rounded border border-[var(--borda)] px-1.5 text-[11px] 2xl:inline">
              {mac ? "⌘" : "Ctrl"} K
            </kbd>
          </button>
          <Sino />
        </div>
      </div>
      {/* celular: com mais de 3 telas (ou com grupos), um botão "Telas" com a lista inteira, para nenhuma ficar escondida */}
      {(agrupado ? links.length > 1 : links.length > 3) && <MenuModuloCelular modulo={modulo} links={links} ativo={ativo} />}
      {links.length > 1 && links.length <= 3 && !agrupado && (
        <nav className="flex gap-1 overflow-x-auto border-t border-[var(--borda)] px-3 md:hidden" aria-label={NAV[modulo].titulo}>
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-[13px] ${ativo(l.href) ? "border-[var(--destaque-escuro)] font-medium text-[var(--marca)]" : "border-transparent text-[var(--texto-suave)]"}`}
            >
              <IconeAba link={l} ativa={ativo(l.href)} />
              {l.nome}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
