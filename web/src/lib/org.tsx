"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigurado } from "./supabase";
import type { Cliente, Membro, Organizacao, Papel, Setor } from "./types";

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
  recarregar: () => Promise<void>;
  podeEditarCadastros: boolean;
  nomeMembro: (id: string | null) => string;
  setorPorId: (id: string | null) => Setor | undefined;
  clientePorId: (id: string | null) => Cliente | undefined;
}

const Ctx = createContext<OrgCtx | null>(null);

export function useOrg(): OrgCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useOrg fora do OrgProvider");
  return c;
}

const CHAVE_ORG = "mdc-tarefas:org";

function lerOrgSalva(): string | null {
  try {
    return localStorage.getItem(CHAVE_ORG);
  } catch {
    return null;
  }
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
  const [membros, setMembros] = useState<Membro[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  // sessão
  useEffect(() => {
    if (!supabaseConfigurado) {
      setSession(null);
      return;
    }
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === null) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.replace(`/login?next=${next}`);
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
      setErro((m.error ?? o.error)!.message);
      return;
    }
    setMinhas(m.data as Membro[]);
    setOrgs(o.data as Organizacao[]);
    const ids = (o.data as Organizacao[]).map((x) => x.id);
    const pedida = new URLSearchParams(window.location.search).get("org");
    const porSlug = (o.data as Organizacao[]).find((x) => x.slug === pedida)?.id;
    const salva = lerOrgSalva();
    setOrgId(porSlug ?? (salva && ids.includes(salva) ? salva : ids[0] ?? null));
  }, [userId]);

  useEffect(() => {
    carregarOrgs();
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
      setErro((s.error ?? c.error ?? m.error)!.message);
      return;
    }
    setSetores(s.data as Setor[]);
    setClientes(c.data as Cliente[]);
    setMembros(m.data as Membro[]);
    const o = await sb.from("organizacoes").select("*").eq("id", orgId).single();
    if (o.data) setOrgs((prev) => prev?.map((x) => (x.id === orgId ? (o.data as Organizacao) : x)) ?? prev);
  }, [orgId]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

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
      trocarOrg: (id) => {
        try {
          localStorage.setItem(CHAVE_ORG, id);
        } catch {}
        setOrgId(id);
      },
      recarregar,
      nomeMembro: (id) => (id ? mapM.get(id)?.nome ?? "—" : "—"),
      setorPorId: (id) => (id ? mapS.get(id) : undefined),
      clientePorId: (id) => (id ? mapC.get(id) : undefined),
    };
  }, [session, org, orgs, minhas, membros, setores, clientes, recarregar]);

  if (!supabaseConfigurado) return <SemConfiguracao />;
  if (erro) return <Centro titulo="Não foi possível carregar">{erro}</Centro>;
  if (session === undefined || (session && orgs === null)) return <Centro titulo="Carregando…" />;
  if (session && orgs && orgs.length === 0)
    return <CriarOrganizacao aoCriar={carregarOrgs} email={session.user.email ?? ""} />;
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

function SemConfiguracao() {
  return (
    <Centro titulo="Supabase não configurado">
      Defina <code>NEXT_PUBLIC_SUPABASE_URL</code> e <code>NEXT_PUBLIC_SUPABASE_KEY</code> nas variáveis de
      ambiente (arquivo <code>.env.local</code> ou painel da Vercel) e publique novamente.
    </Centro>
  );
}

function CriarOrganizacao({ aoCriar, email }: { aoCriar: () => void; email: string }) {
  const [nome, setNome] = useState("");
  const [slug, setSlug] = useState("");
  const [seuNome, setSeuNome] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    const { error } = await supabase().rpc("criar_organizacao", {
      p_nome: nome,
      p_slug: slug,
      p_nome_usuario: seuNome,
    });
    setEnviando(false);
    if (error) setErro(error.message.includes("duplicate") ? "Esse identificador já está em uso." : error.message);
    else aoCriar();
  }

  return (
    <div className="min-h-screen grid place-items-center bg-[var(--fundo)] p-6">
      <form onSubmit={criar} className="w-full max-w-md cartao p-6 space-y-4">
        <div>
          <h1 className="text-lg font-semibold text-[var(--marca)]">Você ainda não faz parte de uma equipe</h1>
          <p className="text-sm text-neutral-600 mt-1">
            Se a sua empresa já usa o sistema, peça ao administrador para adicionar <b>{email}</b>. Ou crie uma nova
            organização abaixo.
          </p>
        </div>
        <label className="campo">
          <span>Nome da empresa</span>
          <input
            required
            value={nome}
            onChange={(e) => {
              setNome(e.target.value);
              setSlug(
                e.target.value
                  .toLowerCase()
                  .normalize("NFD")
                  .replace(/[̀-ͯ]/g, "")
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/^-|-$/g, "")
                  .slice(0, 40),
              );
            }}
          />
        </label>
        <label className="campo">
          <span>Identificador (usado no link do painel)</span>
          <input required pattern="[a-z0-9-]{3,40}" value={slug} onChange={(e) => setSlug(e.target.value)} />
        </label>
        <label className="campo">
          <span>Seu nome</span>
          <input required value={seuNome} onChange={(e) => setSeuNome(e.target.value)} />
        </label>
        {erro && <p className="text-sm text-red-700">{erro}</p>}
        <button className="btn-primario w-full" disabled={enviando}>
          {enviando ? "Criando…" : "Criar organização"}
        </button>
        <button type="button" className="btn-link w-full" onClick={() => supabase().auth.signOut()}>
          Sair
        </button>
      </form>
    </div>
  );
}
