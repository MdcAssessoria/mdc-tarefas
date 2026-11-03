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

> **Migração grande:** se a ferramenta recusar ou cancelar uma migração muito longa, aplique em partes, na ordem, cada
> uma com nome próprio (`NNN_assunto_parte1`, `_parte2`…), sem mudar o texto do arquivo. A 036 (auditoria de 02/11/2026)
> foi aplicada assim em 3 partes no dia 02/11/2026: linhas 1–609 (regras de acesso e Financeiro), 610–1232 (notas,
> estoque e pedidos) e 1233–fim (licenças, Portal, Storage, índices, "nada se apaga" e clientes).

> **Próximo passo recomendado pela auditoria:** adotar a Supabase CLI com um projeto de **homologação**, para não
> testar migração direto em produção. Veja [`decisoes/0002-homologacao-e-cli.md`](decisoes/0002-homologacao-e-cli.md).

## 7.4 Funções Edge

Cada pasta em `supabase/functions/` é uma função. Para publicar:

```bash
npx supabase functions deploy convite --project-ref bulqqdgfrrpqquqvjjfa --import-map supabase/functions/convite/deno.json
```

- **Ordem quando a mudança mexe na tela e na função:** publique a **função primeiro** e confira a versão nova no painel;
  só depois faça o push do site. A função nova aceita o site antigo; o site novo com a função antiga entrega PDF errado.
- `demonstrativo-pdf` usa cópias de `balancete.ts` e `demonstracoes.ts` geradas por `scripts/sync-funcoes.sh` a
  partir de `web/src/dominios/demonstrativos/`. **Rode o script antes de publicar** sempre que mexer nesses cálculos.
- `balancete-agente` (pasta de balancetes do SharePoint) usa a cópia do núcleo em `nucleo/`, também gerada por
  `scripts/sync-funcoes.sh`. Publique **com a checagem de login do Supabase desligada** (a própria função confere o
  token do agendador ou o login do administrador); isso já está em `supabase/config.toml`:
  ```bash
  sh scripts/sync-funcoes.sh
  npx supabase functions deploy balancete-agente --project-ref bulqqdgfrrpqquqvjjfa --no-verify-jwt \
    --import-map supabase/functions/balancete-agente/deno.json
  ```
  Publicada com o padrão (checagem ligada), o agendador é recusado e a pasta nunca é lida, sem aviso. Teste antes:
  `cd supabase/functions/balancete-agente && deno test --allow-env agente_test.ts`.
- `npm run verificar` confere se as cópias do núcleo nas funções estão iguais às da tela (`npm run nucleo`); se
  acusar diferença, rode `sh scripts/sync-funcoes.sh` e publique as funções.
- **Publicação sem a CLI (pelo conector do Supabase):** gere um arquivo único com
  `npx esbuild@0.24.0 index.ts --bundle --format=esm --platform=neutral --target=es2022 --charset=ascii` marcando como
  `--external` os pacotes do `deno.json` (e `node:*`), e publique esse `index.js` com o `deno.json`. Foi assim que
  `balancete-agente` (v1) e `demonstrativo-pdf` (v7) foram publicadas em 01/11/2026; o código-fonte continua sendo os `.ts`.
