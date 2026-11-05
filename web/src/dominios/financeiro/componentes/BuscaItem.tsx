// Campo de busca de item para o pedido: digita parte do nome, código ou código de barras (leitor de código de barras
// funciona: ele "digita" e dá Enter), aparecem até 8 itens com saldo e preço; Enter ou clique inclui. Se não achar,
// oferece o cadastro rápido com o nome digitado.
"use client";

import { useId, useMemo, useState } from "react";
import { brl } from "@/lib/formato/moeda";
import { combinaBusca, qtdBr } from "../estoqueRegras";
import type { Item } from "../tipos";
import { Icone } from "@/components/ui/Icone";

export function BuscaItem({
  itens,
  saldo,
  tipo,
  aoEscolher,
  aoCadastrar,
}: {
  itens: Item[];
  saldo: (item: string) => number;
  tipo: "venda" | "compra";
  aoEscolher: (item: Item) => void;
  /** Cadastro rápido com o texto digitado (opcional). */
  aoCadastrar?: (nome: string) => void;
}) {
  const id = useId();
  const [q, setQ] = useState("");
  const [ativo, setAtivo] = useState(0);
  const resultados = useMemo(() => {
    if (!q.trim()) return [];
    const exato = itens.filter((i) => i.codigo_barras === q.trim() || i.codigo === q.trim());
    const resto = itens.filter((i) => !exato.includes(i) && combinaBusca([i.nome, i.codigo, i.codigo_barras, i.marca], q));
    return [...exato, ...resto].slice(0, 8);
  }, [itens, q]);
  const abrir = q.trim().length > 0;

  function escolher(i: Item) {
    aoEscolher(i);
    setQ("");
    setAtivo(0);
  }

  return (
    <div className="relative">
      <label className="campo">
        <span>Incluir item</span>
        <input
          type="search"
          role="combobox"
          aria-expanded={abrir}
          aria-controls={id}
          aria-autocomplete="list"
          value={q}
          placeholder="Digite o nome, o código ou passe o leitor de código de barras"
          onChange={(e) => {
            setQ(e.target.value);
            setAtivo(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setAtivo((a) => Math.min(a + 1, resultados.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setAtivo((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (resultados[ativo]) escolher(resultados[ativo]);
            } else if (e.key === "Escape" && q) {
              e.stopPropagation();
              setQ("");
            }
          }}
        />
      </label>
      {abrir && (
        <ul id={id} role="listbox" className="cartao absolute z-20 mt-1 max-h-72 w-full overflow-auto p-1 shadow-lg">
          {resultados.map((i, k) => (
            <li key={i.id} role="option" aria-selected={k === ativo}>
              <button
                type="button"
                onMouseEnter={() => setAtivo(k)}
                onClick={() => escolher(i)}
                className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm ${k === ativo ? "bg-amber-50" : ""}`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{i.nome}</span>
                  <span className="block text-xs text-neutral-500">
                    {[
                      i.codigo && `cód. ${i.codigo}`,
                      i.tipo === "servico"
                        ? "Serviço"
                        : i.controla_estoque
                          ? `saldo ${qtdBr(saldo(i.id))} ${i.unidade}`
                          : "não controla estoque",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums text-neutral-700">
                  {tipo === "venda"
                    ? i.preco_venda != null
                      ? brl(Number(i.preco_venda))
                      : "sem preço"
                    : i.custo != null
                      ? brl(Number(i.custo))
                      : ""}
                </span>
              </button>
            </li>
          ))}
          {!resultados.length && <li className="px-3 py-2 text-sm text-neutral-500">Nenhum item encontrado.</li>}
          {aoCadastrar && (
            <li>
              <button
                type="button"
                onClick={() => aoCadastrar(q.trim())}
                className="w-full rounded-md px-3 py-2 text-left text-sm text-[var(--marca)] hover:bg-[var(--fundo)]"
              >
                <Icone nome="mais" className="inline h-4 w-4 align-[-3px]" />
                Cadastrar &quot;{q.trim()}&quot; como item novo
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
