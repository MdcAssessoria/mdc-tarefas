import type { NextConfig } from "next";

// Endereço público: https://mdcassessoria.com/hub-mdc (repassado à Vercel pelo Worker da Cloudflare).
const nextConfig: NextConfig = {
  basePath: "/hub-mdc",
  async redirects() {
    return [
      { source: "/", destination: "/hub-mdc", basePath: false, permanent: false },
      // endereços antigos (antes do /hub-mdc) continuam funcionando
      {
        source: "/:mod(tarefas|tv|config|clientes|societario|demonstrativos|portal|atendimento|vencimentos|comercial|hub|login)/:resto*",
        destination: "/hub-mdc/:mod/:resto*",
        basePath: false,
        permanent: false,
      },
    ];
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
