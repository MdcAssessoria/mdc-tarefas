// Janela para editar os dados de uma pessoa da equipe (nome, e-mail, papel, setor, perfil).
"use client";

import { useState } from "react";
import { PAPEIS } from "@/lib/types";
import type { Membro, Papel } from "@/lib/types";
import type { Perfil } from "@/dominios/acessos/tipos";

export function EditarPessoa({
  m,
  perfis,
  setores,
  souEu,
  aoFechar,
  aoSalvar,
}: {
  m: Membro;
  perfis: Perfil[];
  setores: { id: string; nome: string }[];
  souEu: boolean;
  aoFechar: () => void;
  aoSalvar: (c: { nome: string; papel: Papel; setor: string | null; perfil: string | null; ativo: boolean }) => void;
}) {
  const [nome, setNome] = useState(m.nome);
  const [papel, setPapel] = useState<Papel>(m.papel);
  const [setor, setSetor] = useState(m.setor_id ?? "");
  const [perfil, setPerfil] = useState(m.perfil_id ?? "");
  const reativando = !m.ativo;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={aoFechar}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          aoSalvar({ nome, papel, setor: setor || null, perfil: papel === "admin" ? null : perfil || null, ativo: true });
        }}
        className="cartao w-full max-w-md space-y-3 p-5"
      >
        <div>
          <h2 className="text-lg font-semibold text-[var(--marca)]">{reativando ? `Reativar ${m.nome}` : `Editar ${m.nome}`}</h2>
          <p className="text-xs text-neutral-500">{m.email}</p>
        </div>
        <label className="campo">
          <span>Nome</span>
          <input required value={nome} onChange={(e) => setNome(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="campo">
            <span>Papel nas tarefas</span>
            <select value={papel} disabled={souEu} onChange={(e) => setPapel(e.target.value as Papel)}>
              {PAPEIS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Setor</span>
            <select value={setor} onChange={(e) => setSetor(e.target.value)}>
              <option value="">—</option>
              {setores.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nome}
                </option>
              ))}
            </select>
          </label>
        </div>
        {papel === "admin" ? (
          <p className="rounded-md bg-[var(--fundo)] p-2 text-xs text-neutral-600">
            Administrador acessa todas as ferramentas e esta tela de acessos.
          </p>
        ) : (
          <label className="campo">
            <span>Perfil de acesso</span>
            <select required value={perfil} onChange={(e) => setPerfil(e.target.value)}>
              <option value="" disabled>
                Escolha…
              </option>
              {perfis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn" onClick={aoFechar}>
            Cancelar
          </button>
          <button className="btn-primario">{reativando ? "Reativar" : "Salvar"}</button>
        </div>
      </form>
    </div>
  );
}
