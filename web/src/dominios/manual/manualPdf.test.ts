// Teste do PDF do manual: gera o manual inteiro (sem imagens) e confere capa, páginas e caracteres especiais.
import { readFile, writeFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { MANUAL_MD } from "./conteudo";
import { lerManual } from "./manual";
import { gerarManualPdf, textoPdf } from "./manualPdf";

describe("PDF do manual", () => {
  it("troca setas e tira o que a fonte não desenha", () => {
    expect(textoPdf("Edição → Validado ← volta 😀")).toBe("Edição › Validado ‹ volta ");
  });

  it("gera o manual inteiro com capa e uma área por página nova", async () => {
    const areas = lerManual(MANUAL_MD);
    const logo = new Uint8Array(await readFile(`${process.cwd()}/public/logo-mdc-dourado.png`));
    const bytes = await gerarManualPdf({
      areas,
      titulo: "Manual do HUB-MDC",
      subtitulo: "Versão 1.0",
      rodape: "MDC Assessoria · Manual do HUB-MDC",
      logo,
    });
    if (process.env.MANUAL_PDF_SAIDA) await writeFile(process.env.MANUAL_PDF_SAIDA, bytes);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(areas.length);
    expect(doc.getTitle()).toBe("Manual do HUB-MDC");
  }, 30000);
});
