// Campo com um link (convite, redefinição de senha) e botão para copiar.
"use client";

import { useState } from "react";

export function LinkCopiavel({ link }: { link: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="mt-2 flex gap-2">
      <input readOnly value={link} className="entrada flex-1 !min-h-8 text-xs" onFocus={(e) => e.target.select()} />
      <button
        className="btn !min-h-8"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            setCopiado(true);
          } catch {}
        }}
      >
        {copiado ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}
