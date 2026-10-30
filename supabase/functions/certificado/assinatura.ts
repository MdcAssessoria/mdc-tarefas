// Leitura do certificado A1 (.pfx) e assinatura PAdES do PDF.
import { Buffer } from "node:buffer";
import forge from "node-forge";
import type { PDFDocument } from "pdf-lib";
import { pdflibAddPlaceholder } from "@signpdf/placeholder-pdf-lib";
import { P12Signer } from "@signpdf/signer-p12";
import { SignPdf } from "@signpdf/signpdf";

export interface InfoCertificado {
  titular: string; // nome do titular (sem CPF/CNPJ)
  documento_final: string | null; // últimos dígitos do CPF/CNPJ, para conferência
  emissor: string;
  valido_de: string; // ISO
  valido_ate: string;
  icp_brasil: boolean;
}

/** Abre o .pfx com a senha e devolve os dados do certificado do titular. Lança erro se a senha estiver errada. */
export function lerCertificado(pfx: Uint8Array, senha: string): InfoCertificado {
  const asn1 = forge.asn1.fromDer(forge.util.binary.raw.encode(pfx));
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, senha);
  const chaves = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? []),
  ];
  if (!chaves.length) throw new Error("O arquivo não contém a chave privada (precisa ser um certificado A1 exportado com a chave).");
  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? []).map((b: forge.pkcs12.Bag) => b.cert!).filter(Boolean) as forge.pki.Certificate[];
  const chave = chaves[0].key as forge.pki.rsa.PrivateKey;
  const cert = certs.find((c: forge.pki.Certificate) => {
    const pub = c.publicKey as forge.pki.rsa.PublicKey;
    return pub.n && chave.n && pub.n.equals(chave.n);
  }) ?? certs[0];
  if (!cert) throw new Error("Certificado não encontrado no arquivo.");
  const cn = String(cert.subject.getField("CN")?.value ?? "");
  const [nome, doc] = cn.split(":");
  const emissorCn = String(cert.issuer.getField("CN")?.value ?? "");
  const org = cert.issuer.attributes.map((a: { value?: unknown }) => String(a.value)).join(" ");
  return {
    titular: (nome || cn).trim(),
    documento_final: doc ? doc.replace(/\D/g, "").slice(-4) : null,
    emissor: emissorCn,
    valido_de: cert.validity.notBefore.toISOString(),
    valido_ate: cert.validity.notAfter.toISOString(),
    icp_brasil: /ICP-Brasil/i.test(org),
  };
}

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
