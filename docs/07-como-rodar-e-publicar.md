# 7. Como rodar e publicar

> **Resumo:** para mexer no site basta Node 22 e `npm`. Antes de qualquer `git push`, rode `npm run verificar`
> (tipos, lint, testes e build) e `npm run telas` (abre todas as telas com dados de exemplo). O push na `main`
> publica o site sozinho. Banco e funções Edge são publicados à parte, com cuidado.

## 7.1 Rodar o site no computador

```bash
cd web
npm install
npm run dev          # abre em http://localhost:3000/hub-mdc
```

O site usa o projeto Supabase de produção por padrão (endereço e chave publicável em `web/src/lib/supabase.ts`).
Para apontar para outro projeto, crie `web/.env.local` com:

```
NEXT_PUBLIC_MDC_SUPABASE_URL=https://<outro-projeto>.supabase.co
NEXT_PUBLIC_MDC_SUPABASE_KEY=<chave publicável do outro projeto>
```

> A chave publicável é pública por natureza; a segurança está no RLS. **Nunca** coloque a chave `service_role` no site.

## 7.2 Verificar antes de publicar

| Comando (dentro de `web/`) | O que confere |
| --- | --- |
| `npm run tipos` | TypeScript sem erro |
| `npm run lint` | Regras de código (ESLint); erros bloqueiam |
| `npm run teste` | Testes das funções de cálculo, datas e leitura de arquivos (Vitest) |
| `npm run build` | O site compila |
| `npm run verificar` | Os quatro acima, em ordem |
| `npm run telas` | Depois do build: abre todas as rotas num navegador automático com dados falsos e falha se alguma quebrar |
| `npm run format` | Formata o código (Prettier) |

O GitHub roda `verificar` a cada push e pull request (`.github/workflows/web.yml`). Não junte código com a verificação vermelha.

## 7.3 Banco de dados (migrações)

1. Crie `supabase/migrations/NNN_assunto.sql` com o próximo número (regras no capítulo 4.5).
2. Aplique no Supabase (SQL Editor do projeto `bulqqdgfrrpqquqvjjfa`, ou pela ferramenta de migração do Claude).
3. Rode os avisos de segurança: painel do Supabase › Advisors › Security. Corrija o que aparecer.
4. Gere de novo os tipos do banco para o site:
   `npx supabase gen types typescript --project-id bulqqdgfrrpqquqvjjfa > web/src/lib/database.types.ts`
5. Faça commit da migração e dos tipos juntos.

> **Próximo passo recomendado pela auditoria:** adotar a Supabase CLI com um projeto de **homologação**, para não
> testar migração direto em produção. Veja [`decisoes/0002-homologacao-e-cli.md`](decisoes/0002-homologacao-e-cli.md).

## 7.4 Funções Edge

Cada pasta em `supabase/functions/` é uma função. Para publicar:

```bash
npx supabase functions deploy convite --project-ref bulqqdgfrrpqquqvjjfa --import-map supabase/functions/convite/deno.json
```

- `demonstrativo-pdf` usa cópias de `balancete.ts` e `demonstracoes.ts` geradas por `scripts/sync-funcoes.sh` a
  partir de `web/src/dominios/demonstrativos/`. **Rode o script antes de publicar** sempre que mexer nesses cálculos.
- Segredos das funções (chave de serviço etc.) ficam no painel: Edge Functions › Secrets. Nunca no código.
- As origens permitidas (CORS e link de convite) são `mdcassessoria.com`, `www.mdcassessoria.com` e
  `mdc-tarefas.vercel.app`. Para testar convite rodando local, publique uma versão de teste com `localhost`.

## 7.5 E-mail, domínio e certificado

- **E-mail (convite e senha):** SMTP do Microsoft 365 com `hub@mdcassessoria.com` (Supabase › Authentication ›
  Emails › SMTP). Requer "SMTP autenticado" ligado para a caixa no admin do Microsoft 365. Modelos em `supabase/templates/`.
- **Domínio:** passo a passo em [`infra/cloudflare/README.md`](../infra/cloudflare/README.md).
- **Certificado A1:** enviado pela tela Demonstrativos › Certificado (só administrador); fica no Cofre do Supabase.

## 7.6 Clientes de teste

Use a **MDC** (código Domínio 1) e o **Grupo Greencore** (códigos 41 e 50), marcados com o grupo "Piloto HUB",
para validar qualquer novidade antes de liberar para a carteira.
