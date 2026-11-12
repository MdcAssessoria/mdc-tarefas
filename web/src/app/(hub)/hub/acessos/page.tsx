// Tela Pessoas e acessos (só administrador): equipe, perfis, acessos de clientes ao Portal e histórico.
// Os pedaços de tela ficam em _componentes/; tipos e regras em src/dominios/acessos e src/dominios/portal.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { supabase } from "@/lib/supabase";
import { caminho } from "@/lib/caminho";
import { traduzirErro } from "@/lib/erros";
import { gerarSenhaProvisoria, type SenhaGerada } from "@/dominios/acessos/convite";
import type { Membro, Papel } from "@/dominios/organizacao/tipos";
import { fmtDataHora } from "@/lib/formato/datas";
import type { Acesso, Auditoria, Conta, Perfil } from "@/dominios/acessos/tipos";
import type { Json } from "@/lib/database.types";
import { ADMIN } from "./_componentes/niveis";
import { SenhaCopiavel } from "./_componentes/SenhaCopiavel";
import { LinhaPessoa } from "./_componentes/LinhaPessoa";
import { ConvitesAguardando, type ConviteAguardando } from "./_componentes/ConvitesAguardando";
import { Perfis } from "./_componentes/Perfis";
import { Cadastro } from "./_componentes/Cadastro";
import { EditarPessoa } from "./_componentes/EditarPessoa";
import { TransferirTrabalho } from "./_componentes/TransferirTrabalho";
import { AcessosClientes } from "@/dominios/portal/componentes/AcessosClientes";
import { descrever } from "@/dominios/acessos/auditoria";
import { useConfirmar } from "@/components/ui/JanelaConfirmar";
import { Abas } from "@/components/ui/Abas";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { hojeISO } from "@/lib/datas";
import { PAPEIS } from "@/dominios/organizacao/tipos";
import { Icone } from "@/components/ui/Icone";

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
  const [aguardando, setAguardando] = useState<ConviteAguardando[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; senha?: SenhaGerada; nome?: string } | null>(null);
  const [convite, setConvite] = useState(false);
  const [editando, setEditando] = useState<Membro | null>(null);
  const [transferir, setTransferir] = useState<{ m: Membro; inativar: boolean } | null>(null);
  const [janela, confirmar] = useConfirmar();

  // ferramentas que um perfil pode liberar (o catálogo, menos as desligadas)
  const ferramentas = useMemo(() => apps.filter((a) => a.status !== "desligado"), [apps]);

  const carregar = useCallback(async () => {
    const sb = supabase();
    const [a, p, h, c, cv] = await Promise.all([
      sb.from("hub_acessos").select("user_id,app,papel").eq("org_id", org.id),
      sb.from("hub_perfis").select("id,nome,apps").eq("org_id", org.id).eq("ativo", true).order("nome"),
      sb.from("hub_auditoria").select("*").eq("org_id", org.id).order("em", { ascending: false }).limit(60),
      sb.rpc("hub_situacao_contas", { p_org: org.id }),
      sb.rpc("convites_pendentes", { p_org: org.id }),
    ]);
    const falha = a.error ?? p.error ?? h.error ?? c.error ?? cv.error;
    if (falha) setErro(traduzirErro(falha));
    if (a.error) return;
    setAcessos(a.data as Acesso[]);
    setPerfis((p.data as Perfil[]) ?? []);
    setHistorico((h.data as Auditoria[]) ?? []);
    setContas(new Map(((c.data as Conta[]) ?? []).map((x) => [x.user_id, x])));
    setAguardando((cv.data as ConviteAguardando[]) ?? []);
  }, [org.id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (papel !== "admin") return <p className="text-sm text-neutral-600">Apenas administradores gerenciam acessos.</p>;

  const avisar = (texto: string, senha?: SenhaGerada, nome?: string) => {
    setErro(null);
    setAviso({ texto, senha, nome });
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
      const sim = await confirmar({
        titulo: `Tornar ${m.nome} Administrador?`,
        descricao: "Administrador tem acesso total ao Hub, inclusive a esta tela de pessoas e acessos.",
        botao: "Tornar Administrador",
      });
      if (!sim) return;
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
      const sim = await confirmar({
        titulo: `Cancelar o convite de ${m.nome}?`,
        descricao: "O link enviado deixa de dar acesso. Se precisar, cadastre a pessoa de novo depois.",
        botao: "Cancelar convite",
        perigo: true,
      });
      if (!sim) return;
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

  /** Senha provisória para mandar pelo WhatsApp (071): primeiro acesso ou senha esquecida; a anterior deixa de valer. */
  async function gerarSenha(m: { email?: string | null; nome: string }, redefinir = false) {
    if (!m.email) return;
    if (redefinir) {
      const sim = await confirmar({
        titulo: `Redefinir a senha de ${m.nome}?`,
        descricao: "A senha atual deixa de valer. A pessoa entra com a senha provisória e cria uma nova no primeiro acesso.",
        botao: "Gerar senha provisória",
      });
      if (!sim) return;
    }
    const r = await gerarSenhaProvisoria(m.email, m.nome);
    if (!r.senha) return falhar(r.erro ?? "Não foi possível gerar a senha agora.");
    avisar(
      `Senha provisória de ${m.nome} pronta. Mande pelo WhatsApp; no primeiro acesso o HUB pede para criar a própria senha.`,
      { senha: r.senha, email: m.email, endereco: r.endereco ?? `${window.location.origin}${caminho("/login")}` },
      m.nome,
    );
    await depois(); // convite vira conta: a pessoa passa para a lista da equipe
  }

  async function cancelarConvite(c: ConviteAguardando) {
    const nome = c.nome || c.email;
    const sim = await confirmar({
      titulo: `Cancelar o convite de ${nome}?`,
      descricao: "O link enviado deixa de dar acesso. Se precisar, cadastre a pessoa de novo depois.",
      botao: "Cancelar convite",
      perigo: true,
    });
    if (!sim) return;
    const { error } = await supabase().rpc("hub_cancelar_convite", { p_org: org.id, p_email: c.email });
    if (error) return falhar(error);
    avisar(`Convite de ${nome} cancelado.`);
    await depois();
  }

  const ativos = membros.filter((m) => m.ativo);
  const inativos = membros.filter((m) => !m.ativo && m.papel !== "tv");
  const usoPerfil = (id: string) => ativos.filter((m) => m.perfil_id === id).length;

  return (
    <div className="space-y-5">
      {janela}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--marca)]">Pessoas e acessos</h1>
          <p className="max-w-3xl text-sm text-neutral-600">
            Só o administrador define o que cada pessoa vê: ao cadastrar ou editar, escolha os <b>módulos</b> um a um (ver, operar ou gerir)
            ou use um <b>perfil</b> pronto, que muda para todos que o seguem. A pessoa só enxerga no HUB os módulos liberados.
            Administradores veem tudo.
          </p>
        </div>
        <button className="btn-primario" onClick={() => setConvite(true)}>
          <Icone nome="mais" className="inline h-4 w-4 align-[-3px]" />
          Cadastrar pessoa
        </button>
      </div>

      <Abas
        rotulo="Partes de Pessoas e acessos"
        valor={aba}
        aoMudar={setAba}
        itens={[
          { id: "pessoas", nome: `Equipe MDC (${ativos.length})` },
          { id: "clientes", nome: "Clientes (portal)" },
          { id: "perfis", nome: `Perfis (${perfis.length})` },
          { id: "historico", nome: "Histórico" },
        ]}
      />

      <div role="alert" aria-live="assertive">
        {erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{erro}</p>}
      </div>
      <div role="status" aria-live="polite">
        {aviso && (
          <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">
            {aviso.texto}
            {aviso.senha && (
              <SenhaCopiavel
                {...aviso.senha}
                endereco={aviso.senha.endereco || `${window.location.origin}${caminho("/login")}`}
                nome={aviso.nome}
              />
            )}
          </div>
        )}
      </div>

      {aba === "pessoas" && (
        <div className="flex flex-wrap justify-end gap-2">
          <BotoesExportar
            vazio={!ativos.length}
            avisar={(t, tom) => (tom === "erro" ? falhar(t) : avisar(t))}
            montar={() => ({
              titulo: "Pessoas e acessos — Equipe MDC",
              subtitulo: `${org.nome} · ${ativos.length} pessoa(s) ativa(s)`,
              arquivo: nomeArquivo("Pessoas-e-acessos", hojeISO()),
              logoUrl: org.logo_url,
              linhas: ativos,
              colunas: [
                { titulo: "Nome", valor: (m) => m.nome, peso: 1.6, largura: 28 },
                { titulo: "E-mail", valor: (m) => m.email ?? "", peso: 1.8, largura: 32 },
                { titulo: "Papel", valor: (m) => PAPEIS.find((p) => p.id === m.papel)?.nome ?? m.papel, peso: 0.9, largura: 14 },
                {
                  titulo: "Perfil",
                  valor: (m) =>
                    m.papel === "admin" ? "Administrador (tudo)" : (perfis.find((p) => p.id === m.perfil_id)?.nome ?? "Acesso manual"),
                  peso: 1.2,
                  largura: 22,
                },
                { titulo: "Setor", valor: (m) => setores.find((x) => x.id === m.setor_id)?.nome ?? "", peso: 1, largura: 18 },
                {
                  titulo: "Módulos liberados",
                  valor: (m) =>
                    m.papel === "admin"
                      ? "Todos"
                      : acessos
                          .filter((a) => a.user_id === m.user_id)
                          .map((a) => `${apps.find((x) => x.slug === a.app)?.nome ?? a.app} (${a.papel})`)
                          .join(", "),
                  peso: 2.4,
                  largura: 50,
                },
              ],
            })}
          />
        </div>
      )}

      {aba === "pessoas" && (
        <div className="cartao overflow-x-auto">
          <table className="tabela tabela-acoes-fixas">
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
                  aoSenha={() => gerarSenha(m, !!contas.get(m.user_id)?.confirmado)}
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

      {aba === "pessoas" && (
        <ConvitesAguardando
          convites={aguardando}
          aoSenha={(c) => gerarSenha({ email: c.email, nome: c.nome || c.email })}
          aoCancelar={cancelarConvite}
        />
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
          ferramentas={ferramentas}
          acessos={acessos.filter((a) => a.user_id === editando.user_id)}
          souEu={editando.user_id === eu.user_id}
          aoFechar={() => setEditando(null)}
          aoSalvar={async ({ modulos, ...campos }) => {
            const m = editando;
            setEditando(null);
            const texto = m.ativo ? `Dados de ${campos.nome ?? m.nome} salvos.` : `${m.nome} foi reativado.`;
            if (!modulos) return salvarMembro(m, campos, texto);
            // acesso personalizado: dados e módulos numa transação só
            const { error } = await supabase().rpc("hub_editar_membro", {
              p_org: org.id,
              p_user: m.user_id,
              p_nome: campos.nome,
              p_papel: campos.papel,
              p_setor: campos.setor,
              p_perfil: null,
              p_ativo: true,
              p_apps: modulos as unknown as Json,
            });
            if (error) return falhar(error);
            avisar(`${texto} ${campos.nome} vê ${Object.keys(modulos).length} módulo(s).`);
            await depois();
          }}
        />
      )}

      {convite && (
        <Cadastro
          perfis={perfis}
          setores={setores}
          ferramentas={ferramentas}
          aoFechar={() => setConvite(false)}
          aoCadastrar={async (txt, senha, nome) => {
            avisar(txt, senha, nome);
            setConvite(false);
            setAba("pessoas");
            await depois();
          }}
        />
      )}
    </div>
  );
}