- **Funções fiscais (Entradas, migração 032): `fiscal-certificado`, `fiscal-captura`, `fiscal-manifestar`.** Usam a pasta
  compartilhada `supabase/functions/_fiscal/` (mTLS, certificado, assinatura XMLDSig, captura, manifestação) e a cópia do
  núcleo puro em `_fiscal/nucleo/` (gerada de `web/src/dominios/notas/` por `scripts/sync-funcoes.sh`; `npm run verificar`
  confere). Ordem: aplicar a 032 → publicar as três funções → push do site.
  ```bash
  sh scripts/sync-funcoes.sh
  cd supabase/functions/_fiscal && deno test --allow-run --allow-read --allow-write --allow-env --config deno.json fiscal_test.ts && cd -
  npx supabase functions deploy fiscal-certificado --project-ref bulqqdgfrrpqquqvjjfa --import-map supabase/functions/fiscal-certificado/deno.json
  npx supabase functions deploy fiscal-manifestar --project-ref bulqqdgfrrpqquqvjjfa --import-map supabase/functions/fiscal-manifestar/deno.json
  npx supabase functions deploy fiscal-captura --project-ref bulqqdgfrrpqquqvjjfa --no-verify-jwt --import-map supabase/functions/fiscal-captura/deno.json
  ```
  `fiscal-captura` vai **com a checagem de login desligada** (o agendador manda `x-agente-token`; a própria função
  confere o token no banco ou o login + `fis_pode(cliente,'operar')`). Pelo conector (sem CLI), gere o bundle de cada uma:
  `npx esbuild@0.24.0 index.ts --bundle --format=esm --platform=neutral --target=es2022 --charset=ascii --external:@supabase/supabase-js --external:node-forge '--external:node:*' --outfile=index.js`
  (dentro da pasta da função; o esbuild junta `../_fiscal`). Não precisam de segredo novo: usam `SUPABASE_URL`,
  `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`, que o Supabase já injeta. O teste da assinatura confere com o
  `xmlsec1 --verify` (instale com `apt-get install xmlsec1`). Publicadas pelo conector em 02/11/2026 (v1 das três),
  depois das migrações 031 a 035.
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

## Testes SQL (Financeiro e estoque)

`bash supabase/testes/rodar.sh` (porta 5521; outra porta com `PORTA_TESTES=5498 bash supabase/testes/rodar.sh`, para rodar
duas cópias ao mesmo tempo) sobe um Postgres 16 temporário na máquina, cria uma base simulada (`auth.uid()` lido de
`teste.uid`, `app.hub_pode` lido de `teste.papel`), aplica as migrações 026, 028, 029, 030 e 033 e roda os cenários de
`supabase/testes/20_titulos.sql`, `30_estoque.sql` e `60_estoque_pedidos.sql` (custo médio, pedidos, cancelamento e
duas vendas ao mesmo tempo, com duas conexões pelo `dblink`): parcelas, baixa parcial com juros e desconto, estorno, cancelamento,
`teste.uid`, `app.hub_pode` lido de `teste.papel`; Vault, Storage, pg_cron e Vencimentos simulados em
`05_base_fiscal.sql`), aplica as migrações 026, 028, 029, 030 e 032 e roda os cenários de
`supabase/testes/20_titulos.sql`, `30_estoque.sql` e `50_fiscal.sql` (notas: certificado no cofre, captura com 137,
resumo que vira completa, cancelamento que chega antes da nota, manifestação aceita/recusada, lançamento com contas a
pagar + estoque + de-para, desfazer, upload, Storage e acessos): parcelas, baixa parcial com juros e desconto, estorno, cancelamento,
travas de situação, acesso do cliente pelo Portal e de quem não tem acesso, saldo de estoque, inventário,
transferência, estorno e estoque negativo. Cada linha marcada "(deve falhar)" precisa terminar em erro com a mensagem
em português. Rode antes de aplicar uma migração nova dessas tabelas.

No fim, o `rodar.sh` aplica a 035 e a 036 com as regras de acesso reais (`79_base_modulos.sql`, `89_base_036.sql`, que
simula tarefas, feriados, perfis, CRM, convites do Portal e contas do Auth) e roda `80_modulos.sql` e
`90_auditoria_036.sql`: as provas P1–P12 da auditoria de 02/11/2026 (cada exploração termina em erro), os fluxos normais
por módulo (Entradas lança nota, Estoque movimenta, Relatórios só lê, Portal com contrato do Financeiro opera, cliente
bloqueado não envia certificado), a corrida de dois contratos ao mesmo tempo (`dblink`) e o "nada se apaga" (DELETE
direto falha; cancelar/encerrar/inativar com motivo funciona). Nenhum bloco sem a marca "(deve falhar)" pode ter ERROR.
