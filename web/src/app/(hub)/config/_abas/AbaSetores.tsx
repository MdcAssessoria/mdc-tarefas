// Aba "Setores" das Configurações: cadastro, ordem e cores dos setores da organização.
"use client";

import { useState } from "react";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { useMensagem } from "./useMensagem";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { hojeISO } from "@/lib/datas";

export function AbaSetores() {
  const { org, setores, recarregar } = useOrg();
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState("#7FB3A0");
  const { mostrar, el } = useMensagem();

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase()
      .from("setores")
      .insert({ org_id: org.id, nome, cor, ordem: setores.length + 1 });
    if (error) return mostrar(traduzirErro(error), true);
    setNome("");
    void recarregar();
  }
  async function alterar(id: string, campos: Record<string, unknown>) {
    const { error } = await supabase().from("setores").update(campos).eq("id", id);
    if (error) return mostrar(traduzirErro(error), true);
    void recarregar();
  }

  return (
    <div className="max-w-2xl space-y-4">
      <form onSubmit={adicionar} className="cartao flex flex-wrap items-end gap-3 p-4">
        <label className="campo flex-1">
          <span>Novo setor</span>
          <input required value={nome} onChange={(e) => setNome(e.target.value)} />
        </label>
        <label className="campo">
          <span>Cor</span>
          <input type="color" value={cor} onChange={(e) => setCor(e.target.value)} />
        </label>
        <button className="btn-primario">Adicionar</button>
      </form>
      {el}
      <div className="flex justify-end gap-2">
        <BotoesExportar
          vazio={!setores.length}
          avisar={(t, tom) => mostrar(t, tom === "erro")}
          montar={() => ({
            titulo: "Setores",
            subtitulo: `${org.nome} · ${setores.length} setor(es)`,
            arquivo: nomeArquivo("Setores", hojeISO()),
            logoUrl: org.logo_url,
            linhas: setores,
            colunas: [
              { titulo: "Ordem", valor: (x) => x.ordem, formato: "numero", peso: 0.6, largura: 8 },
              { titulo: "Nome", valor: (x) => x.nome, peso: 2, largura: 30 },
              { titulo: "Situação", valor: (x) => (x.ativo ? "Ativo" : "Inativo"), peso: 0.8, largura: 12 },
            ],
          })}
        />
      </div>
      <div className="cartao">
        <table className="tabela tabela-acoes-fixas">
          <thead>
            <tr>
              <th>Ordem</th>
              <th>Nome</th>
              <th>Cor</th>
              <th>Ativo</th>
            </tr>
          </thead>
          <tbody>
            {setores.map((s) => (
              <tr key={s.id}>
                <td>
                  <input
                    type="number"
                    className="entrada w-20"
                    aria-label={`Ordem de ${s.nome}`}
                    defaultValue={s.ordem}
                    onBlur={(e) => Number(e.target.value) !== s.ordem && alterar(s.id, { ordem: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    className="entrada w-full"
                    aria-label={`Nome do setor ${s.nome}`}
                    defaultValue={s.nome}
                    onBlur={(e) => e.target.value !== s.nome && alterar(s.id, { nome: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="color"
                    aria-label={`Cor de ${s.nome}`}
                    defaultValue={s.cor}
                    onBlur={(e) => e.target.value !== s.cor && alterar(s.id, { cor: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-[var(--marca)]"
                    aria-label={`${s.nome} ativo`}
                    checked={s.ativo}
                    onChange={(e) => alterar(s.id, { ativo: e.target.checked })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
