"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as EventoMouse } from "react";
import { OrgProvider, useOrg } from "@/lib/org";
import { supabase } from "@/lib/supabase";
import { PAPEIS, PAPEIS_APP } from "@/lib/types";
import type { PapelApp } from "@/lib/types";
import { Icone } from "./Icone";
import { fmtDataHora } from "@/lib/datas";
import { caminho } from "@/lib/caminho";
import { traduzirErro } from "@/lib/erros";

type Modulo = "hub" | "tarefas" | "societario" | "demonstrativos" | "atendimento" | "vencimentos" | "comercial";

const NAV: Record<Modulo, { titulo: string; links: { href: string; nome: string; minimo?: PapelApp; gestor?: boolean }[] }> = {
  hub: { titulo: "Início", links: [] },
  tarefas: {
    titulo: "Tarefas",
    links: [
      { href: "/tarefas", nome: "Tarefas" },
      { href: "/tarefas/relatorio", nome: "Relatórios" },
      { href: "/tv", nome: "Painel TV" },
      { href: "/config", nome: "Configurações", gestor: true },
    ],
  },
  societario: {
    titulo: "Societário",
    links: [
      { href: "/societario", nome: "Processos" },
      { href: "/societario/painel", nome: "Painel" },
    ],
  },
  demonstrativos: {
    titulo: "Demonstrativos",
    links: [
      { href: "/demonstrativos", nome: "Balancetes" },
      { href: "/demonstrativos/importar", nome: "Importar", minimo: "operar" },
      { href: "/demonstrativos/riscos", nome: "Riscos da carteira" },
    ],
  },
  atendimento: {
    titulo: "Atendimento",
    links: [
      { href: "/atendimento", nome: "Caixa de entrada" },
      { href: "/atendimento/portal", nome: "Acessos do portal", minimo: "gerir" },
    ],
  },
  vencimentos: { titulo: "Vencimentos", links: [{ href: "/vencimentos", nome: "Vencimentos" }] },
  comercial: {
    titulo: "CRM Comercial",
    links: [
      { href: "/comercial", nome: "Funil" },
      { href: "/comercial/leads", nome: "Leads" },
      { href: "/comercial/contratos", nome: "Contratos" },
      { href: "/comercial/modelo", nome: "Modelo de contrato", minimo: "gerir" },
    ],
  },
};

const CHAVE_RECOLHIDO = "hub-mdc:menu-recolhido";

export function AppShell({ children, modulo = "tarefas" }: { children: React.ReactNode; modulo?: Modulo }) {
  return (
    <OrgProvider>
      <Moldura modulo={modulo}>
        <Guarda modulo={modulo}>{children}</Guarda>
      </Moldura>
    </OrgProvider>
  );
}

/** Bloqueia a tela de um módulo que não foi liberado para a pessoa. */
function Guarda({ modulo, children }: { modulo: Modulo; children: React.ReactNode }) {
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

function useLinksDoModulo(modulo: Modulo) {
  const { pode, podeEditarCadastros } = useOrg();
  return NAV[modulo].links.filter((l) => (l.gestor ? podeEditarCadastros : l.minimo ? pode(modulo, l.minimo) : true));
}

/** Estrutura do Hub: menu lateral (recolhível; gaveta no celular), barra superior com as abas do módulo, busca rápida e sino. */
function Moldura({ modulo, children }: { modulo: Modulo; children: React.ReactNode }) {
  const [recolhido, setRecolhido] = useState(false);
  const [gaveta, setGaveta] = useState(false);
  const [busca, setBusca] = useState(false);
  const rota = usePathname();

  useEffect(() => {
    try {
      setRecolhido(localStorage.getItem(CHAVE_RECOLHIDO) === "1");
    } catch {}
  }, []);
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

  const alternar = () =>
    setRecolhido((x) => {
      try {
        localStorage.setItem(CHAVE_RECOLHIDO, x ? "0" : "1");
      } catch {}
      return !x;
    });

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
        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>

      {busca && <BuscaRapida aoFechar={() => setBusca(false)} />}
    </div>
  );
}

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

