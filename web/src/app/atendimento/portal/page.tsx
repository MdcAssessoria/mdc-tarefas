"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useOrg } from "@/lib/org";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { enviarConvite } from "@/lib/convite";

export default function PaginaAcessosPortal() {
  return (
    <AppShell modulo="atendimento">
      <AcessosPortal />
    </AppShell>
  );
}

const PERMISSOES = [
  { id: "demonstrativos", nome: "Demonstrativos e parecer" },
  { id: "rotinas", nome: "Rotinas do mês" },
  { id: "chat", nome: "Chat com a MDC" },
  { id: "documentos", nome: "Documentos e vencimentos" },
  { id: "societario", nome: "Processos societários" },
  { id: "folha", nome: "Folha (DP)" },
];

interface Usuario {
  user_id: string;
  cliente_id: string;
  nome: string;
  email: string;
  permissoes: string[];
  ativo: boolean;
}
interface Convite {
  email: string;
  cliente_id: string;
  nome: string | null;
  permissoes: string[];
  criado_em: string;
}

function AcessosPortal() {
  const { org, clientes, clientePorId } = useOrg();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [convites, setConvites] = useState<Convite[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cliente, setCliente] = useState("");
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [perms, setPerms] = useState<string[]>(["demonstrativos", "rotinas", "chat", "documentos", "societario"]);

  const carregar = useCallback(async () => {
    const sb = supabase();
    const [u, c] = await Promise.all([
      sb.from("portal_usuarios").select("*").eq("org_id", org.id).order("nome"),
      sb.from("portal_convites").select("*").eq("org_id", org.id).order("criado_em", { ascending: false }),
    ]);
    if (u.error) return setErro(traduzirErro(u.error));
    setUsuarios(u.data as Usuario[]);
    setConvites((c.data as Convite[]) ?? []);
  }, [org.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function convidar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    const { data, error } = await supabase().rpc("portal_convidar", {
      p_cliente: cliente,
      p_email: email,
      p_nome: nome,
      p_permissoes: perms,
    });
    if (error) return setErro(traduzirErro(error));
    if (data === "convite") {
      const r = await enviarConvite(email, nome);
      setAviso(
        r.enviado
          ? `Convite enviado para ${email}. A pessoa recebe um e-mail para criar a senha e o portal já abre com a empresa liberada.`
          : `Acesso cadastrado, mas o e-mail não pôde ser enviado${r.erro ? ` (${r.erro})` : ""}.${r.link ? ` Repasse este link para a pessoa criar a senha: ${r.link}` : ""}`,
      );
    } else setAviso(`${email} já tinha conta e recebeu o acesso agora.`);
    setEmail("");
    setNome("");
    carregar();
  }

  async function alterar(u: Usuario, campos: Partial<Usuario>) {
    const { error } = await supabase().from("portal_usuarios").update(campos).eq("user_id", u.user_id).eq("cliente_id", u.cliente_id);
    if (error) setErro(traduzirErro(error));
    carregar();
  }

  const nomeCli = (id: string) => {
    const c = clientePorId(id);
    return c ? c.nome_fantasia || c.razao_social : "—";
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-[var(--marca)]">Acessos ao Portal do Cliente</h1>
        <p className="text-sm text-neutral-600">
          Cada pessoa do cliente (sócio, financeiro, RH) entra com o próprio e-mail e vê só as empresas e as áreas liberadas aqui. Um grupo
          de empresas pode ter a mesma pessoa em várias delas. Cliente inativado perde o acesso depois do mês de saída.
        </p>
      </div>
      {erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{erro}</p>}
      {aviso && <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{aviso}</p>}

      <form onSubmit={convidar} className="cartao grid gap-3 p-4 md:grid-cols-4">
        <label className="campo md:col-span-2">
          <span>Empresa</span>
          <select required value={cliente} onChange={(e) => setCliente(e.target.value)}>
            <option value="">Escolha…</option>
            {clientes
              .filter((c) => c.ativo)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo_dominio ? `${c.codigo_dominio} · ` : ""}
                  {c.nome_fantasia || c.razao_social}
                </option>
              ))}
          </select>
        </label>
        <label className="campo">
          <span>E-mail da pessoa</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="campo">
          <span>Nome</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} />
        </label>
        <fieldset className="flex flex-wrap gap-x-4 gap-y-1 text-sm md:col-span-3">
          {PERMISSOES.map((p) => (
            <label key={p.id} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={perms.includes(p.id)}
                onChange={(e) => setPerms((x) => (e.target.checked ? [...x, p.id] : x.filter((y) => y !== p.id)))}
              />
              {p.nome}
            </label>
          ))}
        </fieldset>
        <div className="flex justify-end">
          <button className="btn-primario">Liberar acesso</button>
        </div>
      </form>

      <section className="cartao overflow-x-auto">
        <table className="tabela">
          <thead>
            <tr>
              <th>Pessoa</th>
              <th>Empresa</th>
              <th>Áreas liberadas</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.user_id + u.cliente_id}>
                <td>
                  <div className="font-medium">{u.nome}</div>
                  <div className="text-xs text-neutral-500">{u.email}</div>
                </td>
                <td>{nomeCli(u.cliente_id)}</td>
                <td>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    {PERMISSOES.map((p) => (
                      <label key={p.id} className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={u.permissoes.includes(p.id)}
                          onChange={(e) =>
                            alterar(u, { permissoes: e.target.checked ? [...u.permissoes, p.id] : u.permissoes.filter((x) => x !== p.id) })
                          }
                        />
                        {p.nome}
                      </label>
                    ))}
                  </div>
                </td>
                <td>
                  <button
                    className={`chip ${u.ativo ? "bg-emerald-50 text-emerald-800" : "bg-neutral-100 text-neutral-500"}`}
                    onClick={() => alterar(u, { ativo: !u.ativo })}
                    title="Clique para alternar"
                  >
                    {u.ativo ? "Ativo" : "Bloqueado"}
                  </button>
                </td>
              </tr>
            ))}
            {convites.map((c) => (
              <tr key={c.email + c.cliente_id} className="text-neutral-500">
                <td>
                  <div>{c.nome ?? c.email}</div>
                  <div className="text-xs">{c.email}</div>
                </td>
                <td>{nomeCli(c.cliente_id)}</td>
                <td className="text-xs">{c.permissoes.map((p) => PERMISSOES.find((x) => x.id === p)?.nome ?? p).join(", ")}</td>
                <td>
                  <span className="chip bg-amber-50 text-amber-800">convite pendente</span>
                  <button
                    className="btn-link ml-2"
                    onClick={async () => {
                      await supabase().from("portal_convites").delete().eq("email", c.email).eq("cliente_id", c.cliente_id);
                      carregar();
                    }}
                  >
                    cancelar
                  </button>
                </td>
              </tr>
            ))}
            {usuarios.length + convites.length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-neutral-500">
                  Nenhum cliente com acesso ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
