"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { OrgProvider, useOrg } from "@/lib/org";
import { supabase } from "@/lib/supabase";
import { PAPEIS } from "@/lib/types";
import type { PapelApp } from "@/lib/types";
import { Icone } from "./Icone";
import { fmtDataHora } from "@/lib/datas";
import { caminho } from "@/lib/caminho";

type Modulo = "hub" | "tarefas" | "societario" | "demonstrativos" | "atendimento" | "vencimentos" | "comercial";

const NAV: Record<Modulo, { titulo: string; links: { href: string; nome: string; minimo?: PapelApp; gestor?: boolean }[] }> = {
  hub: { titulo: "HUB-MDC", links: [] },
  tarefas: {
    titulo: "Tarefas",
    links: [
      { href: "/tarefas", nome: "Tarefas" },
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
      { href: "/comercial/contratos", nome: "Contratos" },
      { href: "/comercial/modelo", nome: "Modelo de contrato", minimo: "gerir" },
    ],
  },
};

export function AppShell({ children, modulo = "tarefas" }: { children: React.ReactNode; modulo?: Modulo }) {
  return (
    <OrgProvider>
      <Guarda modulo={modulo}>
        <Cabecalho modulo={modulo} />
        <main className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6">{children}</main>
      </Guarda>
    </OrgProvider>
  );
}

/** Bloqueia a tela de um módulo que não foi liberado para a pessoa. */
function Guarda({ modulo, children }: { modulo: Modulo; children: React.ReactNode }) {
  const { pode, apps } = useOrg();
  if (modulo === "hub" || !apps.length) return <>{children}</>;
  if (!pode(modulo))
    return (
      <>
        <Cabecalho modulo="hub" />
        <div className="mx-auto max-w-lg p-10 text-center">
          <h1 className="text-lg font-semibold text-[var(--marca)]">Ferramenta não liberada</h1>
          <p className="mt-2 text-sm text-neutral-600">
            Você ainda não tem acesso a {NAV[modulo].titulo}. Peça ao administrador do Hub para liberar.
          </p>
          <Link href="/" className="btn-primario mt-5">
            Voltar ao início
          </Link>
        </div>
      </>
    );
  return <>{children}</>;
}

function Cabecalho({ modulo }: { modulo: Modulo }) {
  const { org, orgs, trocarOrg, eu, papel, podeEditarCadastros, pode } = useOrg();
  const rota = usePathname();
  const nav = NAV[modulo];
  const links = nav.links.filter((l) => (l.gestor ? podeEditarCadastros : l.minimo ? pode(modulo, l.minimo) : true));
  const ativo = (href: string) =>
    rota === href || (href !== `/${modulo}` && rota.startsWith(href + "/")) || (href === `/${modulo}` && rota === href);
  return (
    <header className="bg-[var(--marca)] text-[#C6D3CC] print:hidden">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2" title="Início do HUB-MDC">
          <img src={caminho("/icone-hub-mdc.svg")} alt="" className="h-8 w-8 rounded-md" />
          <span className="font-semibold text-[var(--destaque)]">{nav.titulo}</span>
        </Link>
        {links.length > 0 && (
          <nav className="flex flex-wrap gap-1 text-sm">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-md px-3 py-1.5 ${ativo(l.href) ? "bg-white/10 text-white" : "hover:text-white"}`}
              >
                {l.nome}
              </Link>
            ))}
          </nav>
        )}
        <div className="ml-auto flex items-center gap-2 text-sm">
          <Ferramentas />
          <Sino />
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
            <span className="hidden lg:inline text-white">{org.nome}</span>
          )}
          <span className="hidden md:inline" title={PAPEIS.find((p) => p.id === papel)?.nome}>
            {eu.nome}
          </span>
          <button
            className="rounded-md border border-white/20 px-2.5 py-1 hover:text-white"
            onClick={async () => {
              await supabase().auth.signOut();
              window.location.replace(caminho("/login"));
            }}
          >
            Sair
          </button>
        </div>
      </div>
    </header>
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

function Ferramentas() {
  const { apps } = useOrg();
  const [aberto, setAberto] = useState(false);
  const ref = useFora(aberto, () => setAberto(false));
  const minhas = apps.filter((a) => a.papel && a.status !== "em_breve");
  return (
    <div className="relative" ref={ref}>
      <button
        className="grid h-9 w-9 place-items-center rounded-md hover:bg-white/10 hover:text-white"
        onClick={() => setAberto((x) => !x)}
        aria-label="Ferramentas do Hub"
        title="Ferramentas do Hub"
      >
        <Icone nome="grade" />
      </button>
      {aberto && (
        <div className="absolute right-0 z-40 mt-2 w-72 rounded-xl border border-[var(--borda)] bg-white p-2 text-[var(--texto)] shadow-lg">
          <Link href="/" className="block rounded-lg px-3 py-2 text-sm font-medium hover:bg-[var(--fundo)]">
            Início do Hub
          </Link>
          <div className="grid grid-cols-3 gap-1 pt-1">
            {minhas.map((a) => (
              <a
                key={a.slug}
                href={caminho(a.rota)}
                target={a.externo ? "_blank" : undefined}
                rel={a.externo ? "noopener" : undefined}
                className="flex flex-col items-center gap-1 rounded-lg p-2 text-center text-xs hover:bg-[var(--fundo)]"
              >
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--marca)] text-[var(--destaque)]">
                  <Icone nome={a.icone} />
                </span>
                {a.nome}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
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
        .then(({ data }) => setLista((data as Notificacao[]) ?? []));
    carregar();
    const canal = sb
      .channel(`sino-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "hub_notificacoes", filter: `user_id=eq.${uid}` }, carregar)
      .subscribe();
    return () => {
      sb.removeChannel(canal);
    };
  }, [uid]);

  const novas = lista.filter((n) => !n.lida_em).length;

  async function marcarTodas() {
    const ids = lista.filter((n) => !n.lida_em).map((n) => n.id);
    if (!ids.length) return;
    const agora = new Date().toISOString();
    setLista((l) => l.map((n) => (n.lida_em ? n : { ...n, lida_em: agora })));
    await supabase().from("hub_notificacoes").update({ lida_em: agora }).in("id", ids);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        className="relative grid h-9 w-9 place-items-center rounded-md hover:bg-white/10 hover:text-white"
        onClick={() => setAberto((x) => !x)}
        aria-label={`Notificações${novas ? ` (${novas} novas)` : ""}`}
        title="Notificações"
      >
        <Icone nome="sino" />
        {novas > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--destaque)] px-1 text-[10px] font-semibold text-[var(--marca)]">
            {novas > 9 ? "9+" : novas}
          </span>
        )}
      </button>
      {aberto && (
        <div className="absolute right-0 z-40 mt-2 w-80 rounded-xl border border-[var(--borda)] bg-white text-[var(--texto)] shadow-lg">
          <div className="flex items-center justify-between border-b border-[var(--borda)] px-3 py-2">
            <span className="text-sm font-semibold">Notificações</span>
            {novas > 0 && (
              <button className="btn-link" onClick={marcarTodas}>
                Marcar todas como lidas
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {lista.length === 0 && <p className="p-4 text-sm text-neutral-500">Nada por aqui.</p>}
            {lista.map((n) => (
              <a
                key={n.id}
                href={n.link ? caminho(n.link) : "#"}
                onClick={() =>
                  !n.lida_em &&
                  supabase().from("hub_notificacoes").update({ lida_em: new Date().toISOString() }).eq("id", n.id)
                }
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
