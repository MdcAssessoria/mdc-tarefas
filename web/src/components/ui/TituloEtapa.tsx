// Título de uma etapa numerada de formulário longo (dentro do <fieldset>): número num círculo, ícone e o texto.
// Ajuda o leigo a seguir a ordem (1, 2, 3…) e achar o bloco pelo desenho. Uso: <fieldset><TituloEtapa numero={1}
// icone="documento">O contrato</TituloEtapa>…</fieldset>. Regra em docs/08-convencoes.md, seção 8.3.1.
import { Icone } from "./Icone";

export function TituloEtapa({ numero, icone, children }: { numero?: number; icone: string; children: React.ReactNode }) {
  return (
    <legend className="flex items-center gap-2 px-1.5 text-[15px] font-semibold text-[var(--marca)]">
      {numero != null && (
        <span
          aria-hidden="true"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--marca)] text-xs font-semibold text-white"
        >
          {numero}
        </span>
      )}
      <Icone nome={icone} className="h-[18px] w-[18px] shrink-0 text-[var(--destaque-escuro)]" />
      <span>
        {numero != null && <span className="sr-only">{numero}. </span>}
        {children}
      </span>
    </legend>
  );
}
