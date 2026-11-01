// Esqueleto enquanto os dados chegam: blocos cinza com brilho no formato da tela (indicadores + lista).
// Anuncia "Carregando…" a leitores de tela (e o script de telas espera esse texto sumir).

export function Esqueleto({ indicadores = 3, linhas = 6 }: { indicadores?: number; linhas?: number }) {
  return (
    <div role="status" className="space-y-4" aria-live="polite">
      <span className="sr-only">Carregando…</span>
      {indicadores > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: indicadores }, (_, i) => (
            <div key={i} className="cartao space-y-3 p-4" aria-hidden="true">
              <div className="esqueleto h-3 w-24" />
              <div className="esqueleto h-6 w-36" />
            </div>
          ))}
        </div>
      )}
      <div className="cartao divide-y divide-[var(--borda)]" aria-hidden="true">
        {Array.from({ length: linhas }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <div className="esqueleto h-3 w-16" />
            <div className="esqueleto h-3 flex-1" style={{ maxWidth: `${55 + ((i * 17) % 35)}%` }} />
            <div className="esqueleto ml-auto h-3 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
