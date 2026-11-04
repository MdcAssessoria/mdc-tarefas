// Aba "Equipe" das Configurações: nome e setor de cada pessoa da organização (só administrador). Papel e inativar
// ficam só em Pessoas e acessos, que pede confirmação e oferece transferir o trabalho de quem sai.
"use client";

import Link from "next/link";
import { useOrg } from "@/dominios/organizacao/OrgProvider";
import { supabase } from "@/lib/supabase";
import { PAPEIS } from "@/dominios/organizacao/tipos";
import { traduzirErro } from "@/lib/erros";
import { useMensagem } from "./useMensagem";
import { BotoesExportar } from "@/components/ui/BotoesExportar";
import { nomeArquivo } from "@/lib/arquivos/exportarLista";
import { hojeISO } from "@/lib/datas";

const nomePapel = (id: string) => PAPEIS.find((p) => p.id === id)?.nome ?? id;

export function AbaEquipe() {
  const { org, membros, setores, recarregar } = useOrg();
  const { mostrar, el } = useMensagem();

  async function alterar(userId: string, campos: Record<string, unknown>) {
    const { error } = await supabase().from("membros").update(campos).eq("org_id", org.id).eq("user_id", userId);
    if (error) return mostrar(traduzirErro(error), true);
    void recarregar();
  }

  return (
    <div className="space-y-4">
      <div className="cartao flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
        <p className="text-neutral-600">
          Novas pessoas são cadastradas em <b>Pessoas e acessos</b>: você escolhe o perfil e a pessoa recebe o convite por e-mail para criar
          a senha. Aqui você ajusta o nome e o setor de cada pessoa.
        </p>
        <div className="flex flex-wrap gap-2">
          <BotoesExportar
            vazio={!membros.length}
            avisar={(t, tom) => mostrar(t, tom === "erro")}
            montar={() => ({
              titulo: "Equipe",
              subtitulo: `${org.nome} · ${membros.length} pessoa(s)`,
              arquivo: nomeArquivo("Equipe", hojeISO()),
              logoUrl: org.logo_url,
              linhas: membros,
              colunas: [
                { titulo: "Nome", valor: (m) => m.nome, peso: 1.8, largura: 30 },
                { titulo: "E-mail", valor: (m) => m.email ?? "", peso: 2, largura: 34 },
                { titulo: "Papel", valor: (m) => nomePapel(m.papel), peso: 1, largura: 16 },
                { titulo: "Setor", valor: (m) => setores.find((x) => x.id === m.setor_id)?.nome ?? "", peso: 1.2, largura: 20 },
                { titulo: "Situação", valor: (m) => (m.ativo ? "Ativo" : "Inativo"), peso: 0.8, largura: 12 },
              ],
            })}
          />
          <Link href="/hub/acessos" className="btn-primario">
            Cadastrar pessoa
          </Link>
        </div>
      </div>
      {el}
      <div className="cartao overflow-x-auto">
        <table className="tabela tabela-acoes-fixas">
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Papel</th>
              <th>Setor</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {membros.map((m) => (
              <tr key={m.user_id} className={m.ativo ? "" : "linha-apagada"}>
                <td>
                  <input
                    className="entrada w-full min-w-40"
                    defaultValue={m.nome}
                    aria-label={`Nome de ${m.nome}`}
                    onBlur={(e) => e.target.value !== m.nome && alterar(m.user_id, { nome: e.target.value })}
                  />
                </td>
                <td className="text-[var(--texto-suave)]">{m.email}</td>
                <td>{nomePapel(m.papel)}</td>
                <td>
                  <select
                    className="entrada"
                    aria-label={`Setor de ${m.nome}`}
                    value={m.setor_id ?? ""}
                    onChange={(e) => alterar(m.user_id, { setor_id: e.target.value || null })}
                  >
                    <option value="">—</option>
                    {setores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nome}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{m.ativo ? "Ativo" : "Inativo"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm">
        <Link href="/hub/acessos" className="btn-link">
          Mudar papel ou inativar em Pessoas e acessos
        </Link>
      </p>
    </div>
  );
}
