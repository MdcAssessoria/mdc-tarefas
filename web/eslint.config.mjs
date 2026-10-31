// Regras de lint do HUB-MDC. Base: recomendações do Next.js (React, hooks, acessibilidade básica) + TypeScript.
// Rode `npm run lint`. Ajuste regras aqui; nunca desligue uma regra num arquivo sem comentário explicando o motivo.
import next from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...next,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      // promessa do Supabase sem await não executa a consulta (bug real encontrado na auditoria de 31/10/2026)
      "@typescript-eslint/no-floating-promises": "error",
      // variáveis começando com _ são descartes intencionais
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true }],
      // padrão "carregar dados no useEffect": será substituído aos poucos pelo hook useConsulta
      "react-hooks/set-state-in-effect": "warn",
      // logos e imagens vêm do Storage/URL externa; next/image exigiria configurar domínios
      "@next/next/no-img-element": "off",
    },
  },
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "src/lib/database.types.ts"] },
];

export default config;
