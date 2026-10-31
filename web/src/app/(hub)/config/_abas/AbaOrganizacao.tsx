// Aba "Organização e painel" das Configurações: nome, cores, fuso e opções do painel da TV (só administrador).
"use client";

import { useState } from "react";
import { useOrg } from "@/lib/org";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { enderecoHub } from "@/lib/caminho";
import { useMensagem } from "./useMensagem";

export function AbaOrganizacao() {
  const { org, recarregar } = useOrg();
  const [f, setF] = useState(org);
  const { mostrar, el } = useMensagem();
  const link = typeof window !== "undefined" ? enderecoHub(`/tv?org=${org.slug}`) : "";

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase()
      .from("organizacoes")
      .update({
        nome: f.nome,
        cnpj: f.cnpj,
        logo_url: f.logo_url || null,
        cor_primaria: f.cor_primaria,
        cor_destaque: f.cor_destaque,
        fuso: f.fuso,
      })
      .eq("id", org.id);
    if (error) return mostrar(traduzirErro(error), true);
    mostrar("Dados salvos.");
    void recarregar();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form onSubmit={salvar} className="cartao space-y-4 p-5">
        <h2 className="font-semibold text-[var(--marca)]">Identidade</h2>
        <label className="campo">
          <span>Nome</span>
          <input required value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
        </label>
        <label className="campo">
          <span>CNPJ</span>
          <input value={f.cnpj ?? ""} onChange={(e) => setF({ ...f, cnpj: e.target.value })} />
        </label>
        <label className="campo">
          <span>URL do logo (versão clara, para fundo escuro)</span>
          <input value={f.logo_url ?? ""} onChange={(e) => setF({ ...f, logo_url: e.target.value })} />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="campo">
            <span>Cor principal</span>
            <input type="color" value={f.cor_primaria} onChange={(e) => setF({ ...f, cor_primaria: e.target.value })} />
          </label>
          <label className="campo">
            <span>Cor de destaque</span>
            <input type="color" value={f.cor_destaque} onChange={(e) => setF({ ...f, cor_destaque: e.target.value })} />
          </label>
        </div>
        <label className="campo">
          <span>Fuso horário</span>
          <select value={f.fuso} onChange={(e) => setF({ ...f, fuso: e.target.value })}>
            {[
              "America/Sao_Paulo",
              "America/Manaus",
              "America/Cuiaba",
              "America/Belem",
              "America/Fortaleza",
              "America/Recife",
              "America/Rio_Branco",
              "America/Noronha",
            ].map((z) => (
              <option key={z}>{z}</option>
            ))}
          </select>
        </label>
        <button className="btn-primario">Salvar</button>
        {el}
      </form>
      <div className="cartao space-y-3 p-5 text-sm">
        <h2 className="font-semibold text-[var(--marca)]">Painel da TV</h2>
        <p>Abra este endereço no navegador da TV e entre com o usuário de papel “Painel TV”:</p>
        <code className="block break-all rounded-md bg-[var(--fundo)] p-3">{link}</code>
        <button className="btn" onClick={() => navigator.clipboard.writeText(link).then(() => mostrar("Link copiado."))}>
          Copiar link
        </button>
        <ol className="list-decimal space-y-1 pl-5 text-[var(--texto-suave)]">
          <li>Na aba Equipe, crie um membro com papel “Painel TV” (ex.: tv@suaempresa.com).</li>
          <li>Na TV (Fully Kiosk Browser), defina o link acima como página inicial.</li>
          <li>Faça login uma vez; a sessão se renova sozinha e o painel atualiza em tempo real.</li>
        </ol>
      </div>
    </div>
  );
}
