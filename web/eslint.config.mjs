// Regras de lint do HUB-MDC. Base: recomendações do Next.js (React, hooks, acessibilidade básica) + TypeScript.
// Rode `npm run lint`. Ajuste regras aqui, nunca desligando por arquivo sem comentário explicando o motivo.
import next from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...next,
  ...nextTs,
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
];

export default config;
