// Moldura das páginas públicas do MDC · Pessoal que não são a entrada (Política de privacidade, Excluir minha conta):
// faixa verde com a marca, texto em coluna de leitura e rodapé com a empresa. Funciona sem login e no celular.
import Link from "next/link";
import { caminho } from "@/lib/caminho";
import { Icone } from "@/components/ui/Icone";
import { LINHA_EMPRESA } from "@/lib/identidade";

export function PaginaSimples({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F6F4EE]">
      <header className="bg-[var(--marca)] px-4 py-5 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <img src={caminho("/logo-mdc-dourado.png")} alt="MDC" className="h-9 w-auto" />
          <span className="border-l border-[var(--destaque)]/40 pl-3 font-display text-xl text-white">Pessoal</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Link href="/pessoal" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#8A6A2A]">
          <Icone nome="voltar" className="h-4 w-4" />
          Voltar para o MDC · Pessoal
        </Link>
        <h1 className="mt-3 font-display text-3xl text-[var(--marca)]">{titulo}</h1>
        <div className="mt-6 space-y-5 rounded-2xl border border-[var(--borda)] bg-white p-5 text-[15px] leading-relaxed text-neutral-800 sm:p-8">
          {children}
        </div>
        <p className="mt-6 text-center text-xs text-neutral-500">{LINHA_EMPRESA}</p>
      </main>
    </div>
  );
}

/** Título de seção dentro do texto. */
export function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-[var(--marca)]">{titulo}</h2>
      {children}
    </section>
  );
}
