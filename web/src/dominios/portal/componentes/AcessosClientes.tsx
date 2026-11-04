// Gestão dos acessos de clientes ao Portal: quem de cada cliente acessa, com quais permissões, convites pendentes e o
// editor de acesso. Usada na aba "Clientes (portal)" de Pessoas e acessos e em Atendimento › Acessos do portal.
// Convite pendente se cancela com motivo pela função portal_cancelar_convite (036); nada é apagado da tela.
"use client";

import { Icone } from "@/components/ui/Icone";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { nomeCliente } from "@/dominios/clientes/nome";
import { perfilDasPerms } from "@/dominios/portal/permissoes";
import type { VinculoCliente } from "@/dominios/portal/tipos";
import { EditorCliente } from "./EditorCliente";
import { gerarLinkConvite } from "@/dominios/acessos/convite";
import { JanelaMotivo } from "@/components/ui/JanelaMotivo";
import { exigir } from "@/lib/exigir";

export function AcessosClientes({
  aoAviso,
  aoErro,
}: {
  aoAviso: (t: string, link?: string, nome?: string) => void;
  aoErro: (e: unknown) => void;
}) {
  const { org, clientes, clientePorId } = useOrg();
  const [vinculos, setVinculos] = useState<VinculoCliente[]>([]);
  const [novo, setNovo] = useState(false);
  const [editar, setEditar] = useState<string | null>(null); // e-mail
  const [busca, setBusca] = useState("");
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [cancelar, setCancelar] = useState<{ email: string; nome: string; clientes: string[] } | null>(null);

  const carregar = useCallback(async () => {
    const sb = supabase();
    const [u, c] = await Promise.all([
      sb.from("portal_usuarios").select("user_id,cliente_id,nome,email,permissoes,ativo").eq("org_id", org.id),
      sb.from("portal_convites").select("cliente_id,nome,email,permissoes").eq("org_id", org.id).is("cancelado_em", null),
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

  /** Link de criar senha para mandar pelo WhatsApp (o link do e-mail anterior deixa de valer). */
  async function linkWhats(email: string, nome: string) {
    const r = await gerarLinkConvite(email, nome === email ? undefined : nome);
    if (!r.link) return aoErro(r.erro ?? "Não foi possível gerar o link agora.");
    aoAviso(`Link de criar senha de ${nome} pronto. Se a pessoa já recebeu o e-mail, aquele link deixa de valer: use este.`, r.link, nome);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-sm text-neutral-600">
          Cada pessoa do cliente entra com o próprio e-mail e vê <b>só as empresas vinculadas</b> a ela, com o perfil de cliente escolhido
          (o que pode ver no portal). Um sócio de um grupo pode ter várias empresas.
        </p>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <input
            className="entrada min-w-0 flex-1 sm:w-56 sm:flex-none"
            aria-label="Buscar pessoa ou empresa"
            placeholder="Buscar pessoa ou empresa"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <button className="btn-primario" onClick={() => setNovo(true)}>
            <Icone nome="mais" className="h-4 w-4" />
            Acesso de cliente
          </button>
        </div>
      </div>
      {erroLista && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{erroLista}</p>}
      <div className="cartao overflow-x-auto">
        <table className="tabela tabela-acoes-fixas">
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
                <tr key={p.email} className={`align-top ${ativos.length ? "" : "linha-apagada"}`}>
                  <td>
                    <div className="font-medium">{p.nome}</div>
                    <div className="text-xs text-neutral-500">{p.email}</div>
                    {pendente && (
                      <div className="mt-1 space-y-1">
                        <span className="chip bg-amber-50 text-amber-900">Aguardando criar a senha</span>
                        <button className="btn-link block text-sm" onClick={() => linkWhats(p.email, p.nome)}>
                          Link para WhatsApp
                        </button>
                        <button
                          className="btn-link block text-sm !text-[var(--perigo)]"
                          onClick={() => setCancelar({ email: p.email, nome: p.nome, clientes: p.vs.map((v) => v.cliente_id) })}
                        >
                          Cancelar convite
                        </button>
                      </div>
                    )}
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
      {cancelar && (
        <JanelaMotivo
          titulo="Cancelar convite"
          descricao={
            <>
              O convite de <b>{cancelar.nome}</b> deixa de valer. Se a pessoa ainda não criou a senha, não vai conseguir entrar. O motivo
              fica no histórico.
            </>
          }
          botao="Cancelar convite"
          aoFechar={() => setCancelar(null)}
          aoConfirmar={async (motivo) => {
            for (const cliente of cancelar.clientes) {
              exigir(await supabase().rpc("portal_cancelar_convite", { p_cliente: cliente, p_email: cancelar.email, p_motivo: motivo }));
            }
            setCancelar(null);
            aoAviso(`Convite de ${cancelar.nome} cancelado.`);
            await carregar();
          }}
        />
      )}
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
