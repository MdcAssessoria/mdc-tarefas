"use client";

import { useCallback, useEffect, useEffectEvent, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useOrg } from "@/lib/org";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { enviarConvite } from "@/lib/convite";
import { PAPEIS, PAPEIS_APP } from "@/lib/types";
import type { Membro, Papel, PapelApp } from "@/lib/types";
import { fmtDataHora } from "@/lib/formato/datas";
import { nomeCliente } from "@/lib/clientes";

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
type Aba = "pessoas" | "clientes" | "perfis" | "historico";

const COR_NIVEL: Record<PapelApp, string> = {
  ver: "bg-neutral-100 text-neutral-700",
  operar: "bg-sky-50 text-sky-800",
  gerir: "bg-[#F6EEDC] text-[#6B5220]",
};
const ADMIN = "__admin";
const nomeNivel = (p: PapelApp) => PAPEIS_APP.find((x) => x.id === p)?.nome ?? p;

function Acessos() {
  const { org, papel, eu, membros, setores, apps, nomeMembro, recarregar, recarregarApps } = useOrg();
  const [aba, setAba] = useState<Aba>("pessoas");
  const [acessos, setAcessos] = useState<Acesso[]>([]);
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [contas, setContas] = useState<Map<string, Conta>>(new Map());
  const [historico, setHistorico] = useState<Auditoria[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; link?: string } | null>(null);
  const [convite, setConvite] = useState(false);
  const [editando, setEditando] = useState<Membro | null>(null);
  const [transferir, setTransferir] = useState<{ m: Membro; inativar: boolean } | null>(null);

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
    void carregar();
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
    void recarregarApps();
  };

  async function salvarMembro(
    m: Membro,
    campos: { nome?: string; papel?: Papel; setor?: string | null; perfil?: string | null; ativo?: boolean },
    texto: string,
  ) {
    const papelNovo = campos.papel ?? m.papel;
    const { error } = await supabase().rpc("hub_editar_membro", {
      p_org: org.id,
      p_user: m.user_id,
      p_nome: campos.nome ?? m.nome,
      p_papel: papelNovo,
      p_setor: campos.setor !== undefined ? campos.setor : m.setor_id,
      p_perfil: papelNovo === "admin" ? null : campos.perfil !== undefined ? campos.perfil : (m.perfil_id ?? null),
      p_ativo: campos.ativo ?? m.ativo,
    });
    if (error) return falhar(error);
    avisar(texto);
    await depois();
  }

  async function vincular(m: Membro, valor: string) {
    if (valor === ADMIN) {
      if (!window.confirm(`${m.nome} passará a ser Administrador, com acesso total ao Hub, inclusive a esta tela. Confirmar?`)) return;
      return salvarMembro(m, { papel: "admin" }, `${m.nome} agora é Administrador.`);
    }
    if (m.papel === "admin")
      return salvarMembro(
        m,
        { papel: "analista", perfil: valor || null },
        `${m.nome} deixou de ser Administrador e segue o perfil ${perfis.find((p) => p.id === valor)?.nome}.`,
      );
    const { error } = await supabase().rpc("hub_definir_perfil", { p_org: org.id, p_user: m.user_id, p_perfil: valor || null });
    if (error) return falhar(error);
    avisar(valor ? `${m.nome} agora segue o perfil ${perfis.find((p) => p.id === valor)?.nome}.` : `${m.nome} passou a ter acesso manual.`);
    await depois();
  }

  async function inativar(m: Membro, pendente: boolean) {
    if (pendente) {
      if (!window.confirm(`Cancelar o convite de ${m.nome}? O link enviado deixa de dar acesso.`)) return;
      return salvarMembro(m, { ativo: false }, `Convite de ${m.nome} cancelado.`);
    }
    // inativar passa pela tela de transferência: quem tem trabalho em aberto precisa passá-lo adiante
    setTransferir({ m, inativar: true });
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
    avisar(
      r.enviado ? `Convite reenviado para ${m.email}.` : `O e-mail não pôde ser enviado agora. Repasse este link para ${m.nome}:`,
      r.link,
    );
  }

  const ativos = membros.filter((m) => m.ativo);
  const inativos = membros.filter((m) => !m.ativo && m.papel !== "tv");
  const usoPerfil = (id: string) => ativos.filter((m) => m.perfil_id === id).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--marca)]">Pessoas e acessos</h1>
          <p className="max-w-3xl text-sm text-neutral-600">
            O acesso é definido pelo <b>perfil</b>: ele diz quais ferramentas a pessoa vê e em que nível. Mudou o perfil, muda para todos
            que o seguem. A pessoa só enxerga no Hub o que o perfil libera. Administradores têm acesso total.
          </p>
        </div>
        <button className="btn-primario" onClick={() => setConvite(true)}>
          + Cadastrar pessoa
        </button>
      </div>

      <div className="flex gap-1 border-b border-[var(--borda)] text-sm">
        {(
          [
            ["pessoas", `Equipe MDC (${ativos.length})`],
            ["clientes", "Clientes (portal)"],
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
                <th></th>
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
                  aoEditar={() => setEditando(m)}
                  aoInativar={(pendente) => inativar(m, pendente)}
                  aoTransferir={() => setTransferir({ m, inativar: false })}
                  souEu={m.user_id === eu.user_id}
                />
              ))}
            </tbody>
          </table>
          {inativos.length > 0 && (
            <details className="border-t border-[var(--borda)] px-4 py-3 text-sm">
              <summary className="cursor-pointer text-neutral-600">Inativos ({inativos.length})</summary>
              <ul className="mt-2 divide-y divide-[var(--borda)]">
                {inativos.map((m) => (
                  <li key={m.user_id} className="flex items-center justify-between gap-3 py-2">
                    <span>
                      <span className="font-medium text-neutral-700">{m.nome}</span>{" "}
                      <span className="text-xs text-neutral-500">{m.email}</span>
                    </span>
                    <button className="btn !min-h-8" onClick={() => setEditando(m)}>
                      Reativar
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {aba === "clientes" && <AcessosClientes aoAviso={avisar} aoErro={falhar} />}

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
                <span className="text-neutral-400">{fmtDataHora(h.em)}</span> · {nomeMembro(h.user_id)}{" "}
                {descrever(h, apps, perfis, nomeMembro)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {transferir && (
        <TransferirTrabalho
          m={transferir.m}
          inativar={transferir.inativar}
          destinos={ativos.filter((x) => x.user_id !== transferir.m.user_id && x.papel !== "tv")}
          aoFechar={() => setTransferir(null)}
          aoConcluir={async (texto) => {
            setTransferir(null);
            avisar(texto);
            await depois();
          }}
          aoErro={falhar}
        />
      )}

      {editando && (
        <EditarPessoa
          m={editando}
          perfis={perfis}
          setores={setores}
          souEu={editando.user_id === eu.user_id}
          aoFechar={() => setEditando(null)}
          aoSalvar={async (campos) => {
            const m = editando;
            setEditando(null);
            await salvarMembro(m, campos, m.ativo ? `Dados de ${campos.nome ?? m.nome} salvos.` : `${m.nome} foi reativado.`);
          }}
        />
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
  const nomePerfil = (v: unknown) => (v ? (perfis.find((p) => p.id === v)?.nome ?? "perfil removido") : "acesso manual");
  if (h.acao === "acesso") {
    const [app, user] = (h.alvo ?? "").split(":");
    const nomeApp = apps.find((a) => a.slug === app)?.nome ?? app;
    return h.depois
      ? `liberou ${nomeApp} (${String(h.depois)}) para ${nomeMembro(user ?? null)}`
      : `retirou ${nomeApp} de ${nomeMembro(user ?? null)}`;
  }
  if (h.acao === "vincular_perfil") return `colocou ${nomeMembro(h.alvo)} em ${nomePerfil(h.depois)}`;
  if (h.acao === "perfil") return `alterou o perfil ${h.alvo}`;
  if (h.acao === "convite") return `convidou ${h.alvo}`;
  if (h.acao === "transferir_trabalho") {
    const d = (h.depois ?? {}) as Record<string, string | number>;
    return `transferiu ${d.tarefas ?? 0} tarefa(s) de ${nomeMembro(h.alvo)} para ${nomeMembro(String(d.para ?? ""))}`;
  }
  if (h.acao === "inativar") return `inativou ${nomeMembro(h.alvo)}`;
  if (h.acao === "reativar") return `reativou ${nomeMembro(h.alvo)}`;
  if (h.acao === "editar_pessoa") return `editou os dados de ${nomeMembro(h.alvo)}`;
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
  aoEditar,
  aoInativar,
  aoTransferir,
  souEu,
}: {
  m: Membro;
  perfis: Perfil[];
  ferramentas: { slug: string; nome: string }[];
  acessos: Acesso[];
  conta?: Conta;
  aoVincular: (perfil: string) => void;
  aoDefinir: (app: string, valor: string) => void;
  aoReenviar: () => void;
  aoEditar: () => void;
  aoInativar: (pendente: boolean) => void;
  aoTransferir: () => void;
  souEu: boolean;
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
        {souEu ? (
          <span className="chip bg-[var(--marca)] text-[var(--destaque)]" title="Você não pode mudar o seu próprio perfil">
            Administrador (você)
          </span>
        ) : (
          <select
            className={`entrada !min-h-8 !py-1 text-sm ${admin ? "font-semibold text-[var(--marca)]" : ""}`}
            value={admin ? ADMIN : (m.perfil_id ?? "")}
            onChange={(e) => aoVincular(e.target.value)}
            aria-label={`Perfil de ${m.nome}`}
          >
            <option value={ADMIN}>Administrador (acesso total)</option>
            {!admin && <option value="">Manual (sem perfil)</option>}
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
                    <select
                      className="entrada !min-h-7 !py-0.5 text-xs"
                      value={atuais[f.slug] ?? ""}
                      onChange={(e) => aoDefinir(f.slug, e.target.value)}
                    >
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
      <td className="whitespace-nowrap text-right">
        <button className="btn-link mr-3 text-sm" onClick={aoEditar}>
          Editar
        </button>
        <button
          className="btn-link mr-3 text-sm"
          onClick={aoTransferir}
          title="Passar tarefas, carteira e demais itens em aberto para outra pessoa"
        >
          Transferir
        </button>
        {!souEu && (
          <button className="btn-link text-sm !text-[var(--perigo)]" onClick={() => aoInativar(!!conta && !conta.confirmado)}>
            {conta && !conta.confirmado ? "Cancelar convite" : "Inativar"}
          </button>
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
    if (
      !window.confirm(
        n
          ? `${n} pessoa(s) seguem ${p.nome} e passarão a ter acesso manual (mantêm o que têm hoje). Excluir o perfil?`
          : `Excluir o perfil ${p.nome}?`,
      )
    )
      return;
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
          <input
            required
            value={p.nome}
            onChange={(e) => setP({ ...p, nome: e.target.value })}
            placeholder="Ex.: Fiscal, Contábil, Estagiário"
          />
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

function EditarPessoa({
  m,
  perfis,
  setores,
  souEu,
  aoFechar,
  aoSalvar,
}: {
  m: Membro;
  perfis: Perfil[];
  setores: { id: string; nome: string }[];
  souEu: boolean;
  aoFechar: () => void;
  aoSalvar: (c: { nome: string; papel: Papel; setor: string | null; perfil: string | null; ativo: boolean }) => void;
}) {
  const [nome, setNome] = useState(m.nome);
  const [papel, setPapel] = useState<Papel>(m.papel);
  const [setor, setSetor] = useState(m.setor_id ?? "");
  const [perfil, setPerfil] = useState(m.perfil_id ?? "");
  const reativando = !m.ativo;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={aoFechar}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          aoSalvar({ nome, papel, setor: setor || null, perfil: papel === "admin" ? null : perfil || null, ativo: true });
        }}
        className="cartao w-full max-w-md space-y-3 p-5"
      >
        <div>
          <h2 className="text-lg font-semibold text-[var(--marca)]">{reativando ? `Reativar ${m.nome}` : `Editar ${m.nome}`}</h2>
          <p className="text-xs text-neutral-500">{m.email}</p>
        </div>
        <label className="campo">
          <span>Nome</span>
          <input required value={nome} onChange={(e) => setNome(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="campo">
            <span>Papel nas tarefas</span>
            <select value={papel} disabled={souEu} onChange={(e) => setPapel(e.target.value as Papel)}>
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
              {setores.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nome}
                </option>
              ))}
            </select>
          </label>
        </div>
        {papel === "admin" ? (
          <p className="rounded-md bg-[var(--fundo)] p-2 text-xs text-neutral-600">
            Administrador acessa todas as ferramentas e esta tela de acessos.
          </p>
        ) : (
          <label className="campo">
            <span>Perfil de acesso</span>
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
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn" onClick={aoFechar}>
            Cancelar
          </button>
          <button className="btn-primario">{reativando ? "Reativar" : "Salvar"}</button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------- clientes (Portal do Cliente)
const PERMISSOES_PORTAL = [
  { id: "demonstrativos", nome: "Demonstrativos e parecer" },
  { id: "rotinas", nome: "Rotinas do mês" },
  { id: "chat", nome: "Chat com a MDC" },
  { id: "documentos", nome: "Documentos e vencimentos" },
  { id: "societario", nome: "Processos societários" },
  { id: "folha", nome: "Folha (DP)" },
];
// perfis de cliente prontos: o que cada função costuma ver no portal
const PERFIS_CLIENTE: { id: string; nome: string; perms: string[] }[] = [
  { id: "socio", nome: "Sócio / diretor (tudo)", perms: PERMISSOES_PORTAL.map((p) => p.id) },
  { id: "financeiro", nome: "Financeiro", perms: ["demonstrativos", "rotinas", "chat", "documentos"] },
  { id: "rh", nome: "RH / Departamento Pessoal", perms: ["folha", "rotinas", "chat", "documentos"] },
  { id: "consulta", nome: "Só consulta de demonstrativos", perms: ["demonstrativos"] },
];
const perfilDasPerms = (perms: string[]) =>
  PERFIS_CLIENTE.find((p) => p.perms.length === perms.length && p.perms.every((x) => perms.includes(x)))?.nome ?? "Personalizado";

interface VinculoCliente {
  user_id: string | null; // null = convite ainda não aceito
  cliente_id: string;
  nome: string | null;
  email: string;
  permissoes: string[];
  ativo: boolean;
}

function AcessosClientes({ aoAviso, aoErro }: { aoAviso: (t: string, link?: string) => void; aoErro: (e: unknown) => void }) {
  const { org, clientes, clientePorId } = useOrg();
  const [vinculos, setVinculos] = useState<VinculoCliente[]>([]);
  const [novo, setNovo] = useState(false);
  const [editar, setEditar] = useState<string | null>(null); // e-mail
  const [busca, setBusca] = useState("");
  const [erroLista, setErroLista] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const sb = supabase();
    const [u, c] = await Promise.all([
      sb.from("portal_usuarios").select("user_id,cliente_id,nome,email,permissoes,ativo").eq("org_id", org.id),
      sb.from("portal_convites").select("cliente_id,nome,email,permissoes").eq("org_id", org.id),
    ]);
    if (u.error) return setErroLista(traduzirErro(u.error));
    setErroLista(null);
    setVinculos([
      ...((u.data as VinculoCliente[]) ?? []),
      ...((c.data as Omit<VinculoCliente, "user_id" | "ativo">[]) ?? []).map((x) => ({ ...x, user_id: null, ativo: true })),
    ]);
  }, [org.id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const nomeCli = useCallback(
    (id: string) => {
      const c = clientePorId(id);
      return nomeCliente(c, "—");
    },
    [clientePorId],
  );
  const pessoas = useMemo(() => {
    const m = new Map<string, VinculoCliente[]>();
    for (const v of vinculos) m.set(v.email, [...(m.get(v.email) ?? []), v]);
    const q = busca.trim().toLowerCase();
    return [...m.entries()]
      .map(([email, vs]) => ({ email, nome: vs.find((x) => x.nome)?.nome ?? email, vs }))
      .filter((p) => !q || `${p.nome} ${p.email} ${p.vs.map((v) => nomeCli(v.cliente_id)).join(" ")}`.toLowerCase().includes(q))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [vinculos, busca, nomeCli]);

  const pessoaEditada = pessoas.find((p) => p.email === editar) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-sm text-neutral-600">
          Cada pessoa do cliente entra com o próprio e-mail e vê <b>só as empresas vinculadas</b> a ela, com o perfil de cliente escolhido
          (o que pode ver no portal). Um sócio de um grupo pode ter várias empresas.
        </p>
        <div className="flex gap-2">
          <input className="entrada w-56" placeholder="Buscar pessoa ou empresa" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <button className="btn-primario" onClick={() => setNovo(true)}>
            + Acesso de cliente
          </button>
        </div>
      </div>
      {erroLista && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{erroLista}</p>}
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead>
            <tr>
              <th>Pessoa do cliente</th>
              <th>Empresas vinculadas</th>
              <th>Perfil de cliente</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pessoas.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-sm text-neutral-500">
                  Nenhum acesso de cliente ainda.
                </td>
              </tr>
            )}
            {pessoas.map((p) => {
              const ativos = p.vs.filter((v) => v.ativo);
              const pendente = p.vs.every((v) => !v.user_id);
              return (
                <tr key={p.email} className={`align-top ${ativos.length ? "" : "opacity-50"}`}>
                  <td>
                    <div className="font-medium">{p.nome}</div>
                    <div className="text-xs text-neutral-500">{p.email}</div>
                    {pendente && <span className="chip mt-1 bg-amber-50 text-amber-900">Aguardando criar a senha</span>}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {p.vs.map((v) => (
                        <span
                          key={v.cliente_id}
                          className={`chip ${v.ativo ? "bg-[var(--fundo)] text-neutral-700" : "bg-neutral-100 text-neutral-400 line-through"}`}
                        >
                          {nomeCli(v.cliente_id)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="text-sm">{perfilDasPerms(p.vs[0]?.permissoes ?? [])}</td>
                  <td className="whitespace-nowrap text-right">
                    <button className="btn-link text-sm" onClick={() => setEditar(p.email)}>
                      Editar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {(novo || pessoaEditada) && (
        <EditorCliente
          pessoa={pessoaEditada}
          clientes={clientes.filter((c) => c.ativo)}
          nomeCli={nomeCli}
          aoFechar={() => {
            setNovo(false);
            setEditar(null);
          }}
          aoSalvar={async (t, link) => {
            setNovo(false);
            setEditar(null);
            aoAviso(t, link);
            await carregar();
          }}
          aoErro={aoErro}
          orgId={org.id}
        />
      )}
    </div>
  );
}

function EditorCliente({
  pessoa,
  clientes,
  nomeCli,
  aoFechar,
  aoSalvar,
  aoErro,
  orgId,
}: {
  pessoa: { email: string; nome: string; vs: VinculoCliente[] } | null;
  clientes: { id: string; razao_social: string; nome_fantasia: string | null; cnpj: string | null }[];
  nomeCli: (id: string) => string;
  aoFechar: () => void;
  aoSalvar: (t: string, link?: string) => void;
  aoErro: (e: unknown) => void;
  orgId: string;
}) {
  const [nome, setNome] = useState(pessoa?.nome ?? "");
  const [email, setEmail] = useState(pessoa?.email ?? "");
  const [empresas, setEmpresas] = useState<string[]>(pessoa ? pessoa.vs.filter((v) => v.ativo).map((v) => v.cliente_id) : []);
  const [perms, setPerms] = useState<string[]>(pessoa?.vs[0]?.permissoes ?? PERFIS_CLIENTE[0].perms);
  const [busca, setBusca] = useState("");
  const [enviando, setEnviando] = useState(false);

  const q = busca.trim().toLowerCase();
  const lista = clientes
    .filter((c) => !q || `${c.razao_social} ${c.nome_fantasia ?? ""} ${c.cnpj ?? ""}`.toLowerCase().includes(q))
    .slice(0, 80);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!empresas.length && !pessoa) return aoErro("Escolha ao menos uma empresa.");
    if (!perms.length) return aoErro("Marque ao menos uma área do portal.");
    setEnviando(true);
    const sb = supabase();
    try {
      const antes = new Map((pessoa?.vs ?? []).map((v) => [v.cliente_id, v]));
      // novas empresas ou reativadas: portal_convidar cria o vínculo (ou o convite, se a pessoa ainda não tem conta)
      let houveConvite = false;
      for (const cli of empresas) {
        const v = antes.get(cli);
        if (v && v.ativo && v.permissoes.join() === perms.join() && (v.nome ?? "") === nome) continue;
        const { data, error } = await sb.rpc("portal_convidar", { p_cliente: cli, p_email: email, p_nome: nome, p_permissoes: perms });
        if (error) throw error;
        if (data === "convite") houveConvite = true;
      }
      // empresas desmarcadas: vínculo inativado (conta) ou convite cancelado
      for (const [cli, v] of antes) {
        if (empresas.includes(cli)) continue;
        if (v.user_id) {
          const { error } = await sb
            .from("portal_usuarios")
            .update({ ativo: false })
            .eq("user_id", v.user_id)
            .eq("cliente_id", cli)
            .eq("org_id", orgId);
          if (error) throw error;
        } else {
          const { error } = await sb.from("portal_convites").delete().eq("email", v.email).eq("cliente_id", cli).eq("org_id", orgId);
          if (error) throw error;
        }
      }
      const novaConta = houveConvite && !(pessoa?.vs.some((v) => v.user_id) ?? false);
      if (novaConta) {
        const r = await enviarConvite(email, nome);
        setEnviando(false);
        if (r.enviado)
          return aoSalvar(
            `Convite enviado para ${email}. A pessoa cria a senha pelo e-mail e já entra vendo ${empresas.length} empresa(s).`,
          );
        return aoSalvar(`Acesso cadastrado, mas o e-mail não pôde ser enviado${r.erro ? ` (${r.erro})` : ""}. Repasse este link:`, r.link);
      }
      setEnviando(false);
      aoSalvar(
        empresas.length
          ? `Acesso de ${nome || email} salvo: ${empresas.length} empresa(s).`
          : `Acesso de ${nome || email} removido de todas as empresas.`,
      );
    } catch (err) {
      setEnviando(false);
      aoErro(err);
    }
  }

  const alternar = (id: string) => setEmpresas((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={aoFechar}>
      <form
        onSubmit={salvar}
        onClick={(e) => e.stopPropagation()}
        className="cartao max-h-[92vh] w-full max-w-2xl space-y-3 overflow-y-auto p-5"
      >
        <h2 className="text-lg font-semibold text-[var(--marca)]">{pessoa ? `Acesso de ${pessoa.nome}` : "Novo acesso de cliente"}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="campo">
            <span>Nome</span>
            <input required value={nome} onChange={(e) => setNome(e.target.value)} />
          </label>
          <label className="campo">
            <span>E-mail</span>
            <input type="email" required disabled={!!pessoa} value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
        </div>

        <div>
          <div className="mb-1 text-sm font-medium">Perfil de cliente</div>
          <div className="flex flex-wrap gap-1">
            {PERFIS_CLIENTE.map((p) => {
              const ativo = perfilDasPerms(perms) === p.nome;
              return (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setPerms(p.perms)}
                  className={`chip border py-1.5 text-sm ${ativo ? "border-[var(--marca)] bg-[var(--marca)] text-white" : "border-[var(--borda)] bg-white"}`}
                >
                  {p.nome}
                </button>
              );
            })}
          </div>
          <div className="mt-2 grid gap-1 sm:grid-cols-3">
            {PERMISSOES_PORTAL.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--marca)]"
                  checked={perms.includes(p.id)}
                  onChange={(e) => setPerms((x) => (e.target.checked ? [...x, p.id] : x.filter((y) => y !== p.id)))}
                />
                {p.nome}
              </label>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-sm font-medium">Empresas vinculadas ({empresas.length})</span>
            <input
              className="entrada !min-h-8 w-56 text-sm"
              placeholder="Buscar empresa ou CNPJ"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          {empresas.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1">
              {empresas.map((id) => (
                <button
                  type="button"
                  key={id}
                  className="chip bg-[var(--fundo)] text-neutral-700"
                  onClick={() => alternar(id)}
                  title="Remover"
                >
                  {nomeCli(id)} ✕
                </button>
              ))}
            </div>
          )}
          <div className="max-h-56 overflow-y-auto rounded-lg border border-[var(--borda)]">
            {lista.map((c) => (
              <label
                key={c.id}
                className="flex cursor-pointer items-center gap-2 border-b border-[var(--borda)] px-3 py-1.5 text-sm last:border-0 hover:bg-[var(--fundo)]"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--marca)]"
                  checked={empresas.includes(c.id)}
                  onChange={() => alternar(c.id)}
                />
                <span className="truncate">{nomeCliente(c)}</span>
                {c.cnpj && <span className="ml-auto shrink-0 text-xs text-neutral-400">{c.cnpj}</span>}
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn" onClick={aoFechar}>
            Cancelar
          </button>
          <button className="btn-primario" disabled={enviando}>
            {enviando ? "Salvando…" : pessoa ? "Salvar" : "Cadastrar e enviar convite"}
          </button>
        </div>
      </form>
    </div>
  );
}

const ROTULO_PENDENCIA: Record<string, string> = {
  tarefas: "tarefas em aberto",
  carteira: "clientes na carteira (responsável por setor)",
  processos: "processos societários",
  fases: "fases de processos",
  atendimentos: "atendimentos do portal",
  vencimentos: "vencimentos acompanhados",
  oportunidades: "oportunidades no CRM",
};

function TransferirTrabalho({
  m,
  inativar,
  destinos,
  aoFechar,
  aoConcluir,
  aoErro,
}: {
  m: Membro;
  inativar: boolean;
  destinos: Membro[];
  aoFechar: () => void;
  aoConcluir: (texto: string) => void;
  aoErro: (e: unknown) => void;
}) {
  const { org } = useOrg();
  const [pend, setPend] = useState<Record<string, number> | null>(null);
  const [para, setPara] = useState("");
  const [carteira, setCarteira] = useState(true);
  const [enviando, setEnviando] = useState(false);

  // aoErro muda a cada render do pai; useEffectEvent evita refazer a consulta por causa disso
  const avisarErro = useEffectEvent(aoErro);
  useEffect(() => {
    void supabase()
      .rpc("hub_pendencias_membro", { p_org: org.id, p_user: m.user_id })
      .then(({ data, error }) => (error ? avisarErro(error) : setPend(data as Record<string, number>)));
  }, [org.id, m.user_id]);

  const total = pend ? Object.values(pend).reduce((a, b) => a + Number(b), 0) : 0;
  const itens = pend ? Object.entries(pend).filter(([, v]) => Number(v) > 0) : [];

  async function concluir() {
    setEnviando(true);
    const sb = supabase();
    let texto = "";
    if (total > 0) {
      const { data, error } = await sb.rpc("hub_transferir_trabalho", {
        p_org: org.id,
        p_de: m.user_id,
        p_para: para,
        p_carteira: carteira,
      });
      if (error) {
        setEnviando(false);
        return aoErro(error);
      }
      const r = data as Record<string, number>;
      const destino = destinos.find((d) => d.user_id === para)?.nome ?? "";
      texto = `${r.tarefas ?? 0} tarefa(s)${carteira ? `, ${r.carteira ?? 0} cliente(s) da carteira` : ""} e demais itens passaram de ${m.nome} para ${destino}.`;
    }
    if (inativar) {
      const { error } = await sb.rpc("hub_editar_membro", {
        p_org: org.id,
        p_user: m.user_id,
        p_nome: m.nome,
        p_papel: m.papel,
        p_setor: m.setor_id,
        p_perfil: m.perfil_id ?? null,
        p_ativo: false,
      });
      if (error) {
        setEnviando(false);
        return aoErro(error);
      }
      texto = `${texto ? texto + " " : ""}${m.nome} foi inativado.`;
    }
    setEnviando(false);
    aoConcluir(texto || "Nada a transferir.");
  }

  const precisaDestino = total > 0;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={aoFechar}>
      <div onClick={(e) => e.stopPropagation()} className="cartao w-full max-w-md space-y-4 p-5">
        <div>
          <h2 className="text-lg font-semibold text-[var(--marca)]">
            {inativar ? `Inativar ${m.nome}` : `Transferir trabalho de ${m.nome}`}
          </h2>
          <p className="text-sm text-neutral-600">
            {inativar
              ? "Antes de inativar, todo o trabalho em aberto passa para outra pessoa. O histórico fica guardado."
              : "Passa tudo o que está em aberto com esta pessoa para outra, de uma vez."}
          </p>
        </div>
        {!pend ? (
          <p className="text-sm text-neutral-500">Verificando o que está com {m.nome}…</p>
        ) : total === 0 ? (
          <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">Nenhum trabalho em aberto com {m.nome}.</p>
        ) : (
          <>
            <ul className="divide-y divide-[var(--borda)] rounded-lg border border-[var(--borda)] text-sm">
              {itens.map(([k, v]) => (
                <li key={k} className="flex justify-between px-3 py-2">
                  <span>{ROTULO_PENDENCIA[k] ?? k}</span>
                  <b className="tabular-nums text-[var(--marca)]">{v}</b>
                </li>
              ))}
            </ul>
            <label className="campo">
              <span>Passar para</span>
              <select value={para} onChange={(e) => setPara(e.target.value)}>
                <option value="">Escolha a pessoa…</option>
                {destinos.map((d) => (
                  <option key={d.user_id} value={d.user_id}>
                    {d.nome}
                  </option>
                ))}
              </select>
            </label>
            {Number(pend.carteira) > 0 && (
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-[var(--marca)]"
                  checked={carteira}
                  onChange={(e) => setCarteira(e.target.checked)}
                />
                <span>Transferir também a carteira de clientes (as próximas rotinas já nascem com a nova pessoa)</span>
              </label>
            )}
            {inativar && !carteira && Number(pend.carteira) > 0 && (
              <p className="text-xs text-[var(--perigo)]">Para inativar, a carteira também precisa ser transferida.</p>
            )}
          </>
        )}
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={aoFechar}>
            Cancelar
          </button>
          <button
            className={inativar ? "btn-primario !bg-[var(--perigo)]" : "btn-primario"}
            disabled={
              !pend ||
              enviando ||
              (precisaDestino && !para) ||
              (inativar && !carteira && Number(pend?.carteira) > 0) ||
              (!inativar && total === 0)
            }
            onClick={concluir}
          >
            {enviando ? "Aguarde…" : inativar ? (total > 0 ? "Transferir e inativar" : "Inativar") : "Transferir"}
          </button>
        </div>
      </div>
    </div>
  );
}
