# Reauditoria do HUB-MDC · 01/11/2026 · correções do parecer do agente do SharePoint e do link pelo WhatsApp

- **Escopo:** commit `1bb90d0` (correções do [parecer de 01/11](2026-11-01-parecer.md)), junto com `ddaf4af` e
  `cd5ae11`, nenhum deles enviado ao GitHub. Arquivos não versionados do Financeiro (`026_financeiro_base.sql`,
  `web/src/dominios/financeiro/`, `armazenamentoLocal.ts`) ficaram de fora.
- **Quem auditou:** agente independente `auditor-hub`. Leu o código, rodou as verificações numa cópia limpa do commit
  (`git archive 1bb90d0`) e consultou o banco `bulqqdgfrrpqquqvjjfa` só com `select` e os avisos de segurança. Não
  aplicou, publicou nem alterou nada.
- **Banco no momento da reauditoria:** migração `20261101131824_025_link_convite_seguro` aplicada; funções no ar:
  `convite` v3 (sem `so_link`), `demonstrativo-pdf` v6 e `certificado` v1; `balancete-agente` **não** publicada;
  nenhuma integração ativa em `hub_integracoes`; 1 convite de equipe e 1 convite de cliente pendentes.

## Verificações

| Etapa | Resultado |
| --- | --- |
| `npm ci` + `npm run verificar` (tipos, eslint, vitest, núcleo, build) | ok: 0 erros de tipo; eslint 0 erros e 40 avisos (os mesmos de antes); 21 arquivos e 109 testes passando; "Cópias do núcleo nas Funções Edge conferidas"; build ok |
| `npm run telas` | ok, 26 de 26 telas |
| `deno test --allow-env agente_test.ts` | 4 de 4 passam (ordem por mês, SharePoint ocupado, nova tentativa, pasta ocupada) |
| `deno check --config deno.json index.ts` | ok em `balancete-agente` e `convite` |
| Teste da conferência do núcleo (M-5) | alterei uma cópia em `nucleo/` → o script regenera e avisa; alterei a tela → `npm run nucleo` sai com erro (1). **Funciona** |
| Banco: funções da 025 | `adicionar_membro`, `hub_pode_ver_link_convite`, `portal_convidar` e `app.tg_portal_convite_sem_conta` no banco têm o texto da 025; todas `security definer` com `search_path=public`; gatilho `portal_convite_sem_conta` ligado (`before insert or update of email`) |
| Banco: `pg_net` (M-8) | extensão no esquema `extensions` (0.20.4); esquema `net` presente; fila `net.http_request_queue` = 0; `net.check_worker_is_up()` sem erro; job `agente-balancetes` ativo |
| Avisos de segurança do Supabase | o aviso `extension_in_public` **sumiu**. Restam os de antes: 39 funções `security definer` chamáveis por logado (RPCs do site), `crm_receber_lead` sem login (intencional), proteção de senha vazada desligada |
| Quem tem Atendimento › gerir hoje (consulta) | só administradores (3) e o gestor (1, por ser gestor). Analistas têm "operar" |

## Veredito

**Aprovado com ressalvas.**

- **(a) Publicar as funções:** pode publicar a `convite` (com `so_link`) e a `balancete-agente` (`verify_jwt`
  falso, pelo comando do capítulo 7.4). A `balancete-agente` não lê nada sozinha enquanto a pasta não for ligada em
  Configurações › Integrações. Ligue primeiro só para a pasta do grupo "Piloto HUB" (MDC e Greencore) e faça os testes
  de R-M1 e R-B5 antes de pôr a carteira.
- **(b) Push de `ddaf4af`, `cd5ae11` e `1bb90d0`:** pode, **depois** de publicar as duas funções. Se o site sair
  antes, o botão "Link para WhatsApp" chama a `convite` v3, que ignora `so_link` e manda o convite por e-mail; e a tela
  Integrações chama uma função que ainda não existe.
- **Condição:** o achado R-A1 (alto, latente) precisa de uma migração nova antes de dar Atendimento › gerir a quem não
  é administrador ou gestor. Hoje só administradores e o gestor têm essa permissão, por isso o risco não bloqueia a
  publicação.

## Situação dos achados do parecer de 01/11

