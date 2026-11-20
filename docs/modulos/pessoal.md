# MDC · Pessoal (finanças e tarefas da família)

> **Resumo:** app da família dentro do HUB (pedido do Edvaldo em 14/11/2026), com entrada própria em
> `/hub-mdc/pessoal`, marca e menu próprios. Cada família é uma organização do tipo `pessoal` (migração 075): tem
> Início com o resumo do dia, Tarefas (sem cliente e setor), Finanças (o Financeiro do HUB sem certificado digital e
> sem nota fiscal) e Família (pessoas, convites e permissões). O cadastro é aberto: qualquer pessoa cria a conta e a
> família começa do zero. O código é do Edvaldo Ribeiro de Carvalho (MDC Assessoria Contábil).

## 1. Telas

| Endereço | Quem vê | O que faz |
| --- | --- | --- |
| `/pessoal` | qualquer um (sem login) | Entrada: **Já tenho conta** / **Criar conta** (nome, e-mail, senha) e, para quem ainda não tem família, "Dê um nome para a sua família". "Esqueci a senha" manda falar com a MDC pelo WhatsApp. `?criar=1` abre direto em Criar conta; `?convite=ABCD-EFGH` mostra o aviso do convite e, depois do login ou do cadastro, entra na família do convite (`pessoal_aceitar_convite`) |
| `/` (Início) | membro da família | Saudação e quatro cartões: **Atrasadas**, **Vencem hoje**, **Próximos 7 dias** (a pagar) e **A receber em 7 dias**, com até 4 contas cada; atalhos "Lançar agora" e as tarefas em aberto. Regra em `dominios/pessoal/resumo.ts` |
| `/tarefas` | membro | A mesma tela de Tarefas do HUB, sem os campos e filtros de Cliente e Setor |
| `/financeiro/*` | membro (lançar: "Pode lançar") | O Financeiro do HUB (a pagar, a receber, entradas e saídas, contas bancárias, transferências, extratos, conciliação). Sem `/financeiro/certificado` |
| `/familia` | membro | Pessoas da família com a permissão (Responsável, Pode lançar, Só consulta); PDF e Excel. O responsável: **Convidar alguém**, **Mudar permissão**, **Tirar**, **Trocar o nome** e a lista de convites (Aguardando, Aceito, Cancelado, Vencido) com **Cancelar**. Quem não é responsável: **Sair da família** |

O menu da família (`components/shell/MenuPessoal.tsx`) só tem Início, Tarefas, Finanças e Família. A `Guarda` barra
qualquer outra tela do HUB enquanto a aba estiver numa família, e a busca rápida só mostra as telas da família.
Quem também é da equipe da MDC vê no menu do HUB o link "MDC · Pessoal" e, no menu da família, "Abrir o HUB da
MDC". A família escolhida vale para a aba (sessionStorage), então HUB e família podem ficar abertos lado a lado.

## 2. Regras (todas no banco, migração 075)

- **Família = organização `tipo = 'pessoal'`**, com um cliente "pessoa física" que é a empresa da gestão
  (`gestao_cliente_id`), plano de contas pessoal (37 contas: receitas e despesas de casa, de moradia a outras
  despesas) e 25 categorias. Não semeia licenças, perfis da equipe nem Ledgra. O tipo não muda pela tela.
- **Criar família** (`pessoal_criar_familia`): nome de 3 a 80 letras; até 3 famílias por conta; quem cria é o
  responsável (administrador) com Tarefas e Finanças em "gerir".
- **Cadastro aberto** (Função Edge `pessoal-cadastro`, sem login): campo escondido contra robôs, até 5 contas por
  hora por endereço de internet (só o resumo do IP é guardado), senha de 8 a 72 caracteres. A conta já nasce
  confirmada (o HUB não manda e-mail de cadastro).
- **Entrar numa família só por convite com código** (`pessoal_convidar` → `pessoal_aceitar_convite`): código
  `XXXX-XXXX` que aparece uma vez (no banco fica só o resumo), vale 7 dias e para uma pessoa; até 20 convites
  abertos por família; 10 códigos errados por hora por conta. A permissão vem do convite: **Pode lançar** = Tarefas e
  Finanças em "operar"; **Só consulta** = "ver".
- **Travas do cadastro aberto:** numa família não entra ninguém por convite do HUB, do Portal ou por link gerado
  (gatilho `pessoal_sem_convite`); `membros` de família só aceita quem tem entrada registrada
  (`app.pessoal_entradas`, gatilho `pessoal_porta_membro`); a **senha provisória do HUB não vale** para quem está
  numa família nem para conta com Portal em organização que quem pede não administra. Senha esquecida: a família
  fala com a MDC (WhatsApp 11 98859-8041).
