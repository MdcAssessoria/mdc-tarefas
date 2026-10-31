// Janela para dar ou editar o acesso de uma pessoa do cliente ao Portal (empresas, permissões, convite).
"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { enviarConvite } from "@/lib/convite";
import { nomeCliente } from "@/lib/clientes";
import { PERFIS_CLIENTE, PERMISSOES_PORTAL, perfilDasPerms } from "@/dominios/portal/permissoes";
import type { VinculoCliente } from "@/dominios/portal/tipos";

export function EditorCliente({
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