function MenuLateral({ modulo, recolhido, aoRecolher }: { modulo: Modulo; recolhido: boolean; aoRecolher?: () => void }) {
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

function BarraSuperior({ modulo, aoMenu, aoBuscar }: { modulo: Modulo; aoMenu: () => void; aoBuscar: () => void }) {
  const rota = usePathname();
  const links = useLinksDoModulo(modulo);
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

interface ItemBusca {
  id: string;
  grupo: string;
  nome: string;
  detalhe?: string;
  icone: string;
  href: string;
  externo?: boolean;
}

/** Busca rápida (Ctrl/⌘ K): ferramentas, páginas e clientes. */
function BuscaRapida({ aoFechar }: { aoFechar: () => void }) {
  const { apps, pode, podeEditarCadastros, papel, clientes } = useOrg();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const lista = useRef<HTMLDivElement>(null);

  const base = useMemo<ItemBusca[]>(() => {
    const itens: ItemBusca[] = [
      { id: "inicio", grupo: "Ir para", nome: "Início", icone: "casa", href: "/" },
      { id: "nova-tarefa", grupo: "Ações", nome: "Nova tarefa", icone: "mais", href: "/tarefas?nova=1" },
    ];
    for (const a of apps.filter((x) => x.papel && x.status !== "em_breve")) {
      const mod = NAV[a.slug as Modulo];
      if (!mod) {
        itens.push({
          id: a.slug,
          grupo: "Ferramentas",
          nome: a.nome,
          detalhe: a.descricao,
          icone: a.icone,
          href: a.rota,
          externo: a.externo,
        });
        continue;
      }
      for (const l of mod.links.filter((l) => (l.gestor ? podeEditarCadastros : l.minimo ? pode(a.slug, l.minimo) : true)))
        itens.push({
          id: l.href,
          grupo: "Ferramentas",
          nome: l.nome === mod.titulo ? mod.titulo : `${mod.titulo}: ${l.nome}`,
          icone: a.icone,
          href: l.href,
        });
    }
    if (papel === "admin")
      itens.push({ id: "acessos", grupo: "Administração", nome: "Pessoas e acessos", icone: "pessoas", href: "/hub/acessos" });
    if (podeEditarCadastros)
      itens.push({ id: "config", grupo: "Administração", nome: "Configurações e clientes", icone: "engrenagem", href: "/config" });
    if (pode("tarefas"))
      for (const c of clientes.filter((c) => c.ativo))
        itens.push({
          id: "cli-" + c.id,
          grupo: "Clientes",
          nome: c.nome_fantasia || c.razao_social,
          detalhe: [c.cnpj, c.codigo_dominio && `Domínio ${c.codigo_dominio}`].filter(Boolean).join("  ·  ") || undefined,
          icone: "pasta",
          href: `/tarefas?cliente=${c.id}`,
        });
    return itens;
  }, [apps, pode, podeEditarCadastros, papel, clientes]);

  const resultado = useMemo(() => {
    const t = q
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (!t) return base.filter((x) => x.grupo !== "Clientes");
    const sem = (s: string) =>
      s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    return base.filter((x) => sem(`${x.nome} ${x.detalhe ?? ""}`).includes(t)).slice(0, 40);
  }, [q, base]);

  useEffect(() => setI(0), [q]);
  useEffect(() => {
    lista.current?.querySelector(`[data-i="${i}"]`)?.scrollIntoView({ block: "nearest" });
  }, [i]);

  const abrir = useCallback(
    (x: ItemBusca | undefined) => {
      if (!x) return;
      aoFechar();
      if (x.externo) window.open(x.href, "_blank", "noopener");
      else router.push(x.href);
    },
    [aoFechar, router],
  );

  let ultimoGrupo = "";
  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-[rgba(11,40,32,0.35)] p-4 pt-[12vh] backdrop-blur-[2px]"
      onClick={aoFechar}
    >
      <div
        className="surgir w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--borda)] bg-white shadow-[0_24px_60px_-20px_rgba(11,40,32,0.45)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Buscar ou ir para"
      >
        <div className="flex items-center gap-3 border-b border-[var(--borda)] px-4">
          <Icone nome="busca" className="h-5 w-5 text-[var(--texto-suave)]" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") aoFechar();
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setI((x) => Math.min(x + 1, resultado.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setI((x) => Math.max(x - 1, 0));
              } else if (e.key === "Enter") abrir(resultado[i]);
            }}
            placeholder="Ferramenta, página ou cliente (nome, CNPJ, código)"
            className="h-14 flex-1 bg-transparent text-[15px] outline-none focus-visible:outline-none"
            role="combobox"
            aria-expanded="true"
            aria-controls="busca-rapida-lista"
          />
          <kbd className="rounded border border-[var(--borda)] px-1.5 text-[11px] text-[var(--texto-suave)]">Esc</kbd>
        </div>
        <div ref={lista} id="busca-rapida-lista" role="listbox" className="max-h-[52vh] overflow-y-auto p-2">
          {resultado.length === 0 && <p className="px-3 py-6 text-center text-sm text-[var(--texto-suave)]">Nada encontrado para “{q}”.</p>}
          {resultado.map((x, k) => {
            const cab = x.grupo !== ultimoGrupo ? (ultimoGrupo = x.grupo) : null;
            return (
              <div key={x.id}>
                {cab && <div className="px-3 pb-1 pt-3 text-[12px] text-[var(--texto-suave)]">{cab}</div>}
                <button
                  data-i={k}
                  role="option"
                  aria-selected={k === i}
                  onMouseEnter={() => setI(k)}
                  onClick={() => abrir(x)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[14px] ${k === i ? "bg-[var(--fundo)] text-[var(--marca)]" : ""}`}
                >
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${k === i ? "bg-[var(--marca)] text-[var(--destaque)]" : "bg-[var(--fundo)] text-[var(--texto-suave)]"}`}
                  >
                    <Icone nome={x.icone} className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{x.nome}</span>
                    {x.detalhe && <span className="block truncate text-[12px] text-[var(--texto-suave)]">{x.detalhe}</span>}
                  </span>
                  {k === i && <span className="text-[12px] text-[var(--texto-suave)]">Enter</span>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function useFora(aberto: boolean, fechar: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const f = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && fechar();
    document.addEventListener("mousedown", f);
    return () => document.removeEventListener("mousedown", f);
  }, [aberto, fechar]);
  return ref;
}

interface Notificacao {
  id: string;
  titulo: string;
  texto: string | null;
  link: string | null;
  lida_em: string | null;
  criado_em: string;
}

function Sino() {
  const { session } = useOrg();
  const [lista, setLista] = useState<Notificacao[]>([]);
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const ref = useFora(aberto, () => setAberto(false));
  const uid = session.user.id;

  useEffect(() => {
    const sb = supabase();
    const carregar = () =>
      sb
        .from("hub_notificacoes")
        .select("id,titulo,texto,link,lida_em,criado_em")
        .eq("user_id", uid)
        .order("criado_em", { ascending: false })
        .limit(30)
        .then(({ data, error }) => {
          if (error) setErro(traduzirErro(error));
          else setLista((data as Notificacao[]) ?? []);
        });
    void carregar();
    const canal = sb
      .channel(`sino-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "hub_notificacoes", filter: `user_id=eq.${uid}` }, carregar)
      .subscribe();
    return () => {
      void sb.removeChannel(canal);
    };
  }, [uid]);

  const novas = lista.filter((n) => !n.lida_em).length;

  /** Marca como lidas na tela na hora; se o banco recusar, desfaz e mostra o motivo. */
  async function marcarLidas(ids: string[]) {
    if (!ids.length) return;
    const agora = new Date().toISOString();
    setLista((l) => l.map((n) => (ids.includes(n.id) && !n.lida_em ? { ...n, lida_em: agora } : n)));
    const { error } = await supabase().from("hub_notificacoes").update({ lida_em: agora }).in("id", ids);
    if (error) {
      setErro(traduzirErro(error));
      setLista((l) => l.map((n) => (ids.includes(n.id) && n.lida_em === agora ? { ...n, lida_em: null } : n)));
    } else setErro(null);
  }

  // A gravação precisa terminar antes de sair da página; senão o navegador cancela a requisição.
  async function abrir(e: EventoMouse, n: Notificacao) {
    if (n.lida_em) return;
    // Ctrl/Cmd/Shift-clique abre em outra aba: esta página continua viva e a gravação termina sozinha
    if (e.ctrlKey || e.metaKey || e.shiftKey) return void marcarLidas([n.id]);
    e.preventDefault();
    await marcarLidas([n.id]);
    if (n.link) window.location.assign(caminho(n.link));
  }

  return (
    <div className="relative" ref={ref}>
      <button
        className="relative grid h-9 w-9 place-items-center rounded-lg text-[var(--texto-suave)] hover:bg-[var(--fundo)] hover:text-[var(--marca)]"
        onClick={() => setAberto((x) => !x)}
        aria-label={`Notificações${novas ? ` (${novas} novas)` : ""}`}
        title="Notificações"
      >
        <Icone nome="sino" />
        {novas > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--perigo)] px-1 text-[10px] font-semibold text-white">
            {novas > 9 ? "9+" : novas}
          </span>
        )}
      </button>
      {aberto && (
        <div className="surgir absolute right-0 z-40 mt-2 w-80 rounded-xl border border-[var(--borda)] bg-white text-[var(--texto)] shadow-lg">
          <div className="flex items-center justify-between border-b border-[var(--borda)] px-3 py-2">
            <span className="text-sm font-semibold">Notificações</span>
            {novas > 0 && (
              <button className="btn-link" onClick={() => void marcarLidas(lista.filter((n) => !n.lida_em).map((n) => n.id))}>
                Marcar todas como lidas
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {erro && <p className="m-2 rounded-lg bg-red-50 p-2 text-xs text-red-800">{erro}</p>}
            {lista.length === 0 && <p className="p-4 text-sm text-neutral-500">Nada por aqui.</p>}
            {lista.map((n) => (
              <a
                key={n.id}
                href={n.link ? caminho(n.link) : "#"}
                onClick={(e) => void abrir(e, n)}
                className={`block border-b border-[var(--borda)] px-3 py-2 text-sm last:border-0 hover:bg-[var(--fundo)] ${
                  n.lida_em ? "text-neutral-500" : ""
                }`}
              >
                <div className={n.lida_em ? "" : "font-medium"}>{n.titulo}</div>
                {n.texto && <div className="line-clamp-2 text-xs text-neutral-500">{n.texto}</div>}
                <div className="mt-0.5 text-[11px] text-neutral-400">{fmtDataHora(n.criado_em)}</div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
