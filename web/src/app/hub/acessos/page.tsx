"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useOrg } from "@/lib/org";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { fmtDataHora } from "@/lib/datas";
import { enviarConvite } from "@/lib/convite";
import { PAPEIS, PAPEIS_APP } from "@/lib/types";
import type { Membro, Papel, PapelApp } from "@/lib/types";

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
}
interface Perfil {
  id: string;
  nome: string;
  apps: Record<string, PapelApp>;
}
interface Conta {
  user_id: string;
  confirmado: boolean;
  ultimo_acesso: string | null;
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
type Aba = "pessoas" | "perfis" | "historico";

const COR_NIVEL: Record<PapelApp, string> = {
  ver: "bg-neutral-100 text-neutral-700",
  operar: "bg-sky-50 text-sky-800",
  gerir: "bg-[#F6EEDC] text-[#6B5220]",
};
const nomeNivel = (p: PapelApp) => PAPEIS_APP.find((x) => x.id === p)?.nome ?? p;

function Acessos() {
  const { org, papel, membros, setores, apps, nomeMembro, recarregar, recarregarApps } = useOrg();
  const [aba, setAba] = useState<Aba>("pessoas");
  const [acessos, setAcessos] = useState<Acesso[]>([]);
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [contas, setContas] = useState<Map<string, Conta>>(new Map());
  const [historico, setHistorico] = useState<Auditoria[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; link?: string } | null>(null);
  const [convite, setConvite] = useState(false);

  // ferramentas que um perfil pode liberar (o catálogo, menos as desligadas)
  const ferramentas = useMemo(() => apps.filter((a) => a.status !== "desligado"), [apps]);

  const carregar = useCallback(async () => {
    const sb = supabase();
    const [a, p, h, c] = await Promise.all([
      sb.from("hub_acessos").select("user_id,app,papel").eq("org_id", org.id),
      sb.from("hub_perfis").select("id,nome,apps").eq("org_id", org.id).order("nome"),
      sb.from("hub_auditoria").select("*").eq("org_id", org.id).order("em", { ascending: false }).limit(60),
      sb.rpc("hub_situacao_contas", { p_org: org.id }),
    ]);
    const falha = a.error ?? p.error ?? h.error ?? c.error;
    if (falha) setErro(traduzirErro(falha));
    if (a.error) return;
    setAcessos(a.data as Acesso[]);
    setPerfis((p.data as Perfil[]) ?? []);
    setHistorico((h.data as Auditoria[]) ?? []);
    setContas(new Map(((c.data as Conta[]) ?? []).map((x) => [x.user_id, x])));
  }, [org.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (papel !== "admin") return <p className="text-sm text-neutral-600">Apenas administradores gerenciam acessos.</p>;

  const avisar = (texto: string, link?: string) => {
    setErro(null);
    setAviso({ texto, link });
  };
  const falhar = (e: unknown) => {
    setAviso(null);
    setErro(traduzirErro(e));
  };
  const depois = async () => {
    await Promise.all([carregar(), recarregar()]);
    recarregarApps();
  };

  async function vincular(m: Membro, perfil: string) {
    const { error } = await supabase().rpc("hub_definir_perfil", { p_org: org.id, p_user: m.user_id, p_perfil: perfil || null });
    if (error) return falhar(error);
    avisar(perfil ? `${m.nome} agora segue o perfil ${perfis.find((p) => p.id === perfil)?.nome}.` : `${m.nome} passou a ter acesso manual.`);
    await depois();
  }

  async function definirManual(m: Membro, app: string, valor: string) {
    const { error } = await supabase().rpc("hub_definir_acesso", { p_org: org.id, p_user: m.user_id, p_app: app, p_papel: valor || null });
    if (error) return falhar(error);
    await depois();
  }

  async function reenviar(m: Membro) {
    if (!m.email) return;
    const r = await enviarConvite(m.email, m.nome);
    if (r.erro) return falhar(r.erro);
    avisar(r.enviado ? `Convite reenviado para ${m.email}.` : `O e-mail não pôde ser enviado agora. Repasse este link para ${m.nome}:`, r.link);
  }

  const ativos = membros.filter((m) => m.ativo);
  const usoPerfil = (id: string) => ativos.filter((m) => m.perfil_id === id).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--marca)]">Pessoas e acessos</h1>
          <p className="max-w-3xl text-sm text-neutral-600">
            O acesso é definido pelo <b>perfil</b>: ele diz quais ferramentas a pessoa vê e em que nível. Mudou o perfil, muda para todos que o
            seguem. A pessoa só enxerga no Hub o que o perfil libera. Administradores têm acesso total.
          </p>
        </div>
        <button className="btn-primario" onClick={() => setConvite(true)}>
          + Cadastrar pessoa
        </button>
      </div>

      <div className="flex gap-1 border-b border-[var(--borda)] text-sm">
        {(
          [
            ["pessoas", `Pessoas (${ativos.length})`],
            ["perfis", `Perfis (${perfis.length})`],
            ["historico", "Histórico"],
          ] as [Aba, string][]
        ).map(([id, nome]) => (
          <button
            key={id}
            onClick={() => setAba(id)}
            className={`-mb-px border-b-2 px-3 py-2 ${aba === id ? "border-[var(--marca)] font-medium text-[var(--marca)]" : "border-transparent text-neutral-600"}`}
          >
            {nome}
          </button>
        ))}
      </div>

      {erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{erro}</p>}
      {aviso && (
        <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">
          {aviso.texto}
          {aviso.link && <LinkCopiavel link={aviso.link} />}
        </div>
      )}

      {aba === "pessoas" && (
        <div className="cartao overflow-x-auto">
          <table className="tabela">
            <thead>
              <tr>
                <th>Pessoa</th>
                <th>Perfil</th>
                <th>Ferramentas liberadas</th>
                <th>Conta</th>
              </tr>
            </thead>
            <tbody>
              {ativos.map((m) => (
                <LinhaPessoa
                  key={m.user_id}
                  m={m}
                  perfis={perfis}
                  ferramentas={ferramentas}
                  acessos={acessos.filter((a) => a.user_id === m.user_id)}
                  conta={contas.get(m.user_id)}
                  aoVincular={(p) => vincular(m, p)}
                  aoDefinir={(app, v) => definirManual(m, app, v)}
                  aoReenviar={() => reenviar(m)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {aba === "perfis" && (
        <Perfis
          perfis={perfis}
          ferramentas={ferramentas}
          uso={usoPerfil}
          aoMudar={async (txt) => {
            avisar(txt);
            await depois();
          }}
          aoErro={falhar}
        />
      )}

      {aba === "historico" && (
        <section className="cartao p-4">
          {historico.length === 0 && <p className="text-sm text-neutral-500">Nenhuma alteração ainda.</p>}
          <ul className="space-y-1 text-sm">
            {historico.map((h) => (
              <li key={h.id} className="text-neutral-700">
                <span className="text-neutral-400">{fmtDataHora(h.em)}</span> · {nomeMembro(h.user_id)} {descrever(h, apps, perfis, nomeMembro)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {convite && (
        <Cadastro
          perfis={perfis}
          setores={setores}
          aoFechar={() => setConvite(false)}
          aoCadastrar={async (txt, link) => {
            avisar(txt, link);
            setConvite(false);
            setAba("pessoas");
            await depois();
          }}
        />
      )}
    </div>
  );
}

function descrever(h: Auditoria, apps: { slug: string; nome: string }[], perfis: Perfil[], nomeMembro: (id: string | null) => string) {
  const nomePerfil = (v: unknown) => (v ? perfis.find((p) => p.id === v)?.nome ?? "perfil removido" : "acesso manual");
  if (h.acao === "acesso") {
    const [app, user] = (h.alvo ?? "").split(":");
    const nomeApp = apps.find((a) => a.slug === app)?.nome ?? app;
    return h.depois ? `liberou ${nomeApp} (${String(h.depois)}) para ${nomeMembro(user ?? null)}` : `retirou ${nomeApp} de ${nomeMembro(user ?? null)}`;
  }
  if (h.acao === "vincular_perfil") return `colocou ${nomeMembro(h.alvo)} em ${nomePerfil(h.depois)}`;
  if (h.acao === "perfil") return `alterou o perfil ${h.alvo}`;
  if (h.acao === "convite") return `convidou ${h.alvo}`;
  return `${h.acao} ${h.alvo ?? ""}`;
}

function LinkCopiavel({ link }: { link: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="mt-2 flex gap-2">
      <input readOnly value={link} className="entrada flex-1 !min-h-8 text-xs" onFocus={(e) => e.target.select()} />
      <button
        className="btn !min-h-8"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            setCopiado(true);
          } catch {}
        }}
      >
        {copiado ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}

function Chips({ apps, ferramentas }: { apps: Record<string, PapelApp>; ferramentas: { slug: string; nome: string }[] }) {
  const itens = ferramentas.filter((f) => apps[f.slug]);
  if (!itens.length) return <span className="text-xs text-neutral-400">nenhuma</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {itens.map((f) => (
        <span key={f.slug} className={`chip ${COR_NIVEL[apps[f.slug]]}`} title={`${f.nome}: ${nomeNivel(apps[f.slug])}`}>
          {f.nome} · {nomeNivel(apps[f.slug])}
        </span>
      ))}
    </div>
  );
}

function LinhaPessoa({
  m,
  perfis,
  ferramentas,
  acessos,
  conta,
  aoVincular,
  aoDefinir,
  aoReenviar,
}: {
  m: Membro;
  perfis: Perfil[];
  ferramentas: { slug: string; nome: string }[];
  acessos: Acesso[];
  conta?: Conta;
  aoVincular: (perfil: string) => void;
  aoDefinir: (app: string, valor: string) => void;
  aoReenviar: () => void;
}) {
  const [ajustar, setAjustar] = useState(false);
  const admin = m.papel === "admin";
  const atuais = Object.fromEntries(acessos.map((a) => [a.app, a.papel])) as Record<string, PapelApp>;
  return (
    <tr className="align-top">
      <td>
        <div className="font-medium">{m.nome}</div>
        <div className="text-xs text-neutral-500">
          {PAPEIS.find((p) => p.id === m.papel)?.nome} · {m.email}
        </div>
      </td>
      <td>
        {admin ? (
          <span className="chip bg-[var(--marca)] text-[var(--destaque)]">Administrador</span>
        ) : (
          <select className="entrada !min-h-8 !py-1 text-sm" value={m.perfil_id ?? ""} onChange={(e) => aoVincular(e.target.value)} aria-label={`Perfil de ${m.nome}`}>
            <option value="">Manual (sem perfil)</option>
            {perfis.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        )}
      </td>
      <td>
        {admin ? (
          <span className="text-xs text-neutral-500">todas, nível Gerir</span>
        ) : (
          <>
            <Chips apps={atuais} ferramentas={ferramentas} />
            {!m.perfil_id && (
              <button className="btn-link mt-1 text-xs" onClick={() => setAjustar((x) => !x)}>
                {ajustar ? "Fechar ajuste" : "Ajustar manualmente"}
              </button>
            )}
            {ajustar && !m.perfil_id && (
              <div className="mt-2 grid gap-1 sm:grid-cols-2">
                {ferramentas.map((f) => (
                  <label key={f.slug} className="flex items-center justify-between gap-2 text-xs">
                    <span>{f.nome}</span>
                    <select className="entrada !min-h-7 !py-0.5 text-xs" value={atuais[f.slug] ?? ""} onChange={(e) => aoDefinir(f.slug, e.target.value)}>
                      <option value="">—</option>
                      {PAPEIS_APP.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            )}
          </>
        )}
      </td>
      <td className="whitespace-nowrap text-xs">
        {!conta ? (
          "—"
        ) : conta.confirmado ? (
          <span className="text-neutral-600" title="Último acesso">
            {conta.ultimo_acesso ? fmtDataHora(conta.ultimo_acesso) : "ativa"}
          </span>
        ) : (
          <div className="space-y-1">
            <span className="chip bg-amber-50 text-amber-900">Aguardando criar a senha</span>
            <button className="btn-link block" onClick={aoReenviar}>
              Reenviar convite
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

function Perfis({
  perfis,
  ferramentas,
  uso,
  aoMudar,
  aoErro,
}: {
  perfis: Perfil[];
  ferramentas: { slug: string; nome: string; status: string }[];
  uso: (id: string) => number;
  aoMudar: (txt: string) => Promise<void>;
  aoErro: (e: unknown) => void;
}) {
  const { org } = useOrg();
  const [editando, setEditando] = useState<Perfil | null>(null);

  async function salvar(p: Perfil) {
    const sb = supabase();
    const r = p.id
      ? await sb.from("hub_perfis").update({ nome: p.nome, apps: p.apps }).eq("id", p.id).select("id")
      : await sb.from("hub_perfis").insert({ org_id: org.id, nome: p.nome, apps: p.apps }).select("id");
    if (r.error) return aoErro(r.error);
    setEditando(null);
    await aoMudar(p.id ? `Perfil ${p.nome} salvo. ${uso(p.id)} pessoa(s) atualizada(s).` : `Perfil ${p.nome} criado.`);
  }

  async function excluir(p: Perfil) {
    const n = uso(p.id);
    if (!window.confirm(n ? `${n} pessoa(s) seguem ${p.nome} e passarão a ter acesso manual (mantêm o que têm hoje). Excluir o perfil?` : `Excluir o perfil ${p.nome}?`)) return;
    const { error } = await supabase().from("hub_perfis").delete().eq("id", p.id);
    if (error) return aoErro(error);
    await aoMudar(`Perfil ${p.nome} excluído.`);
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button className="btn" onClick={() => setEditando({ id: "", nome: "", apps: {} })}>
          + Novo perfil
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {perfis.map((p) => (
          <div key={p.id} className="cartao flex flex-col gap-2 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold text-[var(--marca)]">{p.nome}</div>
                <div className="text-xs text-neutral-500">{uso(p.id)} pessoa(s)</div>
              </div>
              <div className="flex gap-2 text-sm">
                <button className="btn-link" onClick={() => setEditando(structuredClone(p))}>
                  Editar
                </button>
                <button className="btn-link !text-[var(--perigo)]" onClick={() => excluir(p)}>
                  Excluir
                </button>
              </div>
            </div>
            <Chips apps={p.apps} ferramentas={ferramentas} />
          </div>
        ))}
      </div>
      {editando && <EditorPerfil perfil={editando} ferramentas={ferramentas} aoFechar={() => setEditando(null)} aoSalvar={salvar} />}
    </div>
  );
}

function EditorPerfil({
  perfil,
  ferramentas,
  aoFechar,
  aoSalvar,
}: {
  perfil: Perfil;
  ferramentas: { slug: string; nome: string; status: string }[];
  aoFechar: () => void;
  aoSalvar: (p: Perfil) => void;
}) {
  const [p, setP] = useState(perfil);
  const definir = (slug: string, v: string) =>
    setP((x) => {
      const apps = { ...x.apps };
      if (v) apps[slug] = v as PapelApp;
      else delete apps[slug];
      return { ...x, apps };
    });
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={aoFechar}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          aoSalvar(p);
        }}
        className="cartao max-h-[90vh] w-full max-w-lg space-y-3 overflow-y-auto p-5"
      >
        <h2 className="text-lg font-semibold text-[var(--marca)]">{perfil.id ? `Perfil ${perfil.nome}` : "Novo perfil"}</h2>
        <label className="campo">
          <span>Nome do perfil</span>
          <input required value={p.nome} onChange={(e) => setP({ ...p, nome: e.target.value })} placeholder="Ex.: Fiscal, Contábil, Estagiário" />
        </label>
        <div>
          <div className="mb-1 text-sm font-medium">Ferramentas liberadas</div>
          <div className="divide-y divide-[var(--borda)] rounded-lg border border-[var(--borda)]">
            {ferramentas.map((f) => (
              <div key={f.slug} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-sm">
                  {f.nome}
                  {f.status === "em_breve" && <span className="ml-1 text-xs text-neutral-400">(em construção)</span>}
                </span>
                <div className="flex rounded-md border border-[var(--borda)] p-0.5 text-xs">
                  {[{ id: "", nome: "Sem acesso" }, ...PAPEIS_APP].map((n) => (
                    <button
                      type="button"
                      key={n.id}
                      onClick={() => definir(f.slug, n.id)}
                      className={`rounded px-2 py-1 ${(p.apps[f.slug] ?? "") === n.id ? "bg-[var(--marca)] text-white" : "text-neutral-600"}`}
                    >
                      {n.nome}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-neutral-500">{PAPEIS_APP.map((x) => `${x.nome}: ${x.ajuda}`).join(" · ")}.</p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn" onClick={aoFechar}>
            Cancelar
          </button>
          <button className="btn-primario">Salvar perfil</button>
        </div>
      </form>
    </div>
  );
}

function Cadastro({
  perfis,
  setores,
  aoFechar,
  aoCadastrar,
}: {
  perfis: Perfil[];
  setores: { id: string; nome: string }[];
  aoFechar: () => void;
  aoCadastrar: (txt: string, link?: string) => void;
}) {
  const { org } = useOrg();
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [papel, setPapel] = useState<Papel>("analista");
  const [setor, setSetor] = useState("");
  const [perfil, setPerfil] = useState(perfis.find((p) => p.nome === "Fiscal")?.id ?? perfis[0]?.id ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const { data, error } = await supabase().rpc("hub_convidar", {
      p_org: org.id,
      p_email: email,
      p_nome: nome,
      p_papel: papel,
      p_setor: setor || null,
      p_perfil: papel === "admin" ? null : perfil || null,
    });
    if (error) {
      setEnviando(false);
      return setErro(traduzirErro(error));
    }
    if (data !== "convite") {
      setEnviando(false);
      return aoCadastrar(`${nome || email} já tinha conta no Hub e recebeu o acesso agora.`);
    }
    const r = await enviarConvite(email, nome);
    setEnviando(false);
    if (r.enviado) return aoCadastrar(`Convite enviado para ${email}. A pessoa recebe um e-mail com o link para criar a senha.`);
    aoCadastrar(
      `${nome || email} foi cadastrado, mas o e-mail não pôde ser enviado${r.erro ? ` (${r.erro})` : ""}. Repasse este link para a pessoa criar a senha:`,
      r.link,
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={aoFechar}>
      <form onSubmit={enviar} onClick={(e) => e.stopPropagation()} className="cartao w-full max-w-md space-y-3 p-5">
        <div>
          <h2 className="text-lg font-semibold text-[var(--marca)]">Cadastrar pessoa da equipe</h2>
          <p className="text-sm text-neutral-600">A pessoa recebe um e-mail e cria a própria senha. Você não precisa definir senha.</p>
        </div>
        <label className="campo">
          <span>Nome</span>
          <input required value={nome} onChange={(e) => setNome(e.target.value)} />
        </label>
        <label className="campo">
          <span>E-mail</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="campo">
            <span>Papel nas tarefas</span>
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
        {papel !== "admin" ? (
          <label className="campo">
            <span>Perfil de acesso (define as ferramentas)</span>
            <select required value={perfil} onChange={(e) => setPerfil(e.target.value)}>
              <option value="" disabled>
                Escolha…
              </option>
              {perfis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-xs text-neutral-500">Administradores acessam todas as ferramentas.</p>
        )}
        {erro && <p className="text-sm text-red-700">{erro}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn" onClick={aoFechar}>
            Cancelar
          </button>
          <button className="btn-primario" disabled={enviando}>
            {enviando ? "Enviando…" : "Cadastrar e enviar convite"}
          </button>
        </div>
      </form>
    </div>
  );
}
