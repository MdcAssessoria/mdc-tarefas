// Testes da exportação de listas: datas de verdade e decimais no Excel (D-08) e o PDF sem título repetido,
// com "(continuação)" nas folhas seguintes e sem "…" nas células (DES-06/DES-07).
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { PDFArray, PDFDocument, PDFRawStream } from "pdf-lib";
import { dataDaCelula, formatoExcel } from "./exportarLista";
import type { ColunaLista } from "./exportarLista";
import { gerarRelatorioPdf } from "./relatorioPdf";

type L = { d: string; q: number; n: string };
const col = (c: Partial<ColunaLista<L>>): ColunaLista<L> => ({ titulo: "x", valor: () => null, ...c });

describe("Excel das listas (D-08)", () => {
  it("reconhece data em dd/mm/aaaa e aaaa-mm-dd", () => {
    expect(dataDaCelula("31/12/2026")).toBe("2026-12-31");
    expect(dataDaCelula("2026-12-31")).toBe("2026-12-31");
    expect(dataDaCelula("31/12/2026 10:00")).toBeNull();
    expect(dataDaCelula("Fatura 2026/00001")).toBeNull();
  });
  it("coluna só de datas vira data; número com casas não arredonda", () => {
    const linhas: L[] = [
      { d: "01/11/2026", q: 1.5, n: "a" },
      { d: "", q: 2, n: "b" },
    ];
    expect(formatoExcel(col({ valor: (l) => l.d }), linhas)).toBe("data");
    expect(formatoExcel(col({ valor: (l) => l.n }), linhas)).toBe("texto");
    expect(formatoExcel(col({ valor: (l) => l.q, formato: "numero" }), linhas)).toBe("decimal");
    expect(formatoExcel(col({ valor: () => 3, formato: "numero" }), linhas)).toBe("numero");
    expect(formatoExcel(col({ valor: (l) => l.q, formato: "moeda" }), linhas)).toBe("moeda");
  });
});

/** Texto de cada página do PDF (hex dos operadores Tj). */
async function textos(bytes: Uint8Array): Promise<string[][]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((p) => {
    const c = p.node.Contents();
    const refs = c instanceof PDFArray ? c.asArray() : c ? [c] : [];
    const bruto = refs
      .map((r) => {
        const s = doc.context.lookup(r);
        if (!(s instanceof PDFRawStream)) return "";
        try {
          return inflateSync(Buffer.from(s.contents)).toString("latin1");
        } catch {
          return Buffer.from(s.contents).toString("latin1");
        }
      })
      .join("\n");
    return [...bruto.matchAll(/<([0-9A-Fa-f]*)> Tj/g)].map((m) => Buffer.from(m[1], "hex").toString("latin1"));
  });
}

describe("PDF das listas (DES-06/DES-07)", () => {
  it("título uma vez, (continuação) nas folhas seguintes e texto longo quebrado sem …", async () => {
    const longo = "Fornecedor com um nome muito comprido de propósito para não caber na coluna estreita da tabela";
    const bytes = await gerarRelatorioPdf({
      titulo: "Contas a pagar",
      subtitulo: "Empresa X",
      secoes: [
        {
          titulo: "",
          colunas: [
            { titulo: "Nome", peso: 1 },
            { titulo: "Valor", peso: 1, direita: true },
          ],
          linhas: Array.from({ length: 80 }, (_, k) => ({ celulas: [k === 0 ? longo : `Linha ${k}`, "R$ 10,00"] })),
        },
      ],
    });
    const pgs = await textos(bytes);
    expect(pgs.length).toBeGreaterThan(1);
    expect(pgs[0].filter((t) => t === "Contas a pagar")).toHaveLength(1);
    for (const p of pgs.slice(1)) expect(p).toContain("Contas a pagar (continuação)");
    expect(pgs.flat().some((t) => t.includes("…"))).toBe(false);
    expect(pgs[0].join(" ")).toContain("comprido");
  });
});
