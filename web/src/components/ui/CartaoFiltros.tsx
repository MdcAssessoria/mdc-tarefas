// Cartão de filtros padrão das telas de lista: os campos (no máximo três à vista + "Mais filtros"), as etiquetas dos
// filtros em uso (cada uma com X para tirar) e "Limpar filtros". Molde em docs/08-convencoes.md (8.3.1).
"use client";

import { Icone } from "./Icone";

export interface FiltroAtivo {
  /** Identificador estável (chave da lista). */
  id: string;
  /** O que aparece na etiqueta: "Situação: Vencidos". */
  rotulo: string;
  /** Tira só este filtro (volta ao padrão). */
  aoTirar: () => void;
}

export function CartaoFiltros({
  children,
  ativos = [],
  aoLimpar,
}: {
  children: React.ReactNode;
  ativos?: FiltroAtivo[];
  /** Volta todos os filtros ao padrão. Sem ele, o botão "Limpar filtros" não aparece. */
  aoLimpar?: () => void;
}) {
  return (
    <section className="cartao cartao-filtros p-4" aria-label="Filtros">
      <div className="flex flex-wrap items-end gap-3">{children}</div>
      {ativos.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--borda)] pt-3">
          <span className="flex items-center gap-1 text-[12px] text-[var(--texto-suave)]">
            <Icone nome="filtro" className="h-3.5 w-3.5" />
            Filtrando por
          </span>
          {ativos.map((f) => (
            <span key={f.id} className="chip border border-[#eadbb8] bg-[#faf5ea] pr-1 text-[#5e4818]">
              {f.rotulo}
              <button
                type="button"
                onClick={f.aoTirar}
                className="grid h-5 w-5 place-items-center rounded-full hover:bg-[#efe2c4]"
                aria-label={`Tirar o filtro ${f.rotulo}`}
                title="Tirar este filtro"
              >
                <Icone nome="fechar" className="h-3 w-3" />
              </button>
            </span>
          ))}
          {aoLimpar && (
            <button type="button" className="btn-link ml-1" onClick={aoLimpar}>
              Limpar filtros
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** "Mais filtros": campos menos usados, recolhidos. Mostra quantos estão em uso. */
export function MaisFiltros({ emUso = 0, children }: { emUso?: number; children: React.ReactNode }) {
  return (
    <details className="group w-full sm:w-auto">
      <summary className="btn list-none [&::-webkit-details-marker]:hidden">
        <Icone nome="filtro" className="h-4 w-4" />
        Mais filtros
        {emUso > 0 && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--marca)] px-1 text-[11px] text-white">{emUso}</span>
        )}
        <Icone nome="chevron-baixo" className="h-4 w-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-3 flex flex-wrap items-end gap-3">{children}</div>
    </details>
  );
}
