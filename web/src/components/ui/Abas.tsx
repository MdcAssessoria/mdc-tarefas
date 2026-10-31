"use client";
// Barra de abas (uma linha de botões sobre o conteúdo). Acessível: role="tablist"/"tab" e aria-selected.

export interface Aba<T extends string> {
  id: T;
  nome: React.ReactNode;
}

/** Abas controladas: quem usa guarda a aba escolhida (`valor`) e troca em `aoMudar`. */
export function Abas<T extends string>({
  itens,
  valor,
  aoMudar,
  rotulo,
}: {
  itens: Aba<T>[];
  valor: T;
  aoMudar: (id: T) => void;
  rotulo?: string;
}) {
  return (
    <div role="tablist" aria-label={rotulo} className="flex gap-1 overflow-x-auto border-b border-[var(--borda)]">
      {itens.map((a) => (
        <button
          key={a.id}
          role="tab"
          aria-selected={valor === a.id}
          onClick={() => aoMudar(a.id)}
          className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
            valor === a.id
              ? "border-[var(--destaque-escuro)] font-medium text-[var(--marca)]"
              : "border-transparent text-[var(--texto-suave)]"
          }`}
        >
          {a.nome}
        </button>
      ))}
    </div>
  );
}
