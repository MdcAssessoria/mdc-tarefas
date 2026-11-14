"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Cliente } from "@/dominios/clientes/tipos";
import type { HubApp, PapelApp } from "@/dominios/acessos/tipos";
import type { Membro, Organizacao, Papel, Setor } from "./tipos";
import { podeNoApp } from "@/dominios/acessos/permissoes";
import { traduzirErro } from "@/lib/erros";
import { precisaTrocarSenha } from "@/lib/senhaProvisoria";
import { caminho } from "@/lib/caminho";
import { CHAVES, gravarLocal, lerLocal } from "@/lib/armazenamentoLocal";

interface OrgCtx {
  session: Session;
  org: Organizacao;
  orgs: Organizacao[];
  papel: Papel;
  eu: Membro;
  setores: Setor[];
  clientes: Cliente[];
  membros: Membro[];
  trocarOrg: (id: string) => void;
  /** Organização atual é uma família do MDC - Pessoal (075): moldura, menu e telas do app pessoal. */
  pessoal: boolean;
  recarregar: () => Promise<void>;
  podeEditarCadastros: boolean;
  nomeMembro: (id: string | null) => string;
  setorPorId: (id: string | null) => Setor | undefined;
  clientePorId: (id: string | null) => Cliente | undefined;
  /** Setores, clientes e equipe da organização atual já chegaram (antes disso a lista de clientes está vazia). */
  cadastrosCarregados: boolean;
  apps: HubApp[];
  appsCarregados: boolean;
  pode: (app: string, minimo?: PapelApp) => boolean;
  recarregarApps: () => Promise<void>;
}

const Ctx = createContext<OrgCtx | null>(null);

export function useOrg(): OrgCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useOrg fora do OrgProvider");
  return c;
}

/** Igual a useOrg, mas devolve null fora do OrgProvider (ex.: painel da TV aberto sem login de membro). */
export function useOrgOpcional(): OrgCtx | null {
  return useContext(Ctx);
}

/** Organização desta aba (sessionStorage): HUB e MDC - Pessoal abertos em abas diferentes não se atrapalham. */
const CHAVE_ABA = "mdc-tarefas:org-aba";
function lerOrgDaAba(): string | null {
  try {
    return sessionStorage.getItem(CHAVE_ABA);
  } catch {
    return null;
  }
}
function gravarOrgDaAba(id: string) {
  try {
    sessionStorage.setItem(CHAVE_ABA, id);
  } catch {
    /* navegador sem armazenamento: vale só nesta visita */
  }
}
function lerOrgSalva(): string | null {
  return lerLocal(CHAVES.organizacao);
}

