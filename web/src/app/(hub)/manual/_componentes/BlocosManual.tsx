// Desenha os blocos do manual (parágrafo com negrito, listas, tabelas e imagens das telas) no padrão visual do HUB-MDC.
// padrao: sem-exportar (as tabelas são parte do texto do manual; o manual inteiro baixa em PDF no topo da tela)
import { Icone } from "@/components/ui/Icone";
import { marcarPalavras, partesDoTexto, type Bloco } from "@/dominios/manual/manual";
import { caminho } from "@/lib/caminho";

/** Texto com **negrito** e, se houver busca, as palavras encontradas marcadas. */
export function TextoManual({ texto, busca = "" }: { texto: string; busca?: string }) {
  return (
    <>
      {partesDoTexto(texto).map((p, i) => {
        const pedacos = marcarPalavras(p.texto, busca).map((m, k) =>
          m.marcado ? (
            <mark key={k} className="rounded bg-[var(--destaque)]/60 px-0.5 text-inherit">
              {m.texto}
            </mark>
          ) : (
            <span key={k}>{m.texto}</span>
          ),
        );
        return p.negrito ? (
          <strong key={i} className="font-semibold text-[var(--texto)]">
            {pedacos}
          </strong>
        ) : (
          <span key={i}>{pedacos}</span>
        );
      })}
    </>
  );
}

export function BlocosManual({ blocos, busca = "" }: { blocos: Bloco[]; busca?: string }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-[var(--texto)]">
      {blocos.map((b, i) => {
        if (b.tipo === "paragrafo")
          return (
            <p key={i}>
              <TextoManual texto={b.texto} busca={busca} />
            </p>
          );
        if (b.tipo === "lista") {
          const itens = b.itens.map((it, k) => (
            <li key={k} className="pl-1">
              <TextoManual texto={it} busca={busca} />
            </li>
          ));
          return b.ordenada ? (
            <ol key={i} start={b.inicio} className="list-decimal space-y-1 pl-6 marker:font-semibold marker:text-[var(--marca)]">
              {itens}
            </ol>
          ) : (
            <ul key={i} className="list-disc space-y-1 pl-6 marker:text-[var(--marca)]">
              {itens}
            </ul>
          );
        }
        if (b.tipo === "tabela")
          return (
            <div key={i} className="overflow-x-auto rounded border border-[var(--borda)]">
              <table className="tabela">
                <thead>
                  <tr>
                    {b.cabecalho.map((c, k) => (
                      <th key={k}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.linhas.map((l, k) => (
                    <tr key={k}>
                      {l.map((c, j) => (
                        <td key={j} className="align-top">
                          <TextoManual texto={c} busca={busca} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        return (
          <figure key={i} className="my-2">
            <a
              href={caminho(b.src)}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden rounded-lg border border-[var(--borda)] shadow-sm"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={caminho(b.src)} alt={b.alt} loading="lazy" className="block h-auto w-full" />
            </a>
            <figcaption className="mt-1 flex items-center gap-1 text-xs text-[var(--texto-suave)]">
              <Icone nome="olho" className="h-4 w-4" />
              {b.alt} · toque na imagem para ver em tamanho real
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}
