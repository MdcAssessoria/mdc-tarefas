import type { NextConfig } from "next";

// Endereço público: https://hub.mdcassessoria.com/hub-mdc (subdomínio na Vercel; a raiz "/" cai em /hub-mdc pelo
// redirect abaixo). Alternativa: https://mdcassessoria.com/hub-mdc pelo Worker da Cloudflare (infra/cloudflare).
const nextConfig: NextConfig = {
  basePath: "/hub-mdc",
  async redirects() {
    return [
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
      { source: "/financeiro/cadastros", destination: "/cadastros/pessoas", permanent: false },
    ];
  },
  // Ferramentas abertas (sem login, ex.: Simulador de Regime): páginas estáticas em public/ferramentas/<nome>/index.html,
  // servidas no endereço limpo /hub-mdc/ferramentas/<nome>. Catálogo em dominios/comercial/ferramentas.ts.
  async rewrites() {
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
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
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
