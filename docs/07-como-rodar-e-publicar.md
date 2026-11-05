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
  Testes do PDF: `cd supabase/functions/demonstrativo-pdf && deno test --allow-read --config deno.json pdf_test.ts`.
  **Pendente (04/11/2026):** republicar `demonstrativo-pdf` com o acabamento da branch `documentos-acabamento` (marca
  d'água em todas as páginas, total do balancete, texto sem "…", papel timbrado pelo cadastro). Bundle como as fiscais.
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
- **NFS-e (046): `nfse-emitir`.** Usa `_fiscal/` (certificado, assinatura, mTLS, `emissao.ts`) e a cópia do núcleo com
  `dps.ts`. Ordem: aplicar a 046 → regenerar `database.types.ts` e rodar os Advisors → **publicar a função** e conferir a
  versão → push do site (o site novo chama a função; sem ela o botão "Emitir nota" falha).
  ```bash
  sh scripts/sync-funcoes.sh
  cd supabase/functions/_fiscal && deno test --allow-run --allow-read --allow-write --allow-env --config deno.json nfse_test.ts && cd -
  npx supabase functions deploy nfse-emitir --project-ref bulqqdgfrrpqquqvjjfa --import-map supabase/functions/nfse-emitir/deno.json
  ```
  Vai **com a checagem de login ligada** (`verify_jwt = true` no `config.toml`). Sem segredo novo (usa as variáveis que o
  Supabase injeta). Pelo conector: o mesmo bundle das funções fiscais, dentro de `supabase/functions/nfse-emitir`. O teste
  pede `xmlsec1` e `xmllint` (`apt-get install xmlsec1 libxml2-utils`). Publicada pelo conector em 03/11/2026 (v1), logo
  depois da 046; a emissão começa no ambiente de teste (produção restrita) e no modo "conferir".
- **Contratos: regras (048) e boleto (049).** Ordem: aplicar a 048 e a 049 (testes 105 a 108 passando) → regenerar
  `database.types.ts` (os tipos da 048/049 foram escritos à mão na branch) e rodar os Advisors → publicar a função
  `ledgra-link` (ganhou `acao: "emitir_fatura"`; bundle como as fiscais) → push do site. Sem segredo novo: usa
  `LEDGRA_LINK_URL` e `LEDGRA_LINK_CHAVE`, que já existem. Depois, em Contratos › Boleto, quem gere informa o código da conta
  de cada banco no Ledgra Link. A 048 troca a regra do vencimento: contrato a receber com dia de gerar depois do dia de
  vencer passa a ser recusado ao salvar (em 03/11/2026 não havia contratos em produção).
  047, 048 e 049 aplicadas em 03/11/2026 (21h30); tipos regenerados; `ledgra-link` v3 publicada pelo conector (bundle).
- **04/11/2026:** 050 aplicada (Portal › Faturas); `demonstrativo-pdf` v9 publicada (rascunho em todas as páginas, total do balancete, texto sem corte). As 8 funções com a origem `hub.mdcassessoria.com` (fiscal-certificado, fiscal-manifestar, fiscal-captura, nfse-emitir, ledgra-link, ledgra-link-webhook, convite, balancete-agente) ficam para quando o DNS do subdomínio estiver no ar.
- **04/11/2026 (noite):** 051 (conciliação do extrato), 052 (NFS-e automática e papel timbrado) e 053 (envio das faturas)
  aplicadas; 26 funções conferidas por md5 contra o repositório; agendadores `nfse-automatica` (06h45) e `fatura-enviar`
  (a cada 10 min) ativos; tipos regenerados. Funções publicadas pelo conector (bundle): `nfse-automatica` v1 e
  `fatura-enviar` v1 (verify_jwt desligado, token próprio), `nfse-emitir` v2 e `demonstrativo-pdf` v10 (bundle
  minificado, lê `org_papel_timbrado`). E-mail e WhatsApp seguem "aguardando configuração" até os segredos da seção 7.7
  serem cadastrados.
- **04/11/2026 (noite):** 054 aplicada (Comercial: excluir lead de vez, `crm_excluir`, conferida por md5); tipos
  regenerados. Busca na Receita no cadastro de fornecedores/clientes e na ficha do CRM (só site).
- **04/11/2026 (noite):** 055 aplicada (Contratos: cliente do contrato com CNPJ, e-mail, telefone, cidade e UF;
  `app.fin_recorrente_conferir` conferida por md5); Novo contrato em etapas com a carteira da MDC no campo Cliente.
- **04/11/2026 (noite):** 056 aplicada (Estoque: item de serviço com código da LC 116/NFS-e, NBS e ISS;
  `est_salvar_item` conferida por md5); tipos regenerados.
- **04/11/2026 (noite):** 057 aplicada (Regras fiscais: `fis_regras_servico`, `fis_regra_servico_salvar`, `app.nfse_dados`
  com NBS da regra e trava de ISS retido, `est_salvar_item` só com o código; NBS e ISS saíram de `est_itens`); 4 funções
  conferidas por md5; avisos de segurança sem novidade; tipos regenerados.
- **05/11/2026:** 058 aplicada (nota de entrada × pedido de compra: `fis_notas.pedido_id`, `fis_pedidos_da_nota`,
  `fis_processar_nota` com escolha obrigatória do pedido, `fis_desfazer_lancamento`, gatilho `est_pedido_nota`); 6 funções
  conferidas por md5; avisos de segurança sem novidade; tipos regenerados.
- **05/11/2026:** 059 aplicada (receita por sistema: `fin_sistemas`, `fin_sistema_salvar`, `fin_recorrentes.sistema_id`,
  `fin_recorrente_salvar` com o sistema, `fin_receita_sistemas` com a receita prevista; Estoque, Entradas e Saídas com
  status `desligado`); 3 funções conferidas por md5; avisos de segurança sem novidade; tipos regenerados.
- **Ajustes finais (052, branch `ajustes-finais`).** Ordem: testes (`bash supabase/testes/rodar.sh`, blocos 111 a 114)
  → aplicar a 052 → regenerar `database.types.ts` (os tipos da 052 foram escritos à mão) e rodar os Advisors → publicar
  as funções → push do site.
  - `nfse-automatica` (**nova**, **sem checagem de login**: `verify_jwt = false`, como `fiscal-captura`; só aceita o token
    do Vault `nfse_automatica_token`, que a própria 052 gera). Bundle como as fiscais, dentro da pasta da função.
  - `nfse-emitir` (republicar: a emissão passou para `_fiscal/emitirFatura.ts`, usado também pela automática; continua
    com `verify_jwt = true`).
  - `demonstrativo-pdf` (republicar: lê telefone, site, e-mail, Instagram e responsável técnico de `org_papel_timbrado`).
  Sem segredo novo no painel. Testes: `cd supabase/functions/_fiscal && deno test --allow-read --config deno.json automatica_test.ts`.
  O agendador `nfse-automatica` (06h45) já nasce com a 052, mas só chama a função se algum parâmetro estiver em automático.
- Segredos das funções (chave de serviço etc.) ficam no painel: Edge Functions › Secrets. Nunca no código.
- Ledgra Link (043): `LEDGRA_LINK_URL` (endereço do Ledgra Link, ex.: `https://link.ledgra.com.br`), `LEDGRA_LINK_CHAVE`
  (chave do HUB no Ledgra Link, começa com `llk_`) e `LEDGRA_LINK_SEGREDO_WEBHOOK` (segredo mostrado uma vez pelo Ledgra
  Link ao configurar o endereço `https://bulqqdgfrrpqquqvjjfa.supabase.co/functions/v1/ledgra-link-webhook`). Publicar as
  funções `ledgra-link` e `ledgra-link-webhook`. O SDK fica copiado em `supabase/functions/_ledgra_link/` (arquivo gerado no
  repositório ledgra-link por `npm run sdk`; não editar aqui). As duas usam `_ledgra_link/http.ts` (cópia enxuta de
  `_fiscal/http.ts`, sem a parte da SEFAZ; se mudar as origens, mude nos dois). Migração 043 aplicada e funções publicadas
  pelo conector em 03/11/2026 (v1); `database.types.ts` acrescido à mão das tabelas e funções `link_*` (sem token da CLI).
- As origens permitidas (CORS e link de convite) são `mdcassessoria.com`, `www.mdcassessoria.com`,
  `hub.mdcassessoria.com` (subdomínio na Vercel, 04/11/2026) e `mdc-tarefas.vercel.app`. A lista mora em
  `_fiscal/http.ts`, `_ledgra_link/http.ts`, `convite/index.ts` e `balancete-agente/agente.ts`: mudou uma, mude as quatro e
  republique as funções que as usam (fiscal-certificado, fiscal-manifestar, fiscal-captura, nfse-emitir, ledgra-link,
  ledgra-link-webhook, convite e balancete-agente). `hub.mdcassessoria.com/` cai em `/hub-mdc` pelo redirect da raiz do
  `web/next.config.ts`. Para testar convite rodando local, publique uma versão de teste com `localhost`.

## 7.5 E-mail, domínio e certificado

- **E-mail (convite e senha):** SMTP do Microsoft 365 com `hub@mdcassessoria.com` (Supabase › Authentication ›
  Emails › SMTP). Requer "SMTP autenticado" ligado para a caixa no admin do Microsoft 365. Modelos em `supabase/templates/`.
- **Domínio:** passo a passo em [`infra/cloudflare/README.md`](../infra/cloudflare/README.md).
- **Certificado A1:** enviado pela tela Demonstrativos › Certificado (só administrador); fica no Cofre do Supabase.

## 7.6 Clientes de teste

Use a **MDC** (código Domínio 1) e o **Grupo Greencore** (códigos 41 e 50), marcados com o grupo "Piloto HUB",
para validar qualquer novidade antes de liberar para a carteira.

## 7.7 Envio das faturas por e-mail e WhatsApp (053)

As faturas de Contratos saem sozinhas pela Função `fatura-enviar`: **e-mail pelo Microsoft 365** (Microsoft Graph,
`sendMail` como `hub@mdcassessoria.com`) e **WhatsApp pela API oficial da Meta** (WhatsApp Business Platform, modelo
aprovado com o PDF da fatura). Decisão do Edvaldo em 04/11/2026. Enquanto os segredos de um canal não estão no painel,
os envios dele ficam "aguardando configuração" (sem erro) e Contratos › Envio mostra o que falta.

**Como funciona.** O `pg_cron` chama a função a cada 10 minutos com o token interno `fatura_enviar_token` (gerado pelo
próprio banco no Vault na migração 053; ninguém precisa digitar). A função confere os canais, pega a fila pronta
(`fin_envio_reservar`: NFS-e emitida quando o envio leva a nota, boleto gerado quando leva o boleto, "boleto depois"
como segundo envio) e grava cada resultado (`fin_envio_resultado`). Falha temporária tenta de novo em 10 min, 30 min,
2 h, 6 h e 24 h (6 falhas param); endereço ou número que não existe para na hora; na 3ª falha avisa no sino quem
opera/gere Contratos. Erro de configuração (senha do aplicativo vencida, permissão, modelo) desliga o canal sem gastar
tentativa. "Enviado" no WhatsApp quer dizer **aceito pela Meta** (a entrega no aparelho não volta para o HUB nesta etapa);
no e-mail, devolução do servidor do cliente chega na caixa `hub@` como e-mail de "não entregue".

**Ordem para ligar (tarefa do Edvaldo / TI):**
1. Aplicar a 053 (testes 113/114 passando), regenerar `database.types.ts` (os tipos da 053 foram escritos à mão) e rodar
   os Advisors.
2. Publicar a função **com a checagem de login desligada** (o agendador manda `x-agente-token`; a função confere o token
   ou o login + a permissão no banco):
   ```bash
   sh scripts/sync-funcoes.sh
   cd supabase/functions/fatura-enviar && deno test --allow-read --allow-env --config deno.json envio_test.ts && cd -
   npx supabase functions deploy fatura-enviar --project-ref bulqqdgfrrpqquqvjjfa --no-verify-jwt --import-map supabase/functions/fatura-enviar/deno.json
   ```
   Pelo conector: bundle dentro de `supabase/functions/fatura-enviar` com
   `npx esbuild@0.24.0 index.ts --bundle --format=esm --platform=neutral --target=es2022 --charset=ascii --external:@supabase/supabase-js --external:pdf-lib --outfile=index.js`.
3. Push do site (Contratos › Envio e o "Reenviar" em Contratos › Faturas).
4. Fazer o passo a passo do Microsoft 365 e/ou da Meta abaixo e cadastrar os segredos em **Edge Functions › Secrets**.
5. Em Contratos › Envio, clicar **Conferir agora** (o canal fica "Ligado" e os envios guardados entram na fila) e
   **Enviar teste** para um e-mail/WhatsApp da MDC. Validar com a MDC e o Grupo Greencore (Piloto HUB) antes da carteira.

### E-mail: aplicativo no Azure (Microsoft Entra) com Mail.Send só na caixa do HUB

1. **Entra admin center › Identidade › Aplicativos › Registros de aplicativo › Novo registro.** Nome: `HUB-MDC envio de
   faturas`; "Contas somente neste diretório"; sem URI de redirecionamento. Anote o **ID do aplicativo (cliente)** e o
   **ID do diretório (locatário)**.
2. **Certificados e segredos › Novo segredo do cliente**, validade de 24 meses. Copie o **Valor** na hora (aparece uma vez
   só) e anote a data de vencimento na agenda da TI: quando vencer, o canal desliga e Contratos › Envio avisa.
3. **Não** dê a permissão de aplicativo `Mail.Send` em "Permissões de API" (ela vale para todas as caixas da empresa, e as
   permissões se somam). A permissão entra só pela caixa do HUB, pelo **RBAC para Aplicativos** do Exchange Online
   (substitui as antigas Application Access Policies). No PowerShell do Exchange Online (`Connect-ExchangeOnline`), com o
   ID do aplicativo e o **ID do objeto da entidade de serviço** (Entra › Aplicativos empresariais › o aplicativo):
   ```powershell
   New-ServicePrincipal -AppId <ID do aplicativo> -ObjectId <ID do objeto da entidade de serviço> -DisplayName "HUB-MDC envio de faturas"
   New-ManagementScope -Name "HUB-MDC caixa do HUB" -RecipientRestrictionFilter "PrimarySmtpAddress -eq 'hub@mdcassessoria.com'"
   New-ManagementRoleAssignment -App <ID do aplicativo> -Role "Application Mail.Send" -CustomResourceScope "HUB-MDC caixa do HUB"
   Test-ServicePrincipalAuthorization -Identity <ID do aplicativo> -Resource hub@mdcassessoria.com   # deve dar InScope = True
   Test-ServicePrincipalAuthorization -Identity <ID do aplicativo> -Resource edvaldo@mdcassessoria.com # deve dar InScope = False
   ```
   A permissão pode levar de 30 minutos a 2 horas para valer. Se alguém tiver dado `Mail.Send` em "Permissões de API",
   remova e revogue o consentimento, senão o aplicativo continua podendo enviar por qualquer caixa.
4. A caixa `hub@mdcassessoria.com` precisa ter licença com Exchange Online (já é a do SMTP do convite, seção 7.5).
5. Segredos (Edge Functions › Secrets): `GRAPH_TENANT_ID` (ID do diretório), `GRAPH_CLIENT_ID` (ID do aplicativo),
   `GRAPH_CLIENT_SECRET` (o Valor do passo 2) e `GRAPH_REMETENTE` = `hub@mdcassessoria.com`. O e-mail sai com a fatura em PDF,
   o XML da NFS-e quando houver, a linha digitável e o Pix copia e cola quando há boleto; fica em "Itens enviados" da caixa.

### WhatsApp: conta na WhatsApp Business Platform (API oficial da Meta)

1. **Meta Business Suite (business.facebook.com):** use o portfólio empresarial da MDC e faça a **verificação da empresa**
   (Configurações › Central de segurança), com CNPJ e um documento. Sem ela, a conta fica limitada.
2. **developers.facebook.com › Meus aplicativos › Criar aplicativo** do tipo Empresa, ligado ao portfólio da MDC, e adicione
   o produto **WhatsApp**. Em WhatsApp › Configuração da API, **adicione o número da MDC** que vai mandar as faturas (um
   número que **não** esteja em uso no aplicativo WhatsApp comum, ou migre o número) e confirme por SMS/ligação. Anote o
   **ID do número de telefone** (Phone number ID). Cadastre a forma de pagamento da conta (a Meta cobra cada mensagem de
   modelo de "Utilidade").
3. **Gerenciador do WhatsApp › Modelos de mensagem › Criar modelo:** categoria **Utilidade**, nome **`fatura_mdc`**, idioma
   **Português (BR)**; cabeçalho **Documento**; corpo exatamente com 5 variáveis:
   > Olá, {{1}}! Segue em anexo a fatura {{2}} da MDC Assessoria Contábil, no valor de {{3}}, com vencimento em {{4}}.
   > Para pagar: {{5}}. Qualquer dúvida, é só responder esta mensagem.

   Exemplos para a aprovação: `Gama Comércio Ltda`, `2026/00012`, `R$ 1.260,00`, `10/11/2026`,
   `linha digitável 34191.79001 01043.510047 91020.150008 1 99990000150000`. Espere o modelo ficar **Aprovado**.
4. **Configurações do negócio › Usuários › Usuários do sistema › Adicionar** (função Administrador). Em "Atribuir ativos",
   dê ao usuário do sistema o aplicativo e a conta do WhatsApp com controle total. **Gerar token**: escolha o aplicativo,
   validade **Nunca** e as permissões `whatsapp_business_messaging` e `whatsapp_business_management`. Copie o token na hora.
5. Segredos (Edge Functions › Secrets): `WHATSAPP_TOKEN` (o token do passo 4), `WHATSAPP_NUMERO_ID` (ID do número do passo
   2) e `WHATSAPP_MODELO` = `fatura_mdc`. Opcionais: `WHATSAPP_IDIOMA` (padrão `pt_BR`) e `WHATSAPP_VERSAO` (versão da API,
   padrão `v23.0`; troque quando a Meta descontinuar). O número do cliente vem do contrato (DDD + número; o HUB põe o 55).

**Segredos da função, lista completa:** `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`, `GRAPH_REMETENTE`,
`WHATSAPP_TOKEN`, `WHATSAPP_NUMERO_ID`, `WHATSAPP_MODELO` (+ opcionais `WHATSAPP_IDIOMA`, `WHATSAPP_VERSAO`). O token do
agendador não é segredo de painel: mora no Vault do banco (`fatura_enviar_token`). Nada disso vai para o código nem para
o site; a tela só mostra os **nomes** que faltam.

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
