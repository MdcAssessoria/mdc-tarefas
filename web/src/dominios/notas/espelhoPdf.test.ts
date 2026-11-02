// PDF do espelho: abre como PDF válido, uma folha para a nota pequena e quebra automática nos itens da nota grande.
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { montarEspelho } from "./espelho";
import { gerarEspelhoPdf } from "./espelhoPdf";
import { NFSE_ABRASF, NFSE_COMPLETA, PROC_CTE, PROC_NFE_COMPLETA, RES_EVENTO_CANCELAMENTO, RES_NFE } from "./exemplosXml";

/** A mesma NF-e com `n` itens (repete o primeiro item). */
function nfeComItens(n: number): string {
  const det = /<det nItem="1">[\s\S]*?<\/det>/.exec(PROC_NFE_COMPLETA)![0];
  const muitos = Array.from({ length: n }, (_, i) =>
    det
      .replace('nItem="1"', `nItem="${i + 1}"`)
      .replace("Parafuso sextavado 10mm (cx 100)", `Parafuso sextavado 10mm (cx 100) item ${i + 1}`),
  ).join("");
  return PROC_NFE_COMPLETA.replace(/<det nItem="1">[\s\S]*<\/det>/, muitos);
}

const paginas = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPageCount();

describe("PDF do espelho", () => {
  it("NF-e com 3 itens cabe em uma folha A4 retrato", async () => {
    const bytes = await gerarEspelhoPdf(montarEspelho(PROC_NFE_COMPLETA), { geradoEm: new Date("2026-11-02T12:00:00Z") });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect([Math.round(width), Math.round(height)]).toEqual([595, 842]);
    expect(doc.getTitle()).toBe("NF-e 5678 · Fornecedor de Teste & Cia Ltda");
  });

  it("NF-e com 120 itens quebra em várias folhas", async () => {
    expect(montarEspelho(nfeComItens(120)).blocos.find((b) => b.tipo === "tabela")).toMatchObject({ linhas: { length: 120 } });
    expect(await paginas(await gerarEspelhoPdf(montarEspelho(nfeComItens(120))))).toBeGreaterThanOrEqual(3);
  });

  it("NFS-e nacional, ABRASF, CT-e, resumo e genérico geram PDF de uma folha", async () => {
    for (const xml of [NFSE_COMPLETA, NFSE_ABRASF, PROC_CTE, RES_NFE, RES_EVENTO_CANCELAMENTO])
      expect(await paginas(await gerarEspelhoPdf(montarEspelho(xml)))).toBe(1);
  });
});
