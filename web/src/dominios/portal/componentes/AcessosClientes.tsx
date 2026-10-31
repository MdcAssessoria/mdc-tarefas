// Aba "Clientes (portal)" de Pessoas e acessos: quem de cada cliente acessa o Portal, com quais permissões,
// convites pendentes e o editor de acesso.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { nomeCliente } from "@/dominios/clientes/nome";
import { perfilDasPerms } from "@/dominios/portal/permissoes";
import type { VinculoCliente } from "@/dominios/portal/tipos";
import { EditorCliente } from "./EditorCliente";

export function AcessosClientes({ aoAviso, aoErro }: { aoAviso: (t: string, link?: string) => void; aoErro: (e: unknown) => void }) {
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
