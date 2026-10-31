// Markdown simples (títulos, listas, citação, negrito, itálico) para HTML, escapando o texto antes. Usado no
// parecer dos demonstrativos e no modelo de contrato do CRM.

/** Markdown simples (títulos, listas, negrito, itálico) → HTML para tela e impressão. */
export function mdParaHtml(md: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(/_(.+?)_/g, "<i>$1</i>");
  const out: string[] = [];
  let lista = false;
  for (const linha of md.split("\n")) {
    const l = linha.trimEnd();
    if (/^- /.test(l)) {
      if (!lista) out.push("<ul>");
      lista = true;
      out.push(`<li>${inline(l.slice(2))}</li>`);
      continue;
    }
    if (lista) {
      out.push("</ul>");
      lista = false;
    }
    if (/^> /.test(l)) out.push(`<blockquote>${inline(l.slice(2))}</blockquote>`);
    else if (/^# /.test(l)) out.push(`<h1>${inline(l.slice(2))}</h1>`);
    else if (/^## /.test(l)) out.push(`<h2>${inline(l.slice(3))}</h2>`);
    else if (l) out.push(`<p>${inline(l)}</p>`);
  }
  if (lista) out.push("</ul>");
  return out.join("\n");
}
