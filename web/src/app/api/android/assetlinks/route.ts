// Digital Asset Links do app Android do MDC · Pessoal (Google Play, 14/11/2026). O app da loja é o mesmo site aberto em
// tela cheia (Trusted Web Activity); o Android só tira a barra de endereço se este arquivo, servido em
// https://hub.mdcassessoria.com/.well-known/assetlinks.json (rewrite em next.config.ts), citar o pacote e a impressão
// digital da chave de assinatura. A impressão digital (SHA-256, pública) fica na Vercel em ANDROID_SHA256 — mais de uma
// separada por vírgula (a da Play Console e a da chave de envio). Passo a passo: docs/modulos/pessoal-play-store.md.
const PACOTE_ANDROID = "com.mdcassessoria.pessoal";

const IMPRESSAO = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

export function GET() {
  const impressoes = (process.env.ANDROID_SHA256 ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => IMPRESSAO.test(s));
  const corpo = impressoes.length
    ? [
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: { namespace: "android_app", package_name: PACOTE_ANDROID, sha256_cert_fingerprints: impressoes },
        },
      ]
    : [];
  return Response.json(corpo, { headers: { "Cache-Control": "public, max-age=3600" } });
}
