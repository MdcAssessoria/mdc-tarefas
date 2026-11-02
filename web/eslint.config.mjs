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
      // janelas do navegador (feias, sem acessibilidade, bloqueadas em alguns celulares): use JanelaConfirmar,
      // JanelaMotivo ou useAviso de components/ui. Está como aviso enquanto as telas antigas são trocadas; vira erro depois.
      "no-restricted-globals": [
        "warn",
        { name: "confirm", message: "Use JanelaConfirmar (ou useConfirmar) de components/ui, não window.confirm." },
        { name: "prompt", message: "Use um Modal com campo (ou JanelaMotivo) de components/ui, não window.prompt." },
        { name: "alert", message: "Use useAviso de components/ui, não window.alert." },
      ],
      "no-restricted-properties": [
        "warn",
        { object: "window", property: "confirm", message: "Use JanelaConfirmar (ou useConfirmar) de components/ui." },
        { object: "window", property: "prompt", message: "Use um Modal com campo (ou JanelaMotivo) de components/ui." },
        { object: "window", property: "alert", message: "Use useAviso de components/ui." },
      ],
    },
  },
  // Regra de dependência entre pastas (web/README.md): app → dominios → lib; components/ui → lib.
  {
    files: ["src/lib/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/dominios/**", "**/dominios/**", "@/components/**", "**/components/**", "@/app/**"],
              message: "lib/ é só infraestrutura: não importa de dominios/, components/ nem app/ (veja web/README.md).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/dominios/**", "**/dominios/**", "@/components/shell/**", "@/app/**"],
              message: "components/ui/ não conhece domínio: recebe tudo por props e só usa lib/ (veja web/README.md).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/dominios/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app/**", "@/components/shell/**"],
              message: "dominios/ não importa telas (app/) nem a moldura (veja web/README.md).",
            },
          ],
        },
      ],
    },
  },
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "src/lib/database.types.ts", "public/vendor/**"] },
];

export default config;
