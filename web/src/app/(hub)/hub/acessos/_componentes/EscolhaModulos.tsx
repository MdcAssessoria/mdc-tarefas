// Escolha dos módulos de uma pessoa da equipe, um a um (sem acesso, ver, operar, gerir), separados em Escritório e
// Gestão. Usada no cadastro e na edição da pessoa (acesso personalizado). Só o administrador chega aqui.
"use client";

import type { HubApp, PapelApp } from "@/dominios/acessos/tipos";
import type { Perfil } from "@/dominios/acessos/tipos";
import { ehModuloGestao } from "@/components/shell/navegacao";

export type Modulos = Record<string, PapelApp>;

const NIVEIS: { id: PapelApp | ""; nome: string; dica: string }[] = [
  { id: "", nome: "Não vê", dica: "O módulo nem aparece no menu" },
  { id: "ver", nome: "Ver", dica: "Só consulta e exporta" },
  { id: "operar", nome: "Operar", dica: "Consulta, lança e edita o dia a dia" },
  { id: "gerir", nome: "Gerir", dica: "Tudo, inclusive configurar, cancelar e aprovar" },
];

/** Módulos que dá para liberar: os do catálogo que estão em uso (não desligados nem "em breve"). */
export const modulosLiberaveis = (apps: HubApp[]) => apps.filter((a) => a.status === "ativo" || a.status === "beta");

export function EscolhaModulos({
  apps,
  valor,
  aoMudar,
  perfis = [],
}: {
  apps: HubApp[];
  valor: Modulos;
  aoMudar: (v: Modulos) => void;
  /** Para "preencher a partir de um perfil" (opcional). */
  perfis?: Perfil[];
}) {
  const lista = modulosLiberaveis(apps);
  const grupos: [string, HubApp[]][] = [
    ["Escritório", lista.filter((a) => !ehModuloGestao(a.slug))],
    ["Gestão (da MDC e Cobrança Ledgra)", lista.filter((a) => ehModuloGestao(a.slug))],
  ];
  const marcados = Object.keys(valor).length;

  function definir(slug: string, nivel: PapelApp | "") {
    const novo = { ...valor };
    if (nivel) novo[slug] = nivel;
    else delete novo[slug];
    aoMudar(novo);
  }

  return (
    <fieldset className="space-y-3 rounded-lg border border-[var(--borda)] p-3">
      <legend className="px-1 text-sm font-medium text-[var(--texto)]">Módulos que a pessoa vê ({marcados})</legend>
      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--texto-suave)]">
        {NIVEIS.slice(1).map((n) => (
          <span key={n.id}>
            <b className="text-[var(--texto)]">{n.nome}</b>: {n.dica.toLowerCase()}
          </span>
        ))}
      </div>
      {perfis.length > 0 && (
        <label className="campo">
          <span>Preencher a partir de um perfil (opcional)</span>
          <select
            value=""
            onChange={(e) => {
              const p = perfis.find((x) => x.id === e.target.value);
              if (p) aoMudar(Object.fromEntries(Object.entries(p.apps).filter(([k]) => lista.some((a) => a.slug === k))));
            }}
          >
            <option value="">Escolha um perfil para copiar os módulos…</option>
            {perfis.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
      )}
      {grupos
        .filter(([, itens]) => itens.length)
        .map(([titulo, itens]) => (
          <div key={titulo}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--texto-suave)]">{titulo}</p>
            <ul className="divide-y divide-[var(--borda)] rounded-md border border-[var(--borda)] bg-white">
              {itens.map((a) => {
                const atual = valor[a.slug] ?? "";
                return (
                  <li key={a.slug} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span className="min-w-0">
                      <span className={`block text-sm font-medium ${atual ? "text-[var(--texto)]" : "text-[var(--texto-suave)]"}`}>
                        {a.nome}
                      </span>
                      {a.descricao && <span className="block truncate text-xs text-[var(--texto-suave)] sm:max-w-xs">{a.descricao}</span>}
                    </span>
                    <span
                      role="radiogroup"
                      aria-label={`Acesso a ${a.nome}`}
                      className="flex overflow-hidden rounded-md border border-[var(--borda)] text-xs"
                    >
                      {NIVEIS.map((n) => (
                        <button
                          key={n.id || "nada"}
                          type="button"
                          role="radio"
                          aria-checked={atual === n.id}
                          title={n.dica}
                          onClick={() => definir(a.slug, n.id)}
                          className={`min-h-9 px-2.5 ${
                            atual === n.id
                              ? n.id
                                ? "bg-[var(--marca)] font-medium text-white"
                                : "bg-neutral-200 font-medium text-neutral-700"
                              : "bg-white text-neutral-600 hover:bg-[var(--fundo)]"
                          }`}
                        >
                          {n.nome}
                        </button>
                      ))}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
    </fieldset>
  );
}
