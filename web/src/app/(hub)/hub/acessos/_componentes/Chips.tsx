// Selos das ferramentas liberadas para uma pessoa ou perfil, com o nível de cada uma.
"use client";

import type { PapelApp } from "@/lib/types";
import { COR_NIVEL, nomeNivel } from "./niveis";

export function Chips({ apps, ferramentas }: { apps: Record<string, PapelApp>; ferramentas: { slug: string; nome: string }[] }) {
  const itens = ferramentas.filter((f) => apps[f.slug]);
  if (!itens.length) return <span className="text-xs text-neutral-400">nenhuma</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {itens.map((f) => (
        <span key={f.slug} className={`chip ${COR_NIVEL[apps[f.slug]]}`} title={`${f.nome}: ${nomeNivel(apps[f.slug])}`}>
          {f.nome} · {nomeNivel(apps[f.slug])}
        </span>
      ))}
    </div>
  );
}