| Achado | Situação | Evidência |
| --- | --- | --- |
| C-1 link de convite de equipe para quem gere o Atendimento | **Resolvido** | `025:29-41` (e-mail de equipe exige administrador de todas as organizações), `025:105-108` (`portal_convidar` recusa), `025:174-176` (gatilho), conferido no banco |
| Ordem inversa (revisão da 025) | **Parcial**: ver R-A1 | `025:137-148` |
| Regra só na função (`portal_convites` direto pela API) | **Resolvido** | gatilho `before insert or update of email` com a recusa (`025:167-178`) |
| "Algum" × "todos" administradores | **Resolvido** | `025:72-76` |
| A-1 migrações antes do parecer | **Resolvido**: 025 aplicada depois da revisão, com aprovação do Edvaldo; tipos regenerados em `cd5ae11` | `list_migrations` |
| A-2 arquivo pesado trava o agente | **Parcial**: limite de 5 MB e o arquivo sai da entrada antes da leitura (`agente.ts:446-500`); o **limite por tempo não foi feito** (ver R-M1) | |
| A-3 falha passageira vai para "Com problema" | **Resolvido**: 429/5xx/rede viram `ErroPassageiro`, uma nova tentativa na hora e depois o arquivo fica na pasta (`agente.ts:98-118`, `473-477`) | teste "SharePoint ocupado" |
| M-1 aviso a cada 15 min | **Resolvido**: se não consegue mover, fica para a próxima rodada sem histórico nem aviso (`agente.ts:480-491`) | |
| M-2 ordem por nome de arquivo | **Resolvido**: grava em ordem de empresa e mês (`agente.ts:555-559`) | teste "importa em ordem de mês" |
| M-3 erros ignorados | **Resolvido** no essencial (`lerTudo`, consultas de existência e do mês anterior, histórico, avisos, registro). Sobra: a consulta da lista de integrações no agendador (`index.ts:72-76`) e a da equipe para o aviso (`agente.ts:649-654`) não olham `error` (baixo) | |
| M-4 publicação sem `verify_jwt` falso | **Resolvido**: `supabase/config.toml` e docs 7.4 | |
| M-5 cópia do núcleo pode divergir | **Resolvido**: `npm run nucleo` dentro do `verificar` (testado) | |
| M-6 SheetJS do espelho npm | Pendente aceito (o `xlsx.mjs` foi conferido pelo autor; `deno.lock` fixa o hash) | |
| M-7 documentação | **Resolvido** em 04, 06 e 07. Sobra R-B3 (capítulo 05) | |
| M-8 `pg_net` no `public` | **Resolvido**: em `extensions`, worker de pé, aviso sumiu | |
| B-1 leitura dupla | **Resolvido** com trava por `UPDATE` condicional (`agente.ts:307-326`); ver R-B1 e R-B5 | |
| B-2 mensagem do leitor trocada | **Resolvido** (`agente.ts:539-543`); ver R-B2 | |
| B-3 a B-9 | Pendentes aceitos | |

## Achados novos

### Alto

**R-A1 · alto (latente) · A "ordem inversa" ainda pode ser contornada: desativar o acesso de cliente e entrar uma vez basta**
- A 025 recusa ligar à equipe um e-mail com acesso de cliente **ativo** ou com conta **nunca usada**
  (`025:142-147`). Só que quem tem Atendimento › gerir controla as duas coisas:
  1. cadastra acesso de cliente para o e-mail de quem ainda vai entrar na equipe (ex.: `novo@mdcassessoria.com`,
     fácil de prever) e pede o "Link para WhatsApp" (permitido: ainda não há convite de equipe);
  2. abre o link e cria a senha, o que preenche `last_sign_in_at`;
  3. desativa o acesso de cliente. A política `portal_usuarios_update` (020:24-26) permite;
  4. quando o administrador cadastra esse e-mail na equipe, `adicionar_membro` encontra a conta, não há convite de
     cliente pendente nem acesso ativo, a conta "já entrou", e o membro é gravado na hora com o papel escolhido (até
     administrador) (`025:156-162`). Fica só um registro `cliente_para_equipe` na auditoria, sem aviso a ninguém.
- Resultado: quem pediu o link entra como o novo funcionário, e o funcionário verdadeiro nem recebe e-mail.
- **Correção de responsabilidade do auditor:** a regra "entrar ao menos uma vez" foi sugerida por mim na revisão da
  025 e não basta, porque quem entra pode ser justamente quem pediu o link.
- **Hoje** só administradores e o gestor têm Atendimento › gerir (consulta ao banco). O caminho, portanto, é um
  gestor virar administrador. O risco é real, mas restrito. A publicação de `so_link` torna o passo 1 direto.
- **Correção (próxima migração livre, 027, já que a 026 é do Financeiro):** em `adicionar_membro`, recusar
  **qualquer** conta que tenha ou já tenha tido `portal_usuarios`, ou cujo e-mail tenha registro `link_convite` na
  auditoria, com a mensagem "Este e-mail já foi usado como acesso de cliente; cadastre a pessoa na equipe com outro
  e-mail". Transformar cliente em funcionário com o mesmo e-mail é raro e pode ser feito pelo suporte com
  redefinição de senha pelo e-mail. Teste: gestor faz os passos 1 a 3 → administrador tenta cadastrar → recusado.
- **Até a correção:** não dar Atendimento › gerir a analistas.

### Médio

