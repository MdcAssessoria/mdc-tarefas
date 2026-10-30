// Cloudflare Worker: publica o HUB-MDC em https://mdcassessoria.com/hub-mdc
// Rota no Cloudflare: mdcassessoria.com/hub-mdc*  (e www.mdcassessoria.com/hub-mdc*)
// Tudo que chega em /hub-mdc é repassado ao app na Vercel; o resto do site segue na Hostinger.
const ORIGEM = "https://mdc-tarefas.vercel.app";

export default {
  async fetch(req) {
    const url = new URL(req.url);
    if (url.hostname === "www.mdcassessoria.com") {
      url.hostname = "mdcassessoria.com";
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname !== "/hub-mdc" && !url.pathname.startsWith("/hub-mdc/")) return fetch(req);

    const destino = new URL(url.pathname + url.search, ORIGEM);
    const cab = new Headers(req.headers);
    cab.delete("host"); // a Vercel identifica o projeto pelo host do destino
    cab.set("X-Forwarded-Host", url.host);
    cab.set("X-Forwarded-Proto", "https");
    const resp = await fetch(destino, {
      method: req.method,
      headers: cab,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : req.body,
      redirect: "manual",
    });

    // redirecionamentos da Vercel voltam para o endereço público
    const saida = new Response(resp.body, resp);
    const loc = saida.headers.get("Location");
    if (loc && loc.startsWith(ORIGEM)) saida.headers.set("Location", loc.replace(ORIGEM, `https://${url.host}`));
    saida.headers.set("Strict-Transport-Security", "max-age=31536000");
    return saida;
  },
};
