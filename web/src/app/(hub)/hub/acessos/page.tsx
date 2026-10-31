// Tela Pessoas e acessos (só administrador): equipe, perfis, acessos de clientes ao Portal e histórico.
// Os pedaços de tela ficam em _componentes/; tipos e regras em src/dominios/acessos e src/dominios/portal.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { enviarConvite } from "@/dominios/acessos/convite";
import type { Membro, Papel } from "@/dominios/organizacao/tipos";
import { fmtDataHora } from "@/lib/formato/datas";
import type { Acesso, Auditoria, Conta, Perfil } from "@/dominios/acessos/tipos";
import { ADMIN } from "./_componentes/niveis";
import { LinkCopiavel } from "./_componentes/LinkCopiavel";
import { LinhaPessoa } from "./_componentes/LinhaPessoa";
import { Perfis } from "./_componentes/Perfis";
import { Cadastro } from "./_componentes/Cadastro";
import { EditarPessoa } from "./_componentes/EditarPessoa";
import { TransferirTrabalho } from "./_componentes/TransferirTrabalho";
import { AcessosClientes } from "@/dominios/portal/componentes/AcessosClientes";
import { descrever } from "@/dominios/acessos/auditoria";

export default function PaginaAcessos() {
  return <Acessos />;
}

type Aba = "pessoas" | "clientes" | "perfis" | "historico";

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