- **Permissões** (`pessoal_definir_permissao`, só o responsável, nunca a própria) e **tirar/sair**
  (`pessoal_remover`: o responsável tira; a própria pessoa sai). O que a pessoa lançou continua.
- **Trocar o nome** (`pessoal_renomear`, só o responsável).
- Tudo vai para a auditoria (`app.registrar`, módulo `pessoal`).

## 3. Resumo diário (migração 076)

- **O que diz:** a pagar atrasado, a pagar hoje, a pagar nos próximos 7 dias, a receber até 7 dias e o que foi pago
  e recebido ontem (`app.pessoal_resumo_texto`, mesma divisão do Início). Sem nada a contar, não avisa.
- **Quando:** o agendador `pessoal-resumo` roda no minuto 3 de cada hora (`app.pessoal_resumo_rodar`); cada pessoa da
  família que vê as Finanças recebe **uma vez por dia**, a partir da hora escolhida (padrão 7h, no fuso da família).
- **Onde:** no sino do app e, para quem ligou "Avisar também no celular" e deixou o navegador avisar, na tela do
  aparelho (Web Push). Cada pessoa ajusta no Início › **Ajustar o resumo**: quero/não quero, horário (5h a 22h),
  celular, e liga ou desliga o aviso em cada aparelho (`pessoal_resumo_salvar`, `pessoal_push_inscrever`,
  `pessoal_push_remover`).
- **Entrega no celular:** o banco põe o aviso na fila `app.pessoal_push_fila`; o agendador só chama a Função
  `pessoal-aviso` quando há fila (token do Vault `pessoal_aviso_token`, como a 053). A função entrega com até 3
  tentativas e esquece aparelho que não existe mais. As chaves do Web Push (VAPID) são **geradas pela própria função
  na primeira vez e guardadas no Vault** (`pessoal_vapid`): ninguém digita nem cadastra chave.
- Service worker só de avisos: `web/public/sw-avisos.js` (não guarda cache).

## 4. "Você tem empresa?" — contato da MDC (migração 077)

