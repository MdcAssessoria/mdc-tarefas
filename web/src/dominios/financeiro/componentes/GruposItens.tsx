// Grupos de produto (Bebidas, Ferragens…): criar, renomear, desativar e reativar. Nada se apaga.
"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { traduzirErro } from "@/lib/erros";
import { Modal } from "@/components/ui/Modal";
import type { Cliente } from "@/dominios/clientes/tipos";
import type { GrupoItem, Item } from "../tipos";

export function GruposItens({
  cliente,
  grupos,
  itens,
  podeOperar,
  aoFechar,
  aoMudar,
}: {
  cliente: Cliente;
  grupos: GrupoItem[];
  itens: Item[];
  podeOperar: boolean;
  aoFechar: () => void;
  aoMudar: () => void;
}) {
  const [novo, setNovo] = useState("");
  const [editando, setEditando] = useState<{ id: string; nome: string } | null>(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const usados = (id: string) => itens.filter((i) => i.grupo_id === id && i.ativo).length;

  async function rodar(f: () => PromiseLike<{ error: unknown }>) {
    setOcupado(true);
    setErro("");
    const { error } = await f();
    setOcupado(false);
    if (error) {
      setErro(traduzirErro(error));
      return false;
    }
    aoMudar();
    return true;
  }

  return (
    <Modal
      titulo="Grupos de produto"
      descricao="Organize os itens em grupos para achar e filtrar mais rápido."
      aoFechar={aoFechar}
      largura="lg"
    >
      {podeOperar && (
        <div className="flex gap-2">
          <input
            aria-label="Nome do grupo novo"
            className="min-w-0 flex-1 rounded-md border border-[var(--borda)] px-3"
            placeholder="Novo grupo (ex.: Bebidas)"
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
          />
          <button
            className="btn-primario"
            disabled={!novo.trim() || ocupado}
            onClick={async () => {
              if (
                await rodar(() =>
                  supabase().from("est_grupos").insert({ org_id: cliente.org_id, cliente_id: cliente.id, nome: novo.trim() }),
                )
              )
                setNovo("");
            }}
          >
            Criar
          </button>
        </div>
      )}
      {!grupos.length ? (
        <p className="py-4 text-center text-sm text-neutral-500">
          Nenhum grupo ainda. Crie acima ou digite um grupo novo ao cadastrar o item.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--borda)] rounded-md border border-[var(--borda)]">
          {grupos.map((g) => (
            <li key={g.id} className={`flex flex-wrap items-center gap-2 px-3 py-2 text-sm ${g.ativo ? "" : "linha-apagada"}`}>
              {editando?.id === g.id ? (
                <input
                  aria-label="Novo nome do grupo"
                  className="min-w-0 flex-1 rounded-md border border-[var(--borda)] px-2 py-1"
                  value={editando.nome}
                  onChange={(e) => setEditando({ ...editando, nome: e.target.value })}
                />
              ) : (
                <span className="flex-1 font-medium">
                  {g.nome} <span className="text-xs font-normal text-neutral-500">· {usados(g.id)} item(ns)</span>
                  {!g.ativo && <span className="chip ml-2 bg-neutral-100 text-neutral-600">Inativo</span>}
                </span>
              )}
              {podeOperar &&
                (editando?.id === g.id ? (
                  <>
                    <button
                      className="btn-primario !min-h-8"
                      disabled={!editando.nome.trim() || ocupado}
                      onClick={async () => {
                        if (await rodar(() => supabase().from("est_grupos").update({ nome: editando.nome.trim() }).eq("id", g.id)))
                          setEditando(null);
                      }}
                    >
                      Salvar
                    </button>
                    <button className="btn !min-h-8" onClick={() => setEditando(null)}>
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn !min-h-8" onClick={() => setEditando({ id: g.id, nome: g.nome })}>
                      Renomear
                    </button>
                    <button
                      className="btn !min-h-8"
                      disabled={ocupado}
                      onClick={() => rodar(() => supabase().from("est_grupos").update({ ativo: !g.ativo }).eq("id", g.id))}
                    >
                      {g.ativo ? "Desativar" : "Reativar"}
                    </button>
                  </>
                ))}
            </li>
          ))}
        </ul>
      )}
      {erro && (
        <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-800">
          {erro}
        </p>
      )}
      <div className="flex justify-end pt-2">
        <button className="btn" onClick={aoFechar}>
          Fechar
        </button>
      </div>
    </Modal>
  );
}
