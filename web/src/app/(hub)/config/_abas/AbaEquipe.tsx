// Aba "Equipe" das Configurações: papel, setor e situação de cada pessoa da organização (só administrador).
"use client";

import Link from "next/link";
import { useOrg } from "@/lib/org";
import { supabase } from "@/lib/supabase";
import { PAPEIS } from "@/lib/types";
import { traduzirErro } from "@/lib/erros";
import { useMensagem } from "./useMensagem";

export function AbaEquipe() {
  const { org, membros, setores, recarregar, eu } = useOrg();
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
          a senha. Aqui você ajusta nome, papel nas tarefas, setor e desativa quem saiu.
        </p>
        <Link href="/hub/acessos" className="btn-primario">
          Cadastrar pessoa
        </Link>
      </div>
      {el}
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Papel</th>
              <th>Setor</th>
              <th>Ativo</th>
            </tr>
          </thead>
          <tbody>
            {membros.map((m) => (
              <tr key={m.user_id} className={m.ativo ? "" : "opacity-50"}>
                <td>
                  <input
                    className="entrada w-full min-w-40"
                    defaultValue={m.nome}
                    onBlur={(e) => e.target.value !== m.nome && alterar(m.user_id, { nome: e.target.value })}
                  />
                </td>
                <td className="text-[var(--texto-suave)]">{m.email}</td>
                <td>
                  <select
                    className="entrada"
                    value={m.papel}
                    onChange={(e) => alterar(m.user_id, { papel: e.target.value })}
                    disabled={m.user_id === eu.user_id}
                  >
                    {PAPEIS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    className="entrada"
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
                <td>
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-[var(--marca)]"
                    checked={m.ativo}
                    disabled={m.user_id === eu.user_id}
                    onChange={(e) => alterar(m.user_id, { ativo: e.target.checked })}
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
