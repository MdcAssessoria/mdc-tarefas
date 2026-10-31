// Busca rápida do HUB (Ctrl/⌘ K): leva a ferramentas, páginas e clientes digitando parte do nome, CNPJ ou código.
"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOrg } from "@/lib/org";
import { nomeCliente } from "@/lib/clientes";
import { semAcento } from "@/lib/texto";
import { Icone } from "@/components/Icone";
import { NAV, filtrarLinks } from "./navegacao";
import type { Modulo } from "./navegacao";

interface ItemBusca {
  id: string;
  grupo: string;
  nome: string;
  detalhe?: string;
  icone: string;
  href: string;
  externo?: boolean;
}

/** Busca rápida (Ctrl/⌘ K): ferramentas, páginas e clientes. */
export function BuscaRapida({ aoFechar }: { aoFechar: () => void }) {
  const { apps, pode, podeEditarCadastros, papel, clientes } = useOrg();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const lista = useRef<HTMLDivElement>(null);

  const base = useMemo<ItemBusca[]>(() => {
    const itens: ItemBusca[] = [
      { id: "inicio", grupo: "Ir para", nome: "Início", icone: "casa", href: "/" },
      { id: "nova-tarefa", grupo: "Ações", nome: "Nova tarefa", icone: "mais", href: "/tarefas?nova=1" },
    ];
    for (const a of apps.filter((x) => x.papel && x.status !== "em_breve")) {
      const mod = NAV[a.slug as Modulo];
      if (!mod) {
        itens.push({
          id: a.slug,
          grupo: "Ferramentas",
          nome: a.nome,
          detalhe: a.descricao,
          icone: a.icone,
          href: a.rota,
          externo: a.externo,
        });
        continue;
      }
      for (const l of filtrarLinks(a.slug as Modulo, { pode, podeEditarCadastros }))
        itens.push({
          id: l.href,
          grupo: "Ferramentas",
          nome: l.nome === mod.titulo ? mod.titulo : `${mod.titulo}: ${l.nome}`,
          icone: a.icone,
          href: l.href,
        });
    }
    if (papel === "admin")
      itens.push({ id: "acessos", grupo: "Administração", nome: "Pessoas e acessos", icone: "pessoas", href: "/hub/acessos" });
    if (podeEditarCadastros)
      itens.push({ id: "config", grupo: "Administração", nome: "Configurações e clientes", icone: "engrenagem", href: "/config" });
    if (pode("tarefas"))
      for (const c of clientes.filter((c) => c.ativo))
        itens.push({
          id: "cli-" + c.id,
          grupo: "Clientes",
          nome: nomeCliente(c),
          detalhe: [c.cnpj, c.codigo_dominio && `Domínio ${c.codigo_dominio}`].filter(Boolean).join("  ·  ") || undefined,
          icone: "pasta",
          href: `/tarefas?cliente=${c.id}`,
        });
    return itens;
  }, [apps, pode, podeEditarCadastros, papel, clientes]);

  const resultado = useMemo(() => {
    const t = semAcento(q.trim().toLowerCase());
    if (!t) return base.filter((x) => x.grupo !== "Clientes");
    return base.filter((x) => semAcento(`${x.nome} ${x.detalhe ?? ""}`.toLowerCase()).includes(t)).slice(0, 40);
  }, [q, base]);

  useEffect(() => setI(0), [q]);
  useEffect(() => {
    lista.current?.querySelector(`[data-i="${i}"]`)?.scrollIntoView({ block: "nearest" });
  }, [i]);

  const abrir = useCallback(
    (x: ItemBusca | undefined) => {
      if (!x) return;
      aoFechar();
      if (x.externo) window.open(x.href, "_blank", "noopener");
      else router.push(x.href);
    },
    [aoFechar, router],
  );

  let ultimoGrupo = "";
  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-[rgba(11,40,32,0.35)] p-4 pt-[12vh] backdrop-blur-[2px]"
      onClick={aoFechar}
    >
      <div
        className="surgir w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--borda)] bg-white shadow-[0_24px_60px_-20px_rgba(11,40,32,0.45)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Buscar ou ir para"
      >
        <div className="flex items-center gap-3 border-b border-[var(--borda)] px-4">
          <Icone nome="busca" className="h-5 w-5 text-[var(--texto-suave)]" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") aoFechar();
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setI((x) => Math.min(x + 1, resultado.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setI((x) => Math.max(x - 1, 0));
              } else if (e.key === "Enter") abrir(resultado[i]);
            }}
            placeholder="Ferramenta, página ou cliente (nome, CNPJ, código)"
            className="h-14 flex-1 bg-transparent text-[15px] outline-none focus-visible:outline-none"
            role="combobox"
            aria-expanded="true"
            aria-controls="busca-rapida-lista"
          />
          <kbd className="rounded border border-[var(--borda)] px-1.5 text-[11px] text-[var(--texto-suave)]">Esc</kbd>
        </div>
        <div ref={lista} id="busca-rapida-lista" role="listbox" className="max-h-[52vh] overflow-y-auto p-2">
          {resultado.length === 0 && <p className="px-3 py-6 text-center text-sm text-[var(--texto-suave)]">Nada encontrado para “{q}”.</p>}
          {resultado.map((x, k) => {
            const cab = x.grupo !== ultimoGrupo ? (ultimoGrupo = x.grupo) : null;
            return (
              <div key={x.id}>
                {cab && <div className="px-3 pb-1 pt-3 text-[12px] text-[var(--texto-suave)]">{cab}</div>}
                <button
                  data-i={k}
                  role="option"
                  aria-selected={k === i}
                  onMouseEnter={() => setI(k)}
                  onClick={() => abrir(x)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[14px] ${k === i ? "bg-[var(--fundo)] text-[var(--marca)]" : ""}`}
                >
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${k === i ? "bg-[var(--marca)] text-[var(--destaque)]" : "bg-[var(--fundo)] text-[var(--texto-suave)]"}`}
                  >
                    <Icone nome={x.icone} className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{x.nome}</span>
                    {x.detalhe && <span className="block truncate text-[12px] text-[var(--texto-suave)]">{x.detalhe}</span>}
                  </span>
                  {k === i && <span className="text-[12px] text-[var(--texto-suave)]">Enter</span>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