- **Resposta:** desde a 078 é sempre a mesma ("A MDC recebeu o seu pedido").
- **Onde:** cartão no Início (só para o responsável, sem empresa indicada; "Agora não" esconde por 90 dias) e a seção
  "Contato da MDC sobre a sua empresa" na tela Família ("Indicar outra empresa", até 3 por família, e "Não quero mais
  contato").
- **O que a pessoa faz:** digita o CNPJ e toca em Buscar dados (a razão social vem da Receita pela BrasilAPI), confere
  o e-mail (vem o da conta) e o telefone (opcional), e marca a caixa da autorização — que vem **desmarcada** e mostra o
  texto em vigor (`app.pessoal_termo_contato`, versão 1).
- **O que vai para a MDC:** CNPJ, razão social, nome, e-mail e telefone da pessoa e os dados públicos da empresa na
  Receita (nome fantasia, cidade/UF, CNAE, porte, Simples/MEI, abertura, situação, endereço, telefone e e-mail
  cadastrais). Sem sócios e **nada das finanças da família**.
- **No Funil** (`pessoal_quero_contato`): CNPJ novo vira lead com origem **MDC · Pessoal**, anotação da autorização e
  aviso no sino do Comercial; CNPJ já no Funil (aberto) ganha só a anotação; CNPJ que já é cliente ativo da MDC não vira
  lead. A prova do consentimento (texto, versão e instante) fica em `pessoal_contatos_empresa`.
- **Retirar** (`pessoal_retirar_contato`): arquiva o lead que nasceu daquela autorização (com motivo) e anota na
  oportunidade que não se deve mais contatar por esse canal. Lead que já existia antes só ganha a anotação.
- **Ficha do lead no Comercial:** atalhos "Procurar no Google / Instagram / LinkedIn" com o nome e a cidade. A busca é
  feita por uma pessoa do Comercial; o HUB não coleta nada das redes sozinho (termos de uso das redes e LGPD: a
  autorização é para contato, não para montar perfil da pessoa).
- Antes de ir ao ar, o texto da autorização deve passar pelo advogado da MDC. Para mudar o texto, crie migração nova que
  troque `app.pessoal_termo_contato` subindo a versão.

## 4.1 Travas de segurança da auditoria de 14/11/2026 (migração 078)

- **Família só tem Tarefas e Finanças no banco**, não só na tela: `app.hub_pode`/`hub_pode_algum` recusam qualquer
  outro módulo numa organização `pessoal`, `app.eh_gestor` é falso e o Fiscal (`fis_pode`, `fis_pode_certificado`)
  recusa o cliente da família. Assim o "administrador da família" não chega a Contratos, envio de faturas pelos canais
  da MDC, Ledgra Link, Societário, Licenças, Atendimento nem Portal.
- **Conta do cadastro aberto** nasce com `app_metadata.origem = 'pessoal'`: os gatilhos de convite a ignoram e um
  gatilho em `membros`/`portal_usuarios` impede que ela entre na equipe ou no Portal. O cadastro recusa e-mail com
  convite pendente ou de ex-cliente (`pessoal_email_livre`), com a mesma resposta de "já existe conta".
- **Travas da família:** limite de 10 códigos errados por hora (código errado devolve vazio e a tentativa fica
  gravada); a organização da família não muda pela API (nome só por `pessoal_renomear`); limite de 3 famílias contado
  pela porta de entrada; membro não troca de conta nem volta sozinho; quem sai deixa as tarefas sem responsável; uma
  família com problema não para o resumo das outras.
- **"Você tem empresa?"** responde sempre "recebido" (não revela se a empresa é cliente ou já está no Funil), até 5
  pedidos por conta em 30 dias, o mesmo CNPJ em 30 dias não cria outro lead, e CNPJ já no Funil vira tarefa de
  conferência. A MDC dona do Funil é achada pelo CNPJ dela (`app.org_mdc`).
- **Aviso no celular:** só endereços dos serviços de aviso (Google, Mozilla, Apple, Microsoft) e o aparelho não troca
  de conta. A família nasce com a conta "Dinheiro (carteira)" para já poder pagar e receber.

## 4.2 Ajustes de 14/11/2026 (migração 079 e telas)

- **Membros só pelas funções:** políticas restritivas em `membros` barram inserir, mudar e apagar membro de família
  direto pela API (as funções `pessoal_*` continuam valendo). Na equipe da MDC nada muda.
- **A família nunca fica sem responsável:** o único responsável não sai nem é tirado (`pessoal_remover` pede para dar
  a permissão de responsável a outra pessoa antes). Qualquer responsável retira a autorização de contato da família.
- **Aviso no celular abre a família certa:** o título leva o nome da família, o link vai com `?org=<família>` e cada
  família tem a sua marca de aviso (quem está em duas recebe os dois). Tocar no aviso foca a aba que já está na família
  ou abre uma janela nova; nunca troca uma aba com trabalho aberto. "Sair" desliga o aviso do aparelho.
- **Cadastro aberto:** além de 5 contas por hora por endereço de rede, teto geral de 60 contas novas por hora.
- **Entrada (`/pessoal`):** falha de internet ou de sessão mostra "Não conseguimos abrir agora" com "Tentar de novo";
  nunca oferece criar uma segunda família por engano. Cliente do Portal que também tem família continua indo ao Portal
  ao abrir o HUB; a família abre pelo `/pessoal`.

## 4.3 O app no celular (desenho de 14/11/2026)

Desenho aprovado pelo Edvaldo no quadro "MDC · Pessoal — desenho do app" (protótipo para tocar). No código:

- **Barra de baixo** (`componentes/app/BarraPessoal.tsx`, só no modo família e só no celular): Hoje, Contas, **+**,
  Tarefas e Família. No computador vale o menu lateral e o **+** vira o botão flutuante "Lançar".
- **Botão +**: folha "O que você quer lançar?" com gasto, entrada, tarefa e extrato do banco.
- **Lançar gasto ou entrada** (`LancamentoRapido.tsx`): teclado de valor grande (os dígitos são centavos), tipo de gasto
  com ícone, Hoje/Ontem/Outro dia e "Já paguei" com a conta de onde saiu. Grava por `fin_lancar` (a mesma função do
  Financeiro), já pago quando marcado.
- **Hoje** (`InicioPessoal.tsx`): sobra prevista no mês, quanto das contas do mês já foi pago, o que está atrasado ou
  vence hoje (com Pagar) e os próximos 7 dias. Resumo diário e "Você tem empresa?" foram para a tela Família, junto
  com o cartão "Finanças da família" (contas e cartões, lista completa com PDF/Excel, extrato e painel).
- **Contas** (`/financeiro/contas`, só na família; fora dela leva a Contas a pagar): abas A pagar / A receber / Pagas no
  mês, agrupadas em Atrasadas, Hoje, Próximos 7 dias e Mais para frente.
- **Pagar** (`PagarConta.tsx`): baixa do que falta com um toque por `fin_baixar`, escolhendo a conta e o dia. Pagamento
  parcial, juros e desconto ficam na lista completa.
- Regras puras em `dominios/pessoal/app.ts` (com teste): agrupar por vencimento, resumo do mês, teclado, ícone por tipo
  de gasto e o texto "Atrasada há N dias". Quem grava avisa as telas abertas (`pessoal:mudou`) e mostra o aviso rápido.
- **Como achar o app:** no Início do HUB, quem também tem família vê o cartão "Suas finanças pessoais · MDC · Pessoal"
  com "Abrir" (`CartaoMinhaFamilia`); no Início da família, a faixa "Tenha o MDC · Pessoal como app" com "Instalar"
  (`BotaoInstalarApp variante="faixa"`, some quando já roda instalado). Endereço direto: `/hub-mdc/pessoal`
  (`ENDERECO_PESSOAL` em `entrada.ts`). A entrada sem login mostra a faixa "Instalar" no celular e, no computador, um QR
  code para abrir no celular (`app/pessoal/_componentes/LevarProCelular.tsx`). `next.config.ts` já leva
  `pessoal.mdcassessoria.com` para a entrada, quando o domínio for apontado para a Vercel. Fotos sem login: `SEMLOGIN=1`.
- **Ícone do app:** o oval com as três barras "///" do logo da MDC, dourado sobre o verde (`public/icone-pessoal-*.png`,
  no `manifest-pessoal.webmanifest`, no `app/pessoal/layout.tsx` e trocado pela Moldura dentro da família).

## 4.4 Plano de contas simples e evolução do dinheiro (migração 081)

- **Plano da família = só Entradas e Gastos**, um nível, com nomes do dia a dia. Não segue o plano do Domínio.
  - Entradas: Salário, Renda extra, Aluguel recebido, Outras entradas.
  - Gastos: Moradia, Contas da casa, Mercado, Restaurante e delivery, Transporte, Saúde, Educação, Lazer, Compras pessoais,
    Cartão e empréstimos, Impostos e taxas, Outros gastos.
  - Os códigos 1.xx e 2.xx existem só por dentro. A família nova nasce com este plano (`app.pessoal_semear_plano`).
  - A 081 trocou o plano antigo das organizações que ainda não tinham nenhum lançamento. Quem já lançou fica como está.
- **Novo tipo de gasto/entrada**: a família digita só o nome. Por dentro ele vai para "Outros gastos" ou "Outras entradas"
  (grupo Gastos ou Entradas).
- **Gráficos de evolução** (`saldoPorMes` em `dominios/financeiro/painel.ts`, `GraficoSaldo` em `GraficosPainel.tsx`):
  - Painel de Finanças da família: 12 meses de "Entrou e saiu, mês a mês" e "Dinheiro guardado" (saldo das contas no fim
    de cada mês, calculado de trás para frente a partir do saldo de hoje).
  - Tela Hoje: cartão "Como seu dinheiro evoluiu" com os dois gráficos alternados (`EvolucaoDoDinheiro.tsx`); some enquanto
    não há nada pago ou recebido.

## 4.5 Lançar falando (migração 082 e Função Edge pessoal-voz)

- No **+** (ou "Lançar" no computador), o botão **Falar** abre o microfone. A pessoa fala, por exemplo: "paguei a luz 230
  ontem e recebi o salário de 5 mil". O app monta um ou mais lançamentos no cartão **Entendi assim**. Ali ela confere,
  corrige e toca em **Salvar**. **Nada é gravado sem conferir.**
- **Ouvir:** o reconhecimento de voz do navegador (Chrome no Android e Safari no iPhone), em pt-BR. Onde não existe, o
  campo "Diga ou escreva" recebe o texto, e o microfone do teclado do celular faz o papel.
- **Entender, 1º passo (sem custo):** `dominios/pessoal/voz.ts` (com teste) lê:
  - valor ("1.250,50", "5 mil", por extenso);
  - data (ontem, dia 10, amanhã);
  - se já foi pago (verbos no futuro deixam a conta em aberto);
  - tipo de gasto ou entrada (nome da categoria ou palavras do dia a dia: luz → Contas da casa, posto → Transporte).
- **Aprende com a família:** ao salvar, cada descrição conferida vira uma ligação palavras-chave → tipo de gasto
  (`palavrasChave`/`aprender`/`lembrar`). A ligação fica guardada neste aparelho (`localStorage`
  `pessoal:voz-aprendeu:<família>`, até 300) e vale antes das pistas na próxima fala. Exemplo: "Ração" → Pet.
- **IA desligada (o app é gratuito, decisão do Edvaldo em 14/11/2026).** A Função `pessoal-voz` e a trava
  `pessoal_voz_pode` (082) estão publicadas, mas o app não as chama. Para ligar no futuro:
  - `NEXT_PUBLIC_PESSOAL_VOZ_IA=1` na Vercel, `ANTHROPIC_API_KEY` e `PESSOAL_VOZ_LIGADA=sim` nos segredos do Supabase
    (este último desde 20/11/2026, SEG-03: sem ele a Função não chama a IA mesmo que alguém a chame direto);
  - quando ligada, a IA só é chamada se faltar valor ou tipo (Claude, modelo em `PESSOAL_VOZ_MODELO`), com limite de 30
    por hora e 150 por dia por pessoa;
  - a resposta da IA é conferida (tipo, valor, data em até 400 dias, categoria da lista);
  - o aviso da primeira vez passa a falar da IA.
- **LGPD:** na primeira vez, um aviso explica que a fala vira texto pelo navegador (Google ou Apple) e que o app entende
  a frase sem mandar para nenhuma IA. Nem o áudio nem o texto ficam guardados (`app.pessoal_voz_uso` guarda só quem usou e quando,
  por 2 dias, para o limite).

## 4.6 Privacidade, excluir a conta e Google Play (migração 083)

- **Política de privacidade** pública em `/pessoal/privacidade`. O link fica no cadastro e em Família › Sua conta.
- **Excluir minha conta** em `/pessoal/excluir-conta` (pública; com login, pede a palavra EXCLUIR). O link fica em
  Família › Sua conta. A exclusão é feita em dois passos:
  1. `pessoal_excluir_conta_preparar` (083):
     - família em que a pessoa está sozinha: é apagada inteira (on delete cascade; o banco marca `app.pode_apagar`);
     - família com mais gente: a pessoa sai, e se era a única responsável a mais antiga vira responsável;
     - a autorização de contato da MDC é retirada;
     - conta que também é do HUB ou do Portal é barrada.
  2. Função `pessoal-excluir-conta` apaga o login (chave de serviço só na função).

  O apagar da família inteira foi conferido em produção numa simulação desfeita no fim.
- **App Android (Google Play):** o mesmo site em tela cheia (TWA), pacote `com.mdcassessoria.pessoal`.
  - O `/.well-known/assetlinks.json` sai de `api/android/assetlinks` (rewrite em `web/vercel.json`, porque o Next não
    reescreve fora do `/hub-mdc`).
  - A impressão digital fica em `ANDROID_SHA256` na Vercel.
  - Passo a passo, textos da ficha e respostas de segurança em `docs/modulos/pessoal-play-store.md`; imagens em
    `docs/loja-pessoal/`.
- **Microfone:** o cabeçalho `Permissions-Policy` libera `microphone=(self)`. Antes estava bloqueado, e o "lançar falando"
  não abria o microfone.

## 5. Arquivos

- Banco: `supabase/migrations/075_mdc_pessoal.sql` e `076_pessoal_resumo_diario.sql`; testes
  `supabase/testes/141_base_075.sql`, `142_pessoal_075.sql` (P1 a P23), `143_base_076.sql` e `144_resumo_076.sql`
  (R1 a R15); `077_pessoal_contato_empresa.sql` com `145_base_077.sql` e `146_contato_077.sql` (C1 a C17); `078_pessoal_seguranca.sql` com `147_base_078.sql` e `148_seguranca_078.sql` (S1 a S17).
- Funções Edge: `supabase/functions/pessoal-cadastro/index.ts` (cadastro aberto) e `pessoal-aviso/index.ts`
  (aviso no celular).
- Site: `web/src/app/pessoal/page.tsx` (entrada), `web/src/app/(hub)/familia/page.tsx`,
  `web/src/dominios/pessoal/` (`entrada.ts`, `resumo.ts`, `familia.ts` com testes; `componentes/InicioPessoal.tsx`,
  `componentes/JanelaConvidar.tsx`, `componentes/ResumoDiario.tsx`, `componentes/CartaoEmpresa.tsx`, `componentes/JanelasFamilia.tsx`; `contatoEmpresa.ts`, `avisoCelular.ts` com teste), `components/shell/MenuPessoal.tsx`.
- Fotos de tela da família: `PESSOAL=1 npm run telas` (a organização de exemplo vira "Família Carvalho").

## 6. Limitações

- Sem confirmação de e-mail no cadastro (o HUB não envia e-mail de cadastro); a trava é por IP e o robô cai no campo
  escondido.
- Aviso no celular depende do navegador: Chrome no Android e no computador funcionam direto; no iPhone só com o app
  instalado na tela de início (iOS 16.4 ou mais novo).