**R-M1 · Se a rodada cair no meio, todos os arquivos já lidos vão para "Com problema" sem ser importados**
- O agente agora trabalha em duas fases: primeiro baixa, move para "Com problema" e lê **todos** os arquivos
  (`agente.ts:445-553`); só depois grava (`:560-633`). Se a função cair na fase 1 ou no começo da fase 2, todos os
  arquivos lidos até ali ficam em "Com problema" com o motivo "leitura interrompida (arquivo fora do padrão ou
  pesado demais)", inclusive os bons. Nada é perdido nem gravado errado: o arquivo e o histórico ficam lá. Mas o
  contador tem de importar à mão e o motivo engana.
- Quando isso acontece: (1) estouro do limite de CPU da Função Edge (2 s por pedido no Supabase, *a confirmar no
  plano*). Medi 9 a 45 ms por CSV e cerca de 0,4 s num XLSX de 1,1 MB; 20 arquivos XLSX por rodada podem passar
  disso. A recomendação de A-2 ("limitar por tempo, não só por quantidade") não foi feita. (2) Um erro que não é
  passageiro no download de um arquivo do meio (`agente.ts:478`, ex.: 401/403 ou um código diferente de
  404/429/5xx) interrompe a rodada inteira depois que os anteriores já saíram da entrada.
- Correção: orçamento de tempo (parar de baixar e ler depois de ~1 s de processamento ou ~60 s de relógio, e o resto
  fica para a próxima rodada); envolver a fase 1 em `try/finally` para gravar os já lidos mesmo se um download falhar;
  ou baixar `POR_RODADA` para 5–8. **Teste no piloto:** colocar 20 balancetes reais (XLSX) na pasta do Piloto HUB e
  conferir que todos entram como rascunho.

**R-M2 · `agente.ts` com 690 linhas** (acima das ~400 da convenção). A separação de `index.ts` ajudou nos testes.
Separar Graph (`graph`, `abrirPasta`, `mover`) da regra de importação deixaria o arquivo mais fácil de manter.

### Baixo

- **R-B1** "Testar conexão" durante uma leitura grava `ultimo_resultado` (`index.ts:133`) e **solta a trava**, o que
  deixa um "Ler a pasta agora" ou o agendador começar uma segunda leitura ao mesmo tempo. Volta o problema de B-1,
  que é raro. Correção: o "testar" não deve gravar por cima de "Lendo a pasta agora".
- **R-B2** Qualquer erro com menos de 300 caracteres vai para o histórico como motivo (`agente.ts:540-543`),
  inclusive erros técnicos como `TypeError: Cannot read properties…`. Use só `ErroAgente` e as mensagens do leitor,
  e um texto padrão para o resto.
- **R-B3** `docs/05-seguranca-e-acessos.md:100` ainda diz "link de convite só para administrador", o que contradiz a
  linha 106, e nenhuma das duas traz as regras novas da 025 (equipe recusa e-mail de cliente; gatilho em
  `portal_convites`).
- **R-B4** Se o arquivo for importado e o segundo movimento falhar (de "Com problema" para "Processados",
  `agente.ts:430`), ele fica em "Com problema", embora o histórico diga "importado". E o nome com o carimbo de data
  vai para "Processados". Só aparência.
- **R-B5** *A confirmar:* o filtro da trava (`.or(... neq."Lendo a pasta agora" ..., ultima_execucao.lt.<data>)`,
  `agente.ts:317-319`) não é testado, porque a simulação do teste ignora filtros. Se o PostgREST recusar a sintaxe,
  todo "Ler agora" responde "Não consegui ler os dados do HUB". Conferir no piloto: um "Ler agora" deve funcionar, e
  um segundo clique durante a leitura deve dizer "A pasta já está sendo lida".

### Sem achado (conferido)

- Segurança da `balancete-agente` com `verify_jwt` falso: sem `x-agente-token` válido (conferido pelo banco, só
  `service_role`), a função exige login e uma leitura de `hub_integracoes` pela RLS de administrador. CORS restrito às
  três origens; segredos só por `Deno.env`.
- `config.toml`: `verify_jwt = false` só no agente; as outras três continuam com `true`.
- 025 não quebra os fluxos legítimos: o administrador convida e reenvia para a equipe; gestor e Atendimento convidam e
  reenviam para cliente que não é da equipe. Um membro que já está na organização pode ser reeditado
  (`025:138`).

## Ordem recomendada

1. Publicar `balancete-agente` (comando do 7.4) e `convite`.
2. Push de `ddaf4af`, `cd5ae11` e `1bb90d0`.
3. Ligar a pasta só do Piloto HUB e testar: 20 arquivos reais, um ilegível, dois meses da mesma empresa, "Ler agora"
   duas vezes seguidas (R-M1, R-B5).
4. Migração 027 para R-A1, antes de ampliar Atendimento › gerir ou de abrir o portal à carteira. Na mesma leva:
   R-M1, R-B1 e R-B3.