export function aplicarCores(org: Pick<Organizacao, "cor_primaria" | "cor_destaque">) {
  const r = document.documentElement.style;
  r.setProperty("--marca", org.cor_primaria);
  r.setProperty("--destaque", org.cor_destaque);
}

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [orgs, setOrgs] = useState<Organizacao[] | null>(null);
  const [minhas, setMinhas] = useState<Membro[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [setores, setSetores] = useState<Setor[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cadastrosDe, setCadastrosDe] = useState<string | null>(null);
  const [membros, setMembros] = useState<Membro[]>([]);
  const [apps, setApps] = useState<HubApp[]>([]);
  const [appsCarregados, setAppsCarregados] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // sessão
  useEffect(() => {
    const sb = supabase();
    void sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === null) {
      // quem estava no MDC · Pessoal volta para a entrada dele (075)
      let entrada: string | null = null;
      try {
        entrada = sessionStorage.getItem("mdc-tarefas:entrada");
      } catch {
        /* sem armazenamento */
      }
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.replace(caminho(entrada === "pessoal" ? "/pessoal" : `/login?next=${next}`));
    } else if (precisaTrocarSenha(session)) {
      // entrou com senha provisória: cria a própria senha antes de usar o HUB (071)
      window.location.replace(caminho("/login?trocar=1"));
    }
  }, [session]);

  const userId = session?.user.id;

  // organizações do usuário
  const carregarOrgs = useCallback(async () => {
    if (!userId) return;
    const sb = supabase();
    const [m, o] = await Promise.all([
      sb.from("membros").select("*").eq("user_id", userId).eq("ativo", true),
      sb.from("organizacoes").select("*").eq("ativo", true).order("nome"),
    ]);
    if (m.error || o.error) {
      setErro(traduzirErro(m.error ?? o.error));
      return;
    }
    // quem não é da equipe mas tem acesso de cliente vai para o Portal
    if ((m.data as Membro[]).length === 0) {
      const p = await sb.rpc("portal_minhas_empresas");
      if (!p.error && (p.data as unknown[])?.length) {
        window.location.replace(caminho("/portal"));
        return;
      }
    }
    setMinhas(m.data as Membro[]);
    setOrgs(o.data as Organizacao[]);
    const todas = o.data as Organizacao[];
    const ids = todas.map((x) => x.id);
    const pedida = new URLSearchParams(window.location.search).get("org");
    const porSlug = todas.find((x) => x.slug === pedida)?.id;
    const daAba = lerOrgDaAba();
    const salva = lerOrgSalva();
    // sem pedido nem escolha nesta aba: abre a organização do HUB (as famílias abrem pelo /pessoal ou pelo ?org=)
    const primeiraEmpresa = todas.find((x) => x.tipo !== "pessoal")?.id;
    const escolhida =
      porSlug ?? (daAba && ids.includes(daAba) ? daAba : salva && ids.includes(salva) ? salva : (primeiraEmpresa ?? ids[0] ?? null));
    if (escolhida) gravarOrgDaAba(escolhida);
    setOrgId(escolhida);
  }, [userId]);

  useEffect(() => {
    void carregarOrgs();
  }, [carregarOrgs]);

  // cadastros da organização atual
  const recarregar = useCallback(async () => {
    if (!orgId) return;
    const sb = supabase();
    const [s, c, m] = await Promise.all([
      sb.from("setores").select("*").eq("org_id", orgId).order("ordem"),
      sb.from("clientes").select("*").eq("org_id", orgId).order("razao_social"),
      sb.from("membros").select("*").eq("org_id", orgId).order("nome"),
    ]);
    if (s.error || c.error || m.error) {
      setErro(traduzirErro(s.error ?? c.error ?? m.error));
      return;
    }
    setSetores(s.data as Setor[]);
    setClientes(c.data as Cliente[]);
    setMembros(m.data as Membro[]);
    setCadastrosDe(orgId);
    const o = await sb.from("organizacoes").select("*").eq("id", orgId).single();
    if (o.data) setOrgs((prev) => prev?.map((x) => (x.id === orgId ? (o.data as Organizacao) : x)) ?? prev);
  }, [orgId]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const recarregarApps = useCallback(async () => {
    if (!orgId) return;
    const { data } = await supabase().rpc("hub_meus_apps", { p_org: orgId });
    setApps((data as HubApp[]) ?? []);
    setAppsCarregados(true);
  }, [orgId]);

  useEffect(() => {
    void recarregarApps();
  }, [recarregarApps]);

  const org = orgs?.find((o) => o.id === orgId);
  useEffect(() => {
    if (org) aplicarCores(org);
  }, [org]);

  const valor = useMemo<OrgCtx | null>(() => {
    if (!session || !org) return null;
    const eu = minhas.find((m) => m.org_id === org.id);
    if (!eu) return null;
    const mapM = new Map(membros.map((m) => [m.user_id, m]));
    const mapS = new Map(setores.map((s) => [s.id, s]));
    const mapC = new Map(clientes.map((c) => [c.id, c]));
    return {
      session,
      org,
      orgs: orgs ?? [],
      papel: eu.papel,
      eu,
      setores,
      clientes,
      membros,
      podeEditarCadastros: eu.papel === "admin" || eu.papel === "gestor",
      pessoal: org.tipo === "pessoal",
      trocarOrg: (id) => {
        gravarOrgDaAba(id);
        // a lembrança "entre abas" é só do HUB; família abre pelo /pessoal
        if (orgs?.find((o) => o.id === id)?.tipo !== "pessoal") gravarLocal(CHAVES.organizacao, id);
        setOrgId(id);
      },
      recarregar,
      nomeMembro: (id) => (id ? (mapM.get(id)?.nome ?? "—") : "—"),
      setorPorId: (id) => (id ? mapS.get(id) : undefined),
      clientePorId: (id) => (id ? mapC.get(id) : undefined),
      cadastrosCarregados: cadastrosDe === org.id,
      apps,
      appsCarregados,
      pode: (app, minimo = "ver") => podeNoApp(eu.papel, apps, app, minimo),
      recarregarApps,
    };
  }, [session, org, orgs, minhas, membros, setores, clientes, cadastrosDe, recarregar, apps, appsCarregados, recarregarApps]);

  if (erro) return <Centro titulo="Não foi possível carregar">{erro}</Centro>;
  if (session === undefined || (session && orgs === null)) return <Centro titulo="Carregando…" />;
  if (session && orgs && orgs.length === 0) return <AcessoNaoLiberado email={session.user.email ?? ""} />;
  if (!valor) return <Centro titulo="Carregando…" />;
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function Centro({ titulo, children }: { titulo: string; children?: React.ReactNode }) {
  return (
    <div className="min-h-screen grid place-items-center bg-[var(--fundo)] p-6">
      <div className="max-w-md text-center">
        <h1 className="text-lg font-semibold text-[var(--marca)]">{titulo}</h1>
        {children && <div className="mt-2 text-sm text-neutral-600">{children}</div>}
      </div>
    </div>
  );
}

/** Conta que entrou mas não é membro de nenhuma organização: o administrador precisa liberar. */
function AcessoNaoLiberado({ email }: { email: string }) {
  // criar organização ficou restrito ao administrador do sistema (auditoria de segurança)
  return (
    <Centro titulo="Seu acesso ainda não foi liberado">
      <p>
        Peça ao administrador da MDC para cadastrar <b>{email}</b> em Pessoas e acessos. Assim que for liberado, entre de novo.
      </p>
      <p className="mt-3">
        Quer controlar as finanças da sua família?{" "}
        <a className="btn-link" href={caminho("/pessoal")}>
          Abrir o MDC · Pessoal
        </a>
      </p>
      <button className="btn-link mt-4" onClick={() => void supabase().auth.signOut()}>
        Sair
      </button>
    </Centro>
  );
}
