// Testes de lib/markdown.ts (Markdown simples para HTML, com o texto escapado).
import { describe, expect, it } from "vitest";
import { mdParaHtml } from "./markdown";

describe("mdParaHtml", () => {
  it("converte títulos, listas, citação, negrito e itálico, escapando HTML", () => {
    const md = "# Título\n## Sub\nTexto com **negrito** e _itálico_ <script>\n- um\n- dois\n> citação\n\nfim";
    expect(mdParaHtml(md)).toBe(
      [
        "<h1>Título</h1>",
        "<h2>Sub</h2>",
        "<p>Texto com <b>negrito</b> e <i>itálico</i> &lt;script&gt;</p>",
        "<ul>",
        "<li>um</li>",
        "<li>dois</li>",
        "</ul>",
        "<blockquote>citação</blockquote>",
        "<p>fim</p>",
      ].join("\n"),
    );
  });
  it("fecha a lista no fim do texto", () => {
    expect(mdParaHtml("- a")).toBe("<ul>\n<li>a</li>\n</ul>");
  });
});
