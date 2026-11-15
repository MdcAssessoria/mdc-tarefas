# MDC · Pessoal na Google Play

O app da loja é o **mesmo site** (`https://hub.mdcassessoria.com/hub-mdc/pessoal`) aberto em tela cheia, sem a barra de
endereço. O Android chama isso de *Trusted Web Activity* (TWA). Toda melhoria publicada no site já vale no app da loja,
sem enviar versão nova, exceto quando mudar o ícone ou o nome.

O que já está pronto no código (Edvaldo Ribeiro de Carvalho, 14/11/2026):

| Item que a Google exige | Onde está |
|---|---|
| Ligação site ↔ app (Digital Asset Links) | `https://hub.mdcassessoria.com/.well-known/assetlinks.json`: rota `web/src/app/api/android/assetlinks` + rewrite em `web/vercel.json`; a impressão digital vem de `ANDROID_SHA256` na Vercel |
| Política de privacidade (link público) | `https://hub.mdcassessoria.com/hub-mdc/pessoal/privacidade` |
| Excluir a conta (no app e por link público) | No app: Família › Sua conta › Excluir minha conta. Link: `https://hub.mdcassessoria.com/hub-mdc/pessoal/excluir-conta` (migração 083 + Função `pessoal-excluir-conta`) |
| Ícone 512×512 | `docs/loja-pessoal/icone-512.png` |
| Arte de destaque 1024×500 | `docs/loja-pessoal/grafico-destaque-1024x500.png` |
| Fotos do celular (1080×2160) | `docs/loja-pessoal/1-…png` a `3-…png` |

Pacote do app: **`com.mdcassessoria.pessoal`**. Não muda nunca depois de publicado.

## Passo a passo (feito pelo Edvaldo)

### 1. Conta de desenvolvedor da Google
1. Acesse `play.google.com/console` com a conta Google da MDC e escolha **Organização**.
2. A Google pede o número **D-U-N-S** da MDC Assessoria Ltda. Se a MDC ainda não tiver, ele é gratuito e é pedido no
   site da Dun & Bradstreet; leva alguns dias.
3. Pague a taxa única de US$ 25. Conta de organização não precisa do teste fechado com 12 pessoas que a Google exige de
   contas pessoais.

### 2. Gerar o pacote do app (PWABuilder, sem instalar nada)
1. Abra `www.pwabuilder.com`, cole `https://hub.mdcassessoria.com/hub-mdc/pessoal` e clique em **Start**.
2. Clique em **Package for stores › Android › Generate Package** e confira:
   - Package ID: `com.mdcassessoria.pessoal`
   - App name: `MDC · Pessoal`; Short name: `MDC Pessoal`
   - Host: `hub.mdcassessoria.com`; Start URL: `/hub-mdc/pessoal`
   - Signing key: **Create new**. Preencha com os dados da MDC; a senha é você quem cria e guarda.
3. Baixe o ZIP. Ele traz o `.aab` (o arquivo que vai para a loja), a **chave de assinatura** (`signing.keystore`) e as
   senhas (`signing-key-info.txt`).
   - **Guarde a chave e as senhas fora do computador e fora do GitHub** (cofre de senhas da MDC). Sem elas não dá para
     publicar atualizações do app.

### 3. Ligar o site ao app
1. No ZIP, abra o `assetlinks.json` e copie o código grande depois de `sha256_cert_fingerprints`, no formato `AB:CD:…`.
2. Na Vercel (projeto `mdc-tarefas` › Settings › Environment Variables), crie `ANDROID_SHA256` com esse código e
   publique de novo (Redeploy).
3. Confira se `https://hub.mdcassessoria.com/.well-known/assetlinks.json` mostra o código.

### 4. Publicar na Play Console
1. **Criar app**: nome `MDC · Pessoal`, idioma português (Brasil), App, Gratuito.
2. **Teste interno** › Criar versão › envie o `.aab`.
3. Em **Configuração › Integridade do app**, copie a **impressão digital SHA-256 do certificado de assinatura do app**
   (a Google assina de novo). Acrescente essa impressão em `ANDROID_SHA256` na Vercel, separada da primeira por vírgula,
   e publique de novo. Sem isso, o app da loja abre com a barra de endereço.
4. Instale pelo link do teste interno e confira se abre sem barra de endereço.
5. Preencha a ficha da loja (abaixo) e as declarações, e envie para **Produção**.

### Ficha da loja (textos prontos)

- **Nome:** MDC · Pessoal
- **Descrição curta (até 80):** As finanças e as tarefas da família num lugar só. Fale o gasto e pronto.
- **Descrição completa:**

  > O MDC · Pessoal organiza o dinheiro da sua família de um jeito simples, feito para quem não gosta de planilha.
  >
  > • Lance gastos e entradas em segundos, pelo teclado ou falando: "paguei a luz 230 ontem".
  > • Veja o que vence hoje e nos próximos dias, e pague com um toque.
  > • Gráficos mostram quanto entrou, quanto saiu e como o dinheiro guardado evoluiu no ano.
  > • Convide quem mora com você para lançar junto ou só acompanhar.
  > • Receba um resumo diário no celular.
  > • Tarefas da casa no mesmo app.
  >
  > Grátis. Feito pela MDC Assessoria Contábil, de Bragança Paulista/SP.

- **Categoria:** Finanças. **E-mail de contato:** edvaldo@mdcassessoria.com. **Site:** mdcassessoria.com
- **Política de privacidade:** `https://hub.mdcassessoria.com/hub-mdc/pessoal/privacidade`
- **Exclusão de conta (URL):** `https://hub.mdcassessoria.com/hub-mdc/pessoal/excluir-conta`
- **Público-alvo:** 18 anos ou mais. **Anúncios:** não tem.
- **Fotos:** as de `docs/loja-pessoal`. Antes do envio, refazer com uma família de exemplo; as atuais ainda usam a
  base de exemplo da empresa nas telas Hoje, Contas e Finanças.

### Segurança dos dados (formulário "Data safety")

| Pergunta | Resposta |
|---|---|
| Coleta dados? | Sim |
| Dados | Nome, e-mail; informações financeiras (o que a pessoa lança); IDs do app (aviso no celular) |
| Compartilha com terceiros? | Não (Supabase e Vercel são prestadores que guardam os dados por nós) |
| Para quê | Funcionamento do app; gerenciamento da conta |
| Criptografia em trânsito | Sim |
| A pessoa pode pedir exclusão | Sim (no app e pelo link) |
| Gravação de áudio | Não: a fala vira texto pelo próprio navegador e não é guardada |

## iPhone

A Apple não permite instalar app por link: só pela App Store (US$ 99 por ano + revisão). Até lá, no iPhone, o caminho é o
Safari › Compartilhar › Adicionar à Tela de Início, com **"Abrir como App Web" ligado**. O passo a passo do app já mostra
isso.
