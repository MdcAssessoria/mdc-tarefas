// Assinatura XMLDSig do evento da NF-e (padrão do Manual de Orientação do Contribuinte, item "Assinatura Digital"):
// enveloped, RSA-SHA1, C14N (http://www.w3.org/TR/2001/REC-xml-c14n-20010315), Reference ao Id do infEvento,
// certificado do titular em KeyInfo/X509Data. Igual ao Signer do sped-common (NFePHP).
//
// O HUB monta o infEvento já na forma canônica (sefaz.ts › montarInfEvento: sem espaços, atributos em ordem, texto
// escapado), então não precisamos de um canonicalizador genérico: o digest é calculado sobre o texto do infEvento com a
// declaração xmlns herdada do <evento>, exatamente como a C14N faz com um subconjunto do documento.
// Conferido com `xmlsec1 --verify` nos testes (assinatura_test.ts).
import forge from "node-forge";

export const NS_DSIG = "http://www.w3.org/2000/09/xmldsig#";
const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";

const sha1Base64 = (texto: string) => {
  const md = forge.md.sha1.create();
  md.update(texto, "utf8");
  return forge.util.encode64(md.digest().getBytes());
};

/** SignedInfo; com `comNamespace`, na forma canônica (é o que se assina). */
export function signedInfo(id: string, digest: string, comNamespace: boolean): string {
  return (
    `<SignedInfo${comNamespace ? ` xmlns="${NS_DSIG}"` : ""}>` +
    `<CanonicalizationMethod Algorithm="${C14N}"></CanonicalizationMethod>` +
    `<SignatureMethod Algorithm="${NS_DSIG}rsa-sha1"></SignatureMethod>` +
    `<Reference URI="#${id}"><Transforms>` +
    `<Transform Algorithm="${NS_DSIG}enveloped-signature"></Transform><Transform Algorithm="${C14N}"></Transform>` +
    `</Transforms><DigestMethod Algorithm="${NS_DSIG}sha1"></DigestMethod><DigestValue>${digest}</DigestValue></Reference>` +
    `</SignedInfo>`
  );
}

/**
 * Assina um elemento já canônico. `canonico` é o elemento com a declaração xmlns herdada (forma C14N); `id` é o valor
 * do atributo Id. Devolve o <Signature> para ir logo depois do elemento, dentro do mesmo pai.
 */
export function assinarElemento(canonico: string, id: string, chave: forge.pki.rsa.PrivateKey, certBase64: string): string {
  const digest = sha1Base64(canonico);
  const md = forge.md.sha1.create();
  md.update(signedInfo(id, digest, true), "utf8");
  const valor = forge.util.encode64(chave.sign(md));
  return (
    `<Signature xmlns="${NS_DSIG}">${signedInfo(id, digest, false)}<SignatureValue>${valor}</SignatureValue>` +
    `<KeyInfo><X509Data><X509Certificate>${certBase64}</X509Certificate></X509Data></KeyInfo></Signature>`
  );
}
