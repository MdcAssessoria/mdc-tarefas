// Parecer do contador renderizado com o cabeçalho e o rodapé da MDC (também usado na impressão e no PDF).
import { mdParaHtml } from "@/lib/markdown";
import { caminho } from "@/lib/caminho";
import { IDENTIDADE_MDC, LINHA_EMPRESA } from "@/lib/identidade";

/** Parecer renderizado com o cabeçalho e a assinatura da MDC (também usado na impressão/PDF). */
export function VisaoParecer({ texto, empresa, cnpj }: { texto: string; empresa: string; cnpj?: string | null }) {
  return (
    <article className="parecer cartao p-6 print:border-0 print:p-0">
      <header className="mb-4 flex items-center justify-between gap-3 border-b-2 border-[var(--destaque)] pb-3">
        <div className="flex items-center gap-3">
          <img src={caminho("/icone-hub-mdc.svg")} alt="" className="h-10 w-10 rounded-md" />
          <div>
            <div className="font-semibold text-[var(--marca)]">{IDENTIDADE_MDC.nomeComercial}</div>
            <div className="text-xs text-neutral-500">
              {IDENTIDADE_MDC.areas} · {IDENTIDADE_MDC.site}
            </div>
          </div>
        </div>
        <div className="text-right text-xs text-neutral-600">
          {empresa}
          {cnpj && <div>{cnpj}</div>}
        </div>
      </header>
      <div className="prosa" dangerouslySetInnerHTML={{ __html: mdParaHtml(texto) }} />
      <footer className="mt-6 border-t border-[var(--borda)] pt-2 text-[11px] text-neutral-500">
        {LINHA_EMPRESA} · {IDENTIDADE_MDC.telefone} · {IDENTIDADE_MDC.email}
      </footer>
    </article>
  );
}
