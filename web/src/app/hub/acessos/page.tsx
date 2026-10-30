"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useOrg } from "@/lib/org";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { fmtDataHora } from "@/lib/datas";
import { PAPEIS, PAPEIS_APP } from "@/lib/types";
import type { Papel, PapelApp } from "@/lib/types";

export default function PaginaAcessos() {
  return (
    <AppShell modulo="hub">
      <Acessos />
    </AppShell>
  );
}

interface Acesso {
  user_id: string;
  app: string;
  papel: PapelApp;
  expira_em: string | null;
}
interface Perfil {
  id: string;
  nome: string;
  apps: Record<string, PapelApp>;
}
interface Auditoria {
  id: number;
  user_id: string | null;
  acao: string;
  alvo: string | null;
  antes: unknown;
  depois: unknown;
  em: string;
}

function Acessos() {
  const { org, papel, membros, setores, apps, nomeMembro, recarregar, recarregarApps } = useOrg();
  const [acessos, setAcessos] = useState<Acesso[]>([]);
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [historico, setHistorico] = useState<Auditoria[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [convite, setConvite] = useState(false);

  const ferramentas = useMemo(() => apps.filter((a) => a.status !== "em_breve"), [apps]);

  const carregar = useCallback(async () => {
    const sb = supabase();
    const [a, p, h] = await Promise.all([
      sb.from("hub_acessos").select("user_id,app,papel,expira_em").eq("org_id", org.id),
      sb.from("hub_perfis").select("id,nome,apps").eq("org_id", org.id).order("nome"),
      sb.from("hub_auditoria").select("*").eq("org_id", org.id).order("em", { ascending: false }).limit(40),
    ]);
    if (a.error) return setErro(traduzirErro(a.error));
    setAcessos(a.data as Acesso[]);
    setPerfis((p.data as Perfil[]) ?? []);
    setHistorico((h.data as Auditoria[]) ?? []);
  }, [org.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (papel !== "admin")
    return <p className="text-sm text-neutral-600">Apenas administradores gerenciam acessos.</p>;

  const papelDe = (u: string, app: string) => acessos.find((a) => a.user_id === u && a.app === app)?.papel ?? "";

  async function definir(user: string, app: string, valor: string) {
    setErro(null);
    const { error } = await supabase().rpc("hub_definir_acesso", {
      p_org: org.id,
      p_user: user,
      p_app: app,
      p_papel: valor || null,
    });
    if (error) return setErro(traduzirErro(error));
    await carregar();
    recarregarApps();
  }

  async function aplicarPerfil(user: string, perfil: string) {
    if (!perfil) return;
    const { error } = await supabase().rpc("hub_aplicar_perfil", { p_org: org.id, p_user: user, p_perfil: perfil });
    if (error) return setErro(traduzirErro(error));
    setAviso("Perfil aplicado.");
    await carregar();
    recarregarApps();
  }

  const ativos = membros.filter((m) => m.ativo);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--marca)]">Pessoas e acessos</h1>
          <p className="text-sm text-neutral-600">
            Escolha o que cada pessoa pode fazer em cada ferramenta. Administradores têm acesso total. Para desligar
            alguém de tudo, inative a pessoa em Tarefas › Configurações › Equipe.
          </p>
        </div>
        <button className="btn-primario" onClick={() => setConvite(true)}>
          Convidar pessoa
        </button>
      </div>

      {erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{erro}</p>}
      {aviso && <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{aviso}</p>}

      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead>
            <tr>
              <th>Pessoa</th>
              {ferramentas.map((a) => (
                <th key={a.slug}>{a.nome}</th>
              ))}
              <th>Aplicar perfil</th>
            </tr>
          </thead>
          <tbody>
            {ativos.map((m) => (
              <tr key={m.user_id}>
                <td>
                  <div className="font-medium">{m.nome}</div>
                  <div className="text-xs text-neutral-500">
                    {PAPEIS.find((p) => p.id === m.papel)?.nome} · {m.email}
                  </div>
                </td>
                {ferramentas.map((a) => (
                  <td key={a.slug}>
                    {m.papel === "admin" ? (
                      <span className="chip bg-[var(--fundo)] text-neutral-600">total</span>
                    ) : (
                      <select
                        className="entrada !min-h-8 !py-1 text-sm"
                        value={papelDe(m.user_id, a.slug)}
                        onChange={(e) => definir(m.user_id, a.slug, e.target.value)}
                        aria-label={`${a.nome} para ${m.nome}`}
                      >
                        <option value="">—</option>
                        {PAPEIS_APP.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nome}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                ))}
                <td>
                  {m.papel !== "admin" && (
                    <select
                      className="entrada !min-h-8 !py-1 text-sm"
                      value=""
                      onChange={(e) => aplicarPerfil(m.user_id, e.target.value)}
                      aria-label={`Perfil para ${m.nome}`}
                    >
                      <option value="">Escolher…</option>
                      {perfis.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-neutral-500">
        {PAPEIS_APP.map((p) => `${p.nome}: ${p.ajuda}`).join(" · ")}. Aplicar um perfil soma as ferramentas dele às que a
        pessoa já tem.
      </p>

      <section className="cartao p-4">
        <h2 className="mb-2 font-semibold">Histórico de liberações</h2>
        {historico.length === 0 && <p className="text-sm text-neutral-500">Nenhuma alteração ainda.</p>}
        <ul className="space-y-1 text-sm">
          {historico.map((h) => {
            const [app, user] = (h.alvo ?? "").split(":");
            const nomeApp = apps.find((a) => a.slug === app)?.nome ?? app;
            return (
              <li key={h.id} className="text-neutral-700">
                <span className="text-neutral-400">{fmtDataHora(h.em)}</span> · {nomeMembro(h.user_id)}{" "}
                {h.acao === "acesso"
                  ? `${h.depois ? `liberou ${nomeApp} (${String(h.depois)})` : `retirou ${nomeApp}`} para ${nomeMembro(user ?? null)}`
                  : `${h.acao} ${h.alvo ?? ""}`}
              </li>
            );
          })}
        </ul>
      </section>

      {convite && (
        <Convite
          perfis={perfis}
          setores={setores}
          aoFechar={() => setConvite(false)}
          aoConvidar={async (txt) => {
            setAviso(txt);
            setConvite(false);
            await recarregar();
            await carregar();
          }}
        />
      )}
    </div>
  );
}

function Convite({
  perfis,
  setores,
  aoFechar,
  aoConvidar,
}: {
  perfis: Perfil[];
  setores: { id: string; nome: string }[];
  aoFechar: () => void;
  aoConvidar: (txt: string) => void;
}) {
  const { org } = useOrg();
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [papel, setPapel] = useState<Papel>("analista");
  const [setor, setSetor] = useState("");
  const [perfil, setPerfil] = useState(perfis.find((p) => p.nome === "Fiscal")?.id ?? "");
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const apps = perfis.find((p) => p.id === perfil)?.apps ?? { tarefas: "operar" };
    const { data, error } = await supabase().rpc("hub_convidar", {
      p_org: org.id,
      p_email: email,
      p_nome: nome,
      p_papel: papel,
      p_setor: setor || null,
      p_apps: apps,
    });
    if (error) return setErro(traduzirErro(error));
    aoConvidar(
      data === "convite"
        ? `Convite registrado. Peça para ${email} criar a conta em ${window.location.origin}/login com este e-mail; as ferramentas já estarão liberadas.`
        : `${nome || email} já tinha conta e recebeu acesso agora.`,
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={aoFechar}>
      <form onSubmit={enviar} onClick={(e) => e.stopPropagation()} className="cartao w-full max-w-md space-y-3 p-5">
        <h2 className="text-lg font-semibold text-[var(--marca)]">Convidar pessoa da equipe</h2>
        <label className="campo">
          <span>E-mail</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="campo">
          <span>Nome</span>
          <input required value={nome} onChange={(e) => setNome(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="campo">
            <span>Papel geral</span>
            <select value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
              {PAPEIS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Setor</span>
            <select value={setor} onChange={(e) => setSetor(e.target.value)}>
              <option value="">—</option>
              {setores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="campo">
          <span>Ferramentas (perfil)</span>
          <select value={perfil} onChange={(e) => setPerfil(e.target.value)}>
            <option value="">Só Tarefas</option>
            {perfis.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
        {erro && <p className="text-sm text-red-700">{erro}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn" onClick={aoFechar}>
            Cancelar
          </button>
          <button className="btn-primario">Convidar</button>
        </div>
      </form>
    </div>
  );
}
