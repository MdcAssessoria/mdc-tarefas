// Leitura do certificado A1 (.pfx) e assinatura PAdES do PDF.
import { Buffer } from "node:buffer";
import type { PDFDocument } from "pdf-lib";
import { pdflibAddPlaceholder } from "@signpdf/placeholder-pdf-lib";
import { P12Signer } from "@signpdf/signer-p12";
import { SignPdf } from "@signpdf/signpdf";

/** Assina o PDF (assinatura digital incorporada, verificável no Adobe e no validar.iti.gov.br). */
export async function assinar(
  pdf: PDFDocument,
  pfx: Uint8Array,
  senha: string,
  o: { nome: string; motivo: string; local: string; contato: string },
): Promise<Uint8Array> {
  pdflibAddPlaceholder({
    pdfDoc: pdf,
    reason: o.motivo,
    contactInfo: o.contato,
    name: o.nome,
    location: o.local,
    signatureLength: 16384,
  });
  const bytes = await pdf.save({ useObjectStreams: false });
  const signer = new P12Signer(Buffer.from(pfx), { passphrase: senha });
  const assinado = await new SignPdf().sign(Buffer.from(bytes), signer);
  return new Uint8Array(assinado);
}
