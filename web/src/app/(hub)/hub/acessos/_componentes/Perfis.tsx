// Aba "Perfis" de Pessoas e acessos: lista dos perfis de acesso, quem está em cada um e o editor.
"use client";

import { useState } from "react";
import { useOrg } from "@/lib/org";
import { supabase } from "@/lib/supabase";
import type { Perfil } from "@/dominios/acessos/tipos";
import { Chips } from "./Chips";
import { EditorPerfil } from "./EditorPerfil";

export function Perfis({
  perfis,
  ferramentas,
  uso,
  aoMudar,
  aoErro,
}: {
  perfis: Perfil[];
  ferramentas: { slug: string; nome: string; status: string }[];
  uso: (id: string) => number;
  aoMudar: (txt: string) => Promise<void>;
  aoErro: (e: unknown) => void;
}) {
  const { org } = useOrg();
  const [editando, setEditando] = useState<Perfil | null>(null);

  async function salvar(p: Perfil) {
    const sb = supabase();
    const r = p.id
      ? await sb.from("hub_perfis").update({ nome: p.nome, apps: p.apps }).eq("id", p.id).select("id")
      : await sb.from("hub_perfis").insert({ org_id: org.id, nome: p.nome, apps: p.apps }).select("id");
    if (r.error) return aoErro(r.error);
    setEditando(null);
    await aoMudar(p.id ? `Perfil ${p.nome} salvo. ${uso(p.id)} pessoa(s) atualizada(s).` : `Perfil ${p.nome} criado.`);
  }

  async function excluir(p: Perfil) {
    const n = uso(p.id);
    if (
      !window.confirm(
        n
          ? `${n} pessoa(s) seguem ${p.nome} e passarão a ter acesso manual (mantêm o que têm hoje). Excluir o perfil?`
          : `Excluir o perfil ${p.nome}?`,
      )
    )
      return;
    const { error } = await supabase().from("hub_perfis").delete().eq("id", p.id);
    if (error) return aoErro(error);
    await aoMudar(`Perfil ${p.nome} excluído.`);
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button className="btn" onClick={() => setEditando({ id: "", nome: "", apps: {} })}>
          + Novo perfil
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {perfis.map((p) => (
          <div key={p.id} className="cartao flex flex-col gap-2 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold text-[var(--marca)]">{p.nome}</div>
                <div className="text-xs text-neutral-500">{uso(p.id)} pessoa(s)</div>
              </div>
              <div className="flex gap-2 text-sm">
                <button className="btn-link" onClick={() => setEditando(structuredClone(p))}>
                  Editar
                </button>
                <button className="btn-link !text-[var(--perigo)]" onClick={() => excluir(p)}>
                  Excluir
                </button>
              </div>
            </div>
            <Chips apps={p.apps} ferramentas={ferramentas} />
          </div>
        ))}
      </div>
      {editando && <EditorPerfil perfil={editando} ferramentas={ferramentas} aoFechar={() => setEditando(null)} aoSalvar={salvar} />}
    </div>
  );
}
