// Texto padrão enquanto os dados chegam.

export function Carregando({ texto = "Carregando…" }: { texto?: string }) {
  return (
    <p role="status" className="text-sm text-neutral-500">
      {texto}
    </p>
  );
}
