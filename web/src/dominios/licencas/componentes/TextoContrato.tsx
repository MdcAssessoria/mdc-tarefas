// Mostra na tela o texto do contrato (markdown simples: # título, ## cláusula, - item, **negrito**), igual ao PDF.
// Usado na página pública de assinatura pelo link. Nada de HTML vindo do texto: tudo vira texto puro.
import { Fragment } from "react";

function negrito(linha: string) {
  return linha
    .split(/(\*\*[^*]+\*\*)/g)
    .map((parte, i) =>
      parte.startsWith("**") && parte.endsWith("**") ? <b key={i}>{parte.slice(2, -2)}</b> : <Fragment key={i}>{parte}</Fragment>,
    );
}

export function TextoContrato({ texto }: { texto: string }) {
  const blocos: React.ReactNode[] = [];
  let itens: string[] = [];
  const fecharLista = () => {
    if (!itens.length) return;
    blocos.push(
      <ul key={`l${blocos.length}`} className="list-disc space-y-1 pl-5">
        {itens.map((t, i) => (
          <li key={i}>{negrito(t)}</li>
        ))}
      </ul>,
    );
    itens = [];
  };
  for (const bruta of texto.split("\n")) {
    const l = bruta.trim();
    if (l.startsWith("- ")) {
      itens.push(l.slice(2));
      continue;
    }
    fecharLista();
    if (!l) continue;
    if (l.startsWith("## "))
      blocos.push(
        <h3 key={blocos.length} className="pt-2 font-semibold text-[var(--marca)]">
          {negrito(l.slice(3))}
        </h3>,
      );
    else if (l.startsWith("# "))
      blocos.push(
        <h2 key={blocos.length} className="font-display text-2xl text-[var(--marca)]">
          {negrito(l.slice(2))}
        </h2>,
      );
    else blocos.push(<p key={blocos.length}>{negrito(l)}</p>);
  }
  fecharLista();
  return <div className="space-y-3 text-[15px] leading-relaxed text-neutral-800">{blocos}</div>;
}
