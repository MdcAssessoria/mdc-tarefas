import type { NextConfig } from "next";

// Endereço público: https://hub.mdcassessoria.com/hub-mdc (subdomínio na Vercel; a raiz "/" cai em /hub-mdc pelo
// redirect abaixo). Alternativa: https://mdcassessoria.com/hub-mdc pelo Worker da Cloudflare (infra/cloudflare).
// Versão deste build: na Vercel, o commit publicado; no computador, a hora do build. Vai para o site
// (NEXT_PUBLIC_VERSAO_HUB) e para /api/versao, e é o que dispara o aviso "Nova versão disponível" (lib/atualizacao.ts).
const versao = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || `local-${Date.now()}`;

const nextConfig: NextConfig = {
  basePath: "/hub-mdc",
  env: { NEXT_PUBLIC_VERSAO_HUB: versao },
  async redirects() {
    return [
      // MDC · Pessoal com endereço próprio: pessoal.mdcassessoria.com abre a entrada da família (vale quando o domínio
      // estiver apontado para a Vercel; até lá não muda nada)
      {
        source: "/",
        has: [{ type: "host", value: "pessoal.mdcassessoria.com" }],
        destination: "/hub-mdc/pessoal",
        basePath: false,
        permanent: false,
      },
      { source: "/", destination: "/hub-mdc", basePath: false, permanent: false },
      // o estoque saiu do Financeiro e virou módulo próprio (01/11/2026)
      { source: "/financeiro/estoque", destination: "/estoque", permanent: false },
      // endereços antigos (antes do /hub-mdc) continuam funcionando
      {
        source: "/:mod(tarefas|tv|config|clientes|societario|demonstrativos|portal|atendimento|vencimentos|comercial|hub|login)/:resto*",
        destination: "/hub-mdc/:mod/:resto*",
        basePath: false,
        permanent: false,
      },
      // Financeiro v2 (01/11/2026): plano, categorias, centros de custo e fornecedores/clientes viraram módulos próprios
      { source: "/financeiro/plano", destination: "/plano-contas", permanent: false },
      // 125: a Auditoria fiscal saiu de Demonstrativos e virou módulo próprio
      { source: "/demonstrativos/auditoria-fiscal", destination: "/auditoria-fiscal", permanent: false },
      { source: "/financeiro/cadastros", destination: "/cadastros/pessoas", permanent: false },
    ];
  },
  // Ferramentas abertas (sem login, ex.: Simulador de Regime): páginas estáticas em public/ferramentas/<nome>/index.html,
  // servidas no endereço limpo /hub-mdc/ferramentas/<nome>. Catálogo em dominios/comercial/ferramentas.ts.
  async rewrites() {
    // (o /.well-known/assetlinks.json do app Android fica na raiz do domínio, fora do /hub-mdc: rewrite no vercel.json)
    return [{ source: "/ferramentas/:nome([a-z0-9-]+)", destination: "/ferramentas/:nome/index.html" }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // microfone só para o próprio site: o "lançar falando" do MDC · Pessoal (082) precisa dele
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
        ],
      },
      // ferramentas abertas podem ser embutidas no site da MDC (WordPress); o navegador segue o frame-ancestors
      {
        source: "/ferramentas/:path*",
        headers: [
          { key: "X-Frame-Options", value: "ALLOWALL" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self' https://mdcassessoria.com https://*.mdcassessoria.com" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
