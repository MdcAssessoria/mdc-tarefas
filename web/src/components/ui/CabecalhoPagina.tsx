// Cabeçalho padrão de página: título, frase curta do que a tela faz e as ações à direita (no celular, abaixo).
// Molde descrito em docs/08-convencoes.md (8.3.1).

export function CabecalhoPagina({
  titulo,
  descricao,
  acoes,
  icone,
}: {
  titulo: React.ReactNode;
  descricao?: React.ReactNode;
  /** Botões da tela (exportar, novo…). O principal vai por último, à direita. */
  acoes?: React.ReactNode;
  /** Elemento opcional antes do título (ex.: <Icone /> num quadrado). */
  icone?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {icone}
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-[var(--marca)]">{titulo}</h1>
          {descricao && <p className="mt-0.5 text-sm text-[var(--texto-suave)]">{descricao}</p>}
        </div>
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{acoes}</div>}
    </div>
  );
}
