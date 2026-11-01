// Certificado A1 (e-CNPJ) da empresa: abre o .pfx, separa a chave e o certificado em PEM (para o mTLS e a assinatura)
// e lê os dados públicos (titular, CNPJ, emissor, validade). Base: functions/certificado/cert.ts (node-forge).
// CNPJ do e-CNPJ ICP-Brasil: no SubjectAltName, otherName OID 2.16.76.1.3.3 (DOC-ICP-04, item 7.1.3.3); na falta,
// o final do CN ("RAZAO SOCIAL:12345678000195").
import forge from "node-forge";

export interface InfoCertificado {
  titular: string;
  cnpj: string | null;
  emissor: string;
  valido_de: string;
  valido_ate: string;
  icp_brasil: boolean;
}

export interface CertificadoAberto {
  info: InfoCertificado;
  certPem: string;
  chavePem: string;
  /** Certificado em DER base64 (vai no X509Certificate da assinatura). */
  certBase64: string;
  chave: forge.pki.rsa.PrivateKey;
}

const OID_CNPJ = "2.16.76.1.3.3";

/** Procura o CNPJ no otherName 2.16.76.1.3.3 do SubjectAltName (o valor é uma string com 14 dígitos). */
function cnpjDoSan(cert: forge.pki.Certificate): string | null {
  // deno-lint-ignore no-explicit-any
  const ext = (cert.extensions as any[]).find((e) => e.name === "subjectAltName" || e.id === "2.5.29.17");
  if (!ext?.value) return null;
  try {
    const asn = forge.asn1.fromDer(ext.value);
    for (const nome of (asn.value as forge.asn1.Asn1[]) ?? []) {
      if (nome.tagClass !== forge.asn1.Class.CONTEXT_SPECIFIC || nome.type !== 0) continue; // otherName [0]
      const partes = nome.value as forge.asn1.Asn1[];
      const oid = forge.asn1.derToOid(partes[0].value as string);
      if (oid !== OID_CNPJ) continue;
      let v: forge.asn1.Asn1 | string = partes[1];
      while (typeof v !== "string" && Array.isArray(v.value)) v = (v.value as forge.asn1.Asn1[])[0];
      const texto = typeof v === "string" ? v : String(v.value);
      const d = texto.replace(/\D/g, "");
      if (d.length >= 14) return d.slice(0, 14);
    }
  } catch {
    return null;
  }
  return null;
}

/** Abre o .pfx com a senha. Lança erro em português se a senha estiver errada ou faltar a chave. */
export function abrirCertificado(pfx: Uint8Array, senha: string): CertificadoAberto {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    const asn1 = forge.asn1.fromDer(forge.util.binary.raw.encode(pfx));
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, senha);
  } catch {
    throw new Error("Senha incorreta ou arquivo inválido (precisa ser o .pfx/.p12 do certificado A1).");
  }
  const chaves = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? []),
  ];
  if (!chaves.length || !chaves[0].key) throw new Error("O arquivo não contém a chave privada (exporte o A1 com a chave).");
  const chave = chaves[0].key as forge.pki.rsa.PrivateKey;
  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [])
    .map((b: forge.pkcs12.Bag) => b.cert!)
    .filter(Boolean) as forge.pki.Certificate[];
  const cert =
    certs.find((c) => {
      const pub = c.publicKey as forge.pki.rsa.PublicKey;
      return pub.n && chave.n && pub.n.equals(chave.n);
    }) ?? certs[0];
  if (!cert) throw new Error("Certificado não encontrado no arquivo.");
  const cn = String(cert.subject.getField("CN")?.value ?? "");
  const [nome, docCn] = cn.split(":");
  const org = cert.issuer.attributes.map((a: { value?: unknown }) => String(a.value)).join(" ");
  const docCnDig = (docCn ?? "").replace(/\D/g, "");
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  return {
    info: {
      titular: (nome || cn).trim(),
      cnpj: cnpjDoSan(cert) ?? (docCnDig.length === 14 ? docCnDig : null),
      emissor: String(cert.issuer.getField("CN")?.value ?? ""),
      valido_de: cert.validity.notBefore.toISOString(),
      valido_ate: cert.validity.notAfter.toISOString(),
      icp_brasil: /ICP-Brasil/i.test(org),
    },
    certPem: forge.pki.certificateToPem(cert),
    chavePem: forge.pki.privateKeyToPem(chave),
    certBase64: forge.util.encode64(der),
    chave,
  };
}

/** Confere se o certificado serve para a empresa: mesmo CNPJ raiz (8 primeiros dígitos) e dentro da validade. */
export function conferirParaEmpresa(info: InfoCertificado, cnpjEmpresa: string | null | undefined, agora = new Date()): string | null {
  const empresa = (cnpjEmpresa ?? "").replace(/\D/g, "");
  if (empresa.length !== 14) return "Cadastre o CNPJ da empresa no HUB antes de enviar o certificado.";
  if (!info.cnpj) return "Não encontrei o CNPJ dentro do certificado. Use um e-CNPJ A1 (ICP-Brasil).";
  if (info.cnpj.slice(0, 8) !== empresa.slice(0, 8))
    return `Este certificado é de outro CNPJ (${info.cnpj.slice(0, 8)}…). Envie o e-CNPJ da própria empresa (mesmo CNPJ raiz).`;
  if (new Date(info.valido_ate) < agora) return `Este certificado venceu em ${info.valido_ate.slice(0, 10).split("-").reverse().join("/")}.`;
  if (new Date(info.valido_de) > agora) return "Este certificado ainda não começou a valer.";
  return null;
}

/** Bytes → base64 (para guardar no Vault). */
export function paraBase64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

export function deBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
