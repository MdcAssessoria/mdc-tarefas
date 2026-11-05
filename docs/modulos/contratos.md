# Módulo Contratos

> **Resumo:** contratos fixos da gestão da própria MDC (decisão do Edvaldo, 02/11/2026): **a receber** (honorários
> mensais dos clientes da MDC) e **a pagar** (aluguel, sistemas, serviços). O módulo guarda o contrato em si (partes,
> número, objeto, vigência, renovação, anexos e histórico), lança a conta de cada mês no **Financeiro** no dia 1 e, uma
> vez por ano, **propõe o reajuste** pelo índice acumulado de 12 meses do Banco Central (IPCA, IGP-M, INPC) ou por % fixo;
> a pessoa confere e confirma. Migração `041_contratos_recorrentes.sql`; testes em `supabase/testes/95_base_041.sql` e
> `96_recorrentes_041.sql`.
>
> **Faturamento (043, pedido do Edvaldo em 03/11/2026, etapa 1):** contrato a receber diz se gera **nota fiscal (NFS-e)**
> ou **só nota fatura**, **o que enviar** ao cliente (4 opções), o **dia de gerar** (separado do dia de vencer) e **por onde**
> (e-mail, WhatsApp, Portal do Cliente). No dia de gerar o HUB cria a conta a receber, a **fatura numerada** e a fila de
> envio. Etapa 1 não tem integração: NFS-e (Emissor Nacional), envio de e-mail/WhatsApp e boleto ficam "aguardando";
> o Portal já recebe. Migração `045_contratos_faturamento.sql`; testes `99_base_043.sql` e `100_faturamento_043.sql`.
>
> **NFS-e pelo Emissor Nacional (046, etapa 2, autorizada pelo Edvaldo em 03/11/2026):** a MDC é ME/EPP do Simples e, pela
> Resolução CGSN 191/2026, emite NFS-e pelo Emissor Nacional desde 01/11/2026. Em Contratos › Faturas, **Emitir nota** abre a
> conferência (ambiente em destaque) e a Função Edge `nfse-emitir` manda a DPS assinada com o A1 da MDC à API da Sefin
> Nacional. Começa no **ambiente de teste** (produção restrita, sem valor fiscal). Seção 5. Migração `046_nfse_emissao.sql`;
> testes `101_base_046.sql` e `102_nfse_046.sql`.
>
> **Receita por sistema (059, decisão do Edvaldo em 05/11/2026):** o HUB controla as finanças da MDC e a receita das
> licenças dos sistemas e módulos que ela vende (Ledgra, EXato e os próximos). O Ledgra cuida dos clientes e da cobrança
> deles; no HUB fica o controle das licenças vendidas e a previsibilidade da receita. Seção 7. Migração
> `059_sistemas_receita.sql`; testes `127_base_059.sql` e `128_sistemas_059.sql`.

## 1. Telas

Módulo próprio no grupo **Gestão** do menu lateral (ferramenta `contratos` em `hub_apps`, acesso ver/operar/gerir
liberado pelo administrador por pessoa).

| Endereço | Quem usa | O que faz |
| --- | --- | --- |
| `/contratos` | Contratos (ver; cadastrar e mexer com operar) | Lista no molde 8.3.1 (só os contratos da MDC): tipo (a receber/a pagar), situação e busca; indicadores que filtram (recebe por mês, paga por mês, reajustes pendentes, vigência terminando em 30 dias); quadro que vira cartão no celular; saldo mensal dos ativos; PDF e Excel. Ações: **Novo contrato**, **Reajustar** (quando pendente), ficha, editar, suspender/reativar e encerrar (com motivo, `JanelaMotivo`) |
| `/contratos/faturas` | Contratos (ver; gerar e cancelar com operar) | Faturas dos contratos a receber no molde 8.3.1: período do vencimento, situação e busca; indicadores que filtram (faturado no período, aguardando nota fiscal, prontas para enviar, enviadas); quadro que vira cartão no celular; PDF e Excel; avisos de envio aguardando configuração (com o caminho para Contratos › Envio) e de envio que não saiu (053); cada canal da fila na lista mostra se foi, está na fila, falhou ou aguarda (o motivo aparece ao passar o mouse e no detalhe). Ações: botão do **banco** (gerar ou ver o boleto pelo Ledgra Link, `JanelaBoleto`, 049), **PDF** da fatura (papel timbrado MDC, `faturaPdf.ts`), **Ver** (dados, nota fiscal, boleto e cada canal da fila com a frase simples da situação, o motivo da falha e quando o HUB tenta de novo; **Reenviar** com motivo para quem opera, `JanelaReenviar`, 053), **Cancelar** (com motivo, `JanelaMotivo`) e **Gerar fatura agora** (um mês à mão, com motivo e vencimento) |
| `/contratos/nota-fiscal` | Contratos (gerir) | **Regras fiscais** (046/057, tela única pedida pelo Edvaldo em 04/11/2026), em três abas. **Tipos de serviço** (`RegrasServico`, `fis_regras_servico`): uma regra por serviço da LC 116 (código da NFS-e) com nome, texto padrão da nota, NBS, ISS, retenção do ISS (não retém, retém em municípios Cidade/UF, sempre) e IBS/CBS (cClassTrib, cIndOp; guardados, ainda não vão na nota); nova/editar e inativar com motivo; PDF e Excel. A nota usa o NBS da regra (vence o padrão) e, com ISS retido para o cliente, vira pendência (o HUB não emite com retenção: emita pelo Emissor Nacional); o contrato e o item mostram a regra do tipo escolhido (`ResumoRegra`) e o contrato puxa ISS e texto. **Notas enviadas**: a lista abaixo. **Emitente (MDC)**: ambiente (teste × produção, com confirmação para ir à produção), modo (conferir ou automático, este com confirmação ao ligar — 052), série e próximo número da DPS, regime do Simples, inscrição municipal, município (IBGE), NBS e % aproximado dos tributos do Simples; lista das notas enviadas pelo HUB com PDF e Excel (`TelaNotaFiscal`) |
| `/contratos/boleto` | Contratos (gerir) | **Boleto** (049): um cartão por banco (Itaú 341, Santander 033) com o código da conta no Ledgra Link, a conta do Financeiro onde o dinheiro cai, boleto com Pix ou simples e ligado/desligado; lista dos boletos emitidos com PDF e Excel (`TelaBoleto`) |
| `/contratos/envio` | Contratos (gerir) | **Envio (e-mail e WhatsApp)** (053): um cartão por canal (E-mail pelo Microsoft 365, WhatsApp pela API oficial da Meta) com Ligado/Não configurado, o que falta em palavras simples (os **nomes** dos segredos, nunca valores), por onde sai, quando foi conferido e a contagem da fila (na fila, falharam, aguardando, enviados); **Conferir agora** (a função confere os segredos e a conexão) e **Enviar teste** (até 5 por hora, PDF de exemplo marcado como cancelado); lista dos envios que falharam com o motivo e a próxima tentativa, PDF e Excel (`TelaEnvio`) |
| `/contratos/reajustes` | Contratos | Reajustes pendentes de confirmar (com a proposta do HUB) e o histórico de reajustes e mudanças de valor; indicadores (pendentes, feitos no ano, efeito no mês); PDF e Excel |

Janelas:

- **Novo/Editar contrato** (`ContratoFixo`), em etapas numeradas (04/11/2026): **1 quem e o quê**, **2 valor e contas
  do mês**, **3 vigência**, **4 reajuste**, **5 fatura e envio**. O **Cliente/Fornecedor** (`CampoPessoaContrato`) abre a
  lista ao clicar: carteira da MDC (contrato a receber) e Fornecedores e clientes, com busca por nome ou CNPJ, e
  **+ Cadastrar novo** com CPF/CNPJ buscado na Receita (`CampoCnpj`). Quem vem da carteira ou da Receita leva CNPJ,
  e-mail, telefone, cidade e UF (`pessoa_dados`): o banco cadastra a pessoa com eles e completa só o que estiver em
  branco numa que já existe (migração 055); da carteira, já marca o cliente do Portal e o e-mail/WhatsApp do envio.
  Também: tipo, nome, número, categoria com **+ Nova categoria** (`NovaCategoriaRapida`), objeto, vigência (início,
  fim ou prazo indeterminado, renovação automática, aviso X dias antes), valor mensal e dia de vencimento, "Lançar a conta
  no Financeiro todo mês" e a primeira conta, reajuste (índice, % fixo, mês) e "Mais informações" (centro de custo,
  banco previsto, observação). Uma frase mostra o que o HUB vai fazer: "Todo dia 1º o HUB lança … com vencimento em …".
  **Só no contrato a receber (043):** "Gerar todo dia" ao lado do "Vence todo dia" (avisa quando vence no mês seguinte) e a
  parte **Fatura e envio ao cliente** (`CamposFaturamento`): "O que enviar" em 4 cartões com ícones (Nota fiscal + fatura +
  boleto; Nota fiscal + fatura, boleto depois; Fatura + boleto; Só a fatura) — a escolha define o documento —, descrição do
  serviço, código (tributação nacional/LC 116) e ISS quando há nota, aviso do boleto "aguardando configuração" e "Por onde
  enviar" (E-mail, WhatsApp, Portal do Cliente) com o destino de cada um (o Portal pede o cliente da carteira).
- **Reajuste** (`JanelaReajuste`): mês de referência, índice e período do acumulado, valor atual → novo valor, % editável
  (fica gravado o proposto e o aplicado), opção de atualizar as contas do ciclo já lançadas e ainda em aberto, "Buscar
  índices agora" quando falta mês do índice.
- **Ficha** (`FichaContrato`): abas Dados, Contas lançadas (com situação de cada mês), Anexos (enviar PDF do contrato
  assinado e aditivos; abrir com link temporário) e Histórico.

Na lista e na ficha há o botão **Ver caminho**: contrato → conta de cada mês → recebimentos/pagamentos, com o que falta
e PDF ([Financeiro, seção 8](financeiro.md#8-ver-caminho-árvore-do-documento-03112026)).

Nas **Contas a pagar/receber** do Financeiro, as contas geradas por contrato levam o selo discreto **"Contrato fixo"**.
Elas são contas normais: pagar, receber, editar e cancelar continuam no Financeiro.

Nome escolhido: "Contratos" (módulo) e "Contrato fixo" (selo). "Fixo" diz ao leigo que se repete com o mesmo valor;
"contrato" combina com vigência, reajuste e encerramento; "recorrente" é jargão.

Código: `web/src/dominios/contratos/` (`regras.ts` com testes em `regras.test.ts`, `leituras.ts`, `repositorio.ts`,
`tipos.ts`, `componentes/`), páginas em `web/src/app/(hub)/contratos/`.

## 2. Regras

| Regra | Onde |
| --- | --- |
| A conta do mês nasce no dia de gerar (rotina 06h30). Rotina parada: recupera sozinha **até 12 meses** para trás, do mais antigo ao atual, **sem duplicar** (trava o contrato + índice único; mês com conta cancelada não volta) (048, B-06) | `app.fin_recorrentes_gerar`, `app.fin_recorrentes_rotina` |
| Ao cadastrar (ou reativar), a conta do mês atual sai na hora; meses anteriores ao cadastro não são lançados. "Primeira conta" é este mês ou um mês futuro | `fin_recorrente_salvar`, `fin_recorrente_reativar` |
| Vencimento = dia do contrato; quando o mês não tem o dia (31 em fevereiro), o último dia do mês | `app.fin_vencimento_no_mes`, `regras.vencimentoNoMes` |
| Sem renovação automática, as contas param no mês do fim da vigência e a rotina encerra o contrato no mês seguinte. Com renovação, a vigência ganha o prazo escolhido (1 a 60 meses, padrão 12), contado da data base: 29/02 volta a 29/02 no ano bissexto (048, B-12) | `fin_recorrentes.renovacao_meses`, `vigencia_fim_base`, rotina |
| Aviso no sino X dias antes do fim da vigência (uma vez por vigência). Reajuste pendente: avisa quando o índice do ciclo já saiu (IPCA sai por volta do dia 10) ou, sem ele, no dia 20 dizendo que falta; repete a cada 7 dias enquanto pendente. Vão para administradores e quem tem Contratos **operar ou gerir** com acesso válido (048, B-07) | rotina, `app.contratos_quem_avisar` |
| Falha na rotina (conta, fatura, renovação, encerramento, avisos): auditoria (`recorrente_falha`) **e** sino para administradores e quem gere Contratos (048, B-08) | rotina |
| **Mês cheio** (decisão do Edvaldo, 03/11/2026): contrato que começa ou termina no meio do mês cobra o valor mensal inteiro no primeiro e no último mês (sem proporcional) | `app.fin_recorrente_lancar_mes` |
| Suspenso não lança; ao reativar volta a lançar a partir do mês da reativação (meses suspensos não voltam). Encerrar não lança mais nada; a conta do mês já lançada fica | `fin_recorrente_suspender/reativar/encerrar` |
| Editar vale para as próximas contas; as já lançadas não mudam. Mudança de valor vai para o histórico (`origem = edicao`). Tipo (pagar/receber) e empresa não mudam | `fin_recorrente_salvar` |
| Reajuste pendente: o primeiro mês do reajuste com 12 meses de contrato, depois do mês em que o contrato entrou no HUB e **12 meses ou mais depois do último reajuste confirmado**. Trocar o mês do reajuste não reajusta duas vezes no ano (B-04); ciclo não confirmado continua pendente e, confirmado, vem o seguinte (B-05) (048) | `app.fin_reajuste_candidato`, `app.fin_reajuste_pendente` |
| Proposta: acumulado dos 12 meses anteriores ao mês do reajuste (reajuste em 03/2027 usa 03/2026–02/2027), produto de (1 + %/100) − 1; faltando mês, não propõe e diz quais faltam | `app.fin_indice_acumulado` |
| **Índice negativo mantém o valor** (decisão do Edvaldo): a proposta mostra o índice como veio e propõe 0%; confirmar com % negativo é recusado; % fixo negativo não é aceito (048) | `fin_recorrente_proposta`, `fin_recorrente_reajustar` |
| Confirmar: % de 0 a 100; contas já lançadas não mudam, salvo se marcar para atualizar: muda só conta do ciclo em aberto, sem pagamento, **ainda com o valor antigo** (ajuste manual fica) e sem nota fiscal emitida ou boleto gerado; a fatura acompanha; a diferença dos meses já pagos aparece no histórico (não é lançada) (048, B-09) | `fin_recorrente_reajustar`, `app.fin_reajuste_contas` |
| Nada se apaga: contratos, histórico, reajustes e índices sem DELETE (grant e gatilho `nada_se_apaga`) | 041 |
| Contrato a receber gera no **dia de gerar** (1–28); a pagar, no dia 1. **Vence no mesmo mês da geração** (decisão do Edvaldo, 048; a 045 levava para o mês seguinte). Por isso o dia de gerar não pode passar do dia de vencer (o banco recusa; a tela avisa na hora: a fatura nasceria vencida). Ao cadastrar, a conta do mês sai na hora só se o dia de gerar deste mês já chegou | `app.fin_recorrente_data_geracao`, `app.fin_recorrente_vencimento`, `faturamento.ts` |
| Contrato **a pagar** que lança contas: criar, editar, reativar, gerar à mão ou atualizar contas no reajuste exige também o **Financeiro (operar)**. Só Contratos: contrato a receber ou que só guarda o documento (048, BD-03) | `app.contratos_lanca_pode` |
| Cada conta a receber do contrato tem uma **fatura** com número `AAAA/NNNNN` (ano da emissão) sem repetir nem pular, mesmo ao mesmo tempo (trava consultiva por organização e ano); recomeça em 00001 no ano novo (provado no teste 106). A conta leva "Fatura AAAA/NNNNN" no documento | `app.fin_recorrente_lancar_mes` |
| **Boleto** (049): com boleto no envio, o contrato escolhe o banco (Itaú ou Santander). Em Faturas, o botão do banco gera o boleto pelo Ledgra Link (com o login de quem pede, Contratos operar) e mostra a linha digitável e o Pix. Pago = baixa automática da conta a receber na conta do Financeiro do banco; pago a menos não baixa sozinho; recusado/baixado/cancelado libera outro boleto (tentativa 2, 3…). No "Nota fiscal + fatura" o boleto vai num envio próprio; com boleto no conteúdo o Portal só publica quando o boleto existe. Fatura com boleto registrado não cancela | `fatura_boleto_preparar`, `fatura_boleto_registrar`, `link_aplicar_evento`, Contratos › Boleto |
| Fila de envio: um item por canal marcado, com o que vai (nota, fatura, boleto). E-mail e WhatsApp nascem "aguardando configuração" e passam sozinhos para "na fila" quando o canal é ligado (053; desligou, voltam a aguardar); saem pela Função `fatura-enviar` quando a NFS-e foi emitida (se o envio leva a nota) e o boleto foi gerado (se leva o boleto). Falha: tenta de novo em 10 min, 30 min, 2 h, 6 h e 24 h; erro definitivo (endereço/número que não existe) ou 6 falhas param e esperam o **Reenviar** (Contratos operar, motivo com 5 letras); na 3ª falha avisa no sino quem opera/gere Contratos. Portal "enviado" na hora se não há nota fiscal, ou quando a nota for emitida (etapa 2). Situação da fatura: gerada (sem canal), aguardando nota fiscal, pronta, enviada, cancelada | `fin_envios`, `app.fin_fatura_processar`, `app.fin_fatura_situacao` |
| Cancelar fatura: com motivo; cancela junto a conta do mês em aberto e sem recebimento; recusa fatura já recebida ou com nota emitida. A rotina não gera de novo o mês cancelado | `fin_fatura_cancelar` |
| Gerar fatura agora: um mês do início do contrato até o mês atual, com motivo e vencimento opcional; não deixa duplicar (só se o mês não tem conta ativa). Serve para mês perdido (B-06), adiantar o deste mês ou refazer depois de cancelar | `fin_fatura_gerar_agora` |
| Rotina e geração só olham a empresa da gestão; erro num contrato (renovar, gerar, encerrar) ou nos avisos vai para a auditoria (`recorrente_falha`) e a rotina segue (`falhas` no retorno) (BD-02) | `app.fin_recorrentes_rotina`, `app.fin_recorrentes_gerar` |

## 3. Banco (migração 041)

Tabelas (prefixo `fin_` porque cada contrato alimenta `fin_titulos`): `fin_recorrentes` (o contrato),
`fin_recorrente_reajustes` (reajustes e mudanças de valor), `fin_recorrente_eventos` (histórico legível), `fin_indices`
(série mensal dos índices), `app.fin_indices_pedidos` (pedidos ao Banco Central). `fin_titulos` ganhou `recorrente_id` e
`competencia`. Leitura com `app.contratos_pode(cliente, 'ver')`; gravação só pelas funções (`app.contratos_pode(cliente,
'operar')` = `app.hub_pode(org, 'contratos', …)`). O Portal não vê contratos. `contratos` entrou em `app.modulos_gestao()`
(depois a 042 tirou), mas **não** em `app.modulos_operar()`. Desde a 047 os cadastros (fornecedores/clientes,
categorias, centros e bancos) chegam pela função `fin_recorrente_opcoes`, só com nome, tipo e ativo; o PDF da fatura usa
os dados do cliente (nome, CNPJ/CPF, e-mail, cidade/UF) só de quem já tem fatura (SEG-03).

Funções da tela: `fin_recorrente_salvar`, `fin_recorrente_suspender`, `fin_recorrente_reativar`, `fin_recorrente_encerrar`,
`fin_recorrente_proposta`, `fin_recorrente_reajustar`, `fin_recorrente_anexo`, `fin_indices_atualizar`.

### Busca dos índices no Banco Central

Pelo próprio banco, com `pg_net` (já usada pelas rotinas do SharePoint e das notas), sem Função Edge:

1. pg_cron `fin-indices-buscar` (06h20 de Brasília) → `app.fin_indices_pedir()`: um `net.http_get` por índice para a API SGS
   (`https://api.bcb.gov.br/dados/serie/bcdata.sgs.{433|188|189}/dados?formato=json&dataInicial=…&dataFinal=…`, últimos 24
   meses); o id de cada pedido vai para `app.fin_indices_pedidos`.
2. A resposta chega sozinha em `net._http_response`. `app.fin_indices_ler()` lê o que chegou, grava em `fin_indices` por
   `app.fin_indices_gravar` (formato `[{"data":"01/10/2026","valor":"0.56"}]`; mês revisado pelo BC é atualizado) e marca o
   pedido (ok, erro ou "sem resposta" depois de 1 hora). Roda na rotina das 06h30, ao abrir a proposta e no botão
   "Buscar índices agora" (`fin_indices_atualizar`, no máximo um pedido a cada 10 minutos).
3. Sem `pg_net`, nada quebra: a busca só não acontece e a pessoa pode digitar o percentual na confirmação.

### Faturamento (migração 043)

`fin_recorrentes` ganhou `documento`, `envio`, `dia_geracao`, `canais`, `email_envio`, `whatsapp_envio` (só dígitos),
`cliente_carteira_id`, `servico_descricao`, `servico_codigo`, `iss_aliquota` (travas de coerência; contrato a pagar fica
com os padrões). Tabelas `fin_faturas` (número, competência, emissão, vencimento, valor, documento, envio, situação, NFS-e,
boleto, origem rotina/manual, cancelamento) e `fin_envios` (canal, destino, conteúdo, situação, tentativas, erro, enviado
em). Leitura com `app.contratos_pode(cliente, 'ver')`; gravação só pelas funções; `nada_se_apaga`, `gestao_so_empresa`,
`cliente_mesma_org` e `fatura_fixa` (número, contrato, conta e mês não mudam). O índice único das contas do contrato passou
a valer só entre as não canceladas (`fin_titulos_recorrente_mes_ativa`). Portal: `portal_minhas_faturas(cliente)` com a
permissão `documentos`. A 043 também corrige a captura de notas (`fis_captura_reservar` só a empresa da gestão, BD-01).

### Regras e boleto (migrações 048 e 049, 03/11/2026)

048: `fin_recorrentes` ganhou `renovacao_meses`, `vigencia_fim_base`, `reajuste_avisado_em` e `boleto_banco`; funções
`app.fin_reajuste_candidato`, `app.fin_reajuste_contas`, `app.contratos_lanca_pode`, `app.contratos_quem_avisar` e nova versão
de `fin_recorrente_salvar`, `fin_recorrente_reativar`, `fin_fatura_gerar_agora`, `fin_recorrente_proposta`,
`fin_recorrente_reajustar`, `app.fin_recorrente_vencimento` e da rotina. Testes 105/106.

049: tabelas `link_contas_banco` (conta da MDC no Ledgra Link por banco + conta do Financeiro da baixa) e
`fin_fatura_boletos` (cada boleto da fatura, nada se apaga); `fin_envios.etapa` (principal | boleto). Funções
`link_salvar_banco` (Contratos gerir), `fatura_boleto_preparar` (Contratos operar, chamada pela Função Edge com o login de
quem pede), `fatura_boleto_registrar` (só service_role) e nova `link_aplicar_evento` (mensalidade ou boleto de fatura).
Gatilhos `fatura_boleto_fixo` e `fatura_boleto_valendo`. Função Edge `ledgra-link` ganhou `acao: "emitir_fatura"`.
Testes 107/108.

### Envio automático por e-mail e WhatsApp (migração 053, 04/11/2026)

Decisão do Edvaldo: e-mail pelo **Microsoft 365** (Microsoft Graph, `sendMail` como `hub@mdcassessoria.com`, aplicativo no
Azure com `Mail.Send` só nessa caixa pelo RBAC para Aplicativos) e WhatsApp pela **API oficial da Meta** (modelo
`fatura_mdc` aprovado, com o PDF da fatura no cabeçalho). Passo a passo e segredos: docs/07, seção 7.7.

- `fin_envios` ganhou `proxima_tentativa_em`, `falhas`, `mensagem_id`, `em_envio_ate` (reserva de 5 min) e `reenvios`;
  tabela `fin_envio_canais` (estado de cada canal informado pela função; fechada para a equipe, lida por função); gatilho
  `fin_envio_canal` (envio novo já nasce "na fila" com o canal ligado).
- Só o servidor (service_role): `fin_envio_token_confere` (token do agendador no Vault, `fatura_enviar_token`, comparação
  pelo resumo SHA-256), `fin_envio_canal_estado`, `fin_envio_reservar` (só fatura pronta da empresa da gestão, `skip
  locked`) e `fin_envio_resultado` (enviado / espera crescente / definitivo; aviso no sino na 3ª falha; evento no histórico
  do contrato; auditoria `envio_enviado`/`envio_falhou`).
- Telas: `fin_envio_situacao(org)` (Contratos ver), `fin_envio_reenviar(envio, motivo)` (Contratos operar) e
  `fin_envio_teste_registrar(org, canal, destino)` (Contratos gerir, 5 por hora, auditoria `envio_teste`).
- `pg_cron` `fatura-enviar` a cada 10 min, só quando há envio a fazer ou canal sem conferência na última hora.
- Função Edge `fatura-enviar` (`verify_jwt = false`): o PDF da fatura sai no servidor com a cópia do núcleo da tela
  (`scripts/nucleo_fatura.py`); o e-mail leva o PDF, o XML da NFS-e (bucket `fiscal`, pasta da própria organização), a
  linha digitável e o Pix; o WhatsApp sobe o PDF e manda o modelo com 5 campos (nome, número, valor, vencimento, como
  pagar). Testes 113/114 (SQL) e `envio_test.ts` (Deno, sem rede).

### Receita por sistema (migração 059, 05/11/2026)

Ver a seção 7.

## 4. Pendências

- Contrato com valor variável (ex.: honorário por faixa de faturamento) e contrato sem valor mensal: hoje todo contrato
  tem valor mensal (pode não lançar contas).
- Reajuste negativo: a regra é única (mantém o valor). Se algum contrato precisar reduzir, falta um campo por contrato.
- Regenerar `web/src/lib/database.types.ts` do banco depois de aplicar a 041 e a 043 (os tipos novos foram escritos à mão).
- Faturamento: envio de e-mail e WhatsApp pronto na 053 (seção 6); falta a TI ligar os canais (docs/07, seção 7.7) e,
  depois, receber os avisos de entrega do WhatsApp (webhook da Meta) para separar "aceito" de "entregue". **Portal › Faturas da MDC (050):** o cliente vê as faturas
  publicadas para ele (`portal_faturas_detalhe`, permissão `documentos`), baixa o PDF da fatura, vê a NFS-e emitida em
  produção (espelho e XML: política `fis_storage_portal_nfse` do bucket fiscal, só o XML da nota de fatura publicada para
  o próprio cliente; nota de teste nunca aparece) e copia a linha digitável e o Pix do boleto. Boleto (049): do lado do Ledgra Link, a MDC
  precisa estar cadastrada como titular com as contas Itaú (341) e Santander (033) e as credenciais de cobrança de cada
  banco; o código de cada conta vai em Contratos › Boleto. Confirmar no Ledgra Link (`GET /v1/bancos`) que os dois bancos
  estão ativos para cobrança. A NFS-e já sai (046, seção 5), também no modo automático (052, seção 6); falta o
  cancelamento da nota pelo HUB, NBS por contrato e ISS retido pelo tomador.
- Cancelar a conta do contrato direto no Financeiro não cancela a fatura (use Contratos › Faturas).

## 5. Nota fiscal de serviço pelo Emissor Nacional (migração 046, 03/11/2026)

**Tela.** Em Contratos › Faturas, fatura com NFS-e e ainda sem nota tem o botão **Emitir nota** (Contratos: operar). A
janela `JanelaEmitirNfse` chama `nfse_preparar` e mostra: a faixa do **ambiente** ("Ambiente de teste (sem valor fiscal)"
em âmbar; "Produção (nota com valor fiscal)"), quem emite (MDC, CNPJ, IM, regime do Simples), o cliente (CNPJ/CPF e e-mail),
a descrição do serviço (descrição da fatura + número + vencimento), o código de tributação nacional e o NBS, o valor e a
competência, o ISS ("Recolhido no DAS do Simples… a alíquota não vai destacada na nota", com a referência do contrato), o %
dos tributos e o número da DPS, o que falta ajustar e as tentativas anteriores com o motivo de cada recusa ("Ver detalhes"
mostra código e texto oficiais). O resultado aparece na janela. A lista mostra a situação da nota em linguagem simples
(`nfse.ts › situacaoDaNota`: "NFS-e pronta para emitir", "Nota fiscal recusada" + motivo, "Sem resposta certa do Emissor",
"Nota de teste nº X emitida", "Nota fiscal nº X emitida") e **Ver a nota** abre o espelho DANFSe de Entradas
(`EspelhoNota`). Avisos fixos: emissão não configurada e ambiente de teste.

**Regras.**

| Regra | Onde |
| --- | --- |
| Ambiente padrão = produção restrita (teste). Nota de teste fica registrada, mas **não muda a fatura** (não marca emitida, não publica no Portal); a de verdade sai depois em produção. Ir para produção exige "Confirmo que as notas de teste deram certo" | `nfse_parametros`, `nfse_parametros_salvar`, `app.nfse_registrar_resultado` |
| Pendências (em português) bloqueiam a emissão: parâmetros, opção ME/EPP, NBS, % do Simples, CNPJ da MDC, certificado A1 válido e do mesmo CNPJ raiz, código do serviço com 6 números, CNPJ/CPF do cliente, fatura cancelada ou já com nota | `app.nfse_dados` |
| nDPS reservado com trava da fatura e da numeração (por empresa, ambiente e série); nunca repete, nem abaixo de um já usado | `app.nfse_reservar`, `nfse_numeracao` |
| Id da DPS = "DPS" + município (7) + 2 (CNPJ) + CNPJ (14) + série (5) + nDPS (15) | `app.nfse_reservar`, `dps.ts › idDps` |
| Recusa do Emissor (4xx) = `rejeitada`: nada foi criado; a próxima tentativa usa outro nDPS. Sem resposta certa (rede, 5xx) = `erro`: a próxima tentativa **confere no Emissor** (`GET /dps/{Id}`) e só reenvia a mesma DPS se a nota não saiu | `_fiscal/emissao.ts`, `app.nfse_reservar` |
| Emitida em produção → `fin_faturas.nfse_situacao = 'emitida'`, `nfse_numero`, `app.fin_fatura_processar` (libera o Portal); recusa/erro → `nfse_situacao = 'erro'` (fatura segue "aguardando nota fiscal") | `app.nfse_registrar_resultado` |
| Não cancela a fatura com nota sendo enviada ou com resultado incerto em produção; com nota emitida já não cancelava (045) | gatilho `fatura_nfse_aberta` |
| Simples ME/EPP: opSimpNac 3, regApTribSN obrigatório, regime especial 0 com ISS pelo Simples, ISS tributável e não retido **sem alíquota** (E0625/E0631), totTrib = pTotTribSN (E0712). Série de 1 a 49999 (E0010) | `dps.ts`, `nfse_parametros_salvar` |
| Nada se apaga; leitura com Contratos (ver); gravação só pelas funções; empresa da gestão | 046 |

**Banco.** `nfse_parametros`, `nfse_numeracao`, `nfse_emissoes`; funções `nfse_preparar` (ver), `nfse_parametros_salvar`
(gerir), `nfse_reservar` e `nfse_registrar_resultado` (só `service_role`, portas para `app.nfse_reservar` e
`app.nfse_registrar_resultado`). XML da DPS e da NFS-e no bucket `fiscal` em `<org>/<cliente>/nfse-emitidas/AAAA/MM/`
(`<chave>.xml` e `dps/<Id>-<tentativa>.xml`); quem vê Contratos lê essa pasta (`app.fis_caminho_pode`).

**Código.** Núcleo puro `web/src/dominios/notas/dps.ts` (copiado para `_fiscal/nucleo/`, testes `dps.test.ts`), envio em
`supabase/functions/_fiscal/emissao.ts` (teste `nfse_test.ts`: assinatura no `xmlsec1` e DPS validada no XSD oficial 1.01
com `xmllint`; esquemas em `supabase/testes/esquemas/nfse-1.01/`), Função Edge `nfse-emitir`, tela em
`dominios/contratos/` (`nfse.ts`, `componentes/JanelaEmitirNfse.tsx`, `componentes/TelaNotaFiscal.tsx`).

**Fontes.** Esquemas DPS 1.01 (Anexo I do leiaute, gov.br/nfse, cópia do projeto aberto Rainzart/nfse-nacional);
[Manual dos Contribuintes – Emissor Público API v1.2](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/manual-contribuintes-emissor-publico-api-sistema-nacional-nfs-e-v1-2-out2025.pdf/@@download/file)
(POST /nfse, GET /dps/{id}, GET /nfse/{chave}); regras E0625/E0712/E0010 (Anexo I, resumidas em buscadorncm.com.br e no
fórum Contábeis); [Resolução CGSN 191/2026](https://economia.df.gov.br/documents/d/seec/resol-cgsn-n-191-2026-pdf).

**A confirmar no primeiro teste em produção restrita:** assinatura RSA-SHA1 aceita (projetos abertos usam SHA-1; se vier
E0714, trocar para SHA-256 em `assinatura.ts`); série e nDPS sem zeros à esquerda no XML; tipo de inscrição 2 = CNPJ no Id;
prestador sem nome/endereço (o Emissor busca no cadastro); se a IM é aceita/exigida em Bragança Paulista; dCompet = 1º dia do
mês da fatura; formato exato da resposta (201 com `chaveAcesso` e `nfseXmlGZipB64`; erros em `erros`/`erro`).

**Limites desta etapa.** Modo automático: ver seção 6 (052); NBS único (parâmetro) para todos os
contratos; sem ISS retido pelo tomador; cancelar ou substituir a nota é no Emissor Nacional; IBS/CBS (grupo IBSCBS) só a
partir de 2027.

**Primeiro teste (produção restrita, sem valor fiscal).**

1. Quem integra aplica a `046_nfse_emissao.sql`, regenera `web/src/lib/database.types.ts`, roda os Advisors e publica
   `nfse-emitir` (docs/07, 7.4); depois o push do site.
2. Edvaldo confere em Entradas › Certificado digital que o A1 da MDC está válido (o mesmo da captura).
3. Em Contratos › Nota fiscal (NFS-e), com **Ambiente de teste** marcado: inscrição municipal (se houver), município 3507605,
   NBS do serviço contábil, % de tributos do Simples (alíquota efetiva do DAS) e série (1). Salvar.
4. Num contrato a receber de teste (cliente com CNPJ cadastrado), código do serviço com 6 números (ex.: 17.19.01) e
   "Nota fiscal + fatura"; gerar a fatura (Gerar fatura agora).
5. Faturas › **Emitir nota** → conferir a faixa "Ambiente de teste (sem valor fiscal)" e os dados → **Emitir nota de teste**.
6. Emitida: abrir **Ver a nota** e conferir no Emissor Nacional (produção restrita). Recusada: o motivo aparece em português
   (código em "Ver detalhes"); corrigir o parâmetro e emitir de novo (nova DPS).
7. Repetir até sair sem recusa; só então marcar **Produção** com a confirmação.

## 6. Emissão automática da NFS-e (migração 052, 04/11/2026)

**Como funciona (para quem usa).** Em Contratos › Nota fiscal, o modo **Automático** faz o HUB emitir sozinho, todo dia
às 06h45 (Brasília), a nota das faturas que nasceram, sem ninguém conferir antes. Para ligar, quem gere marca a caixa
"Entendi: a nota vai sair sem ninguém conferir" (no ambiente de produção o texto lembra que a nota tem valor fiscal); sem
a marca o banco recusa. Se faltar dado ou o Emissor recusar, chega um aviso no sino de quem gere Contratos (e dos
administradores) e a nota fica para emitir pela tela, como no modo conferir.

**Regras.**
- Entra na rodada a fatura da empresa da Gestão com documento `nfse`, não cancelada, NFS-e "a emitir" ou "erro", com
  emissão até hoje, no ambiente configurado (teste ou produção; nunca troca de ambiente sozinho).
- **Uma tentativa por fatura por dia** (`nfse_auto_tentativas`, chave fatura + dia): se der erro, tenta de novo no dia
  seguinte; nota rejeitada pelo Emissor ou já emitida naquele ambiente não volta para a rodada.
- A trava contra nota repetida continua a da 046 (`nfse_reservar`): a rodada e a tela usam o mesmo caminho
  (`_fiscal/emitirFatura.ts`), então nunca saem duas DPS da mesma fatura ao mesmo tempo.
- Quem recebe o aviso: administradores e quem tem Contratos no nível gerir (acesso válido). Título "Contratos: nota
  fiscal automática não saiu", com o motivo e o link para Contratos › Faturas.

**Como a rodada é chamada.** O pg_cron (`nfse-automatica`, `45 9 * * *` UTC) chama a Função Edge `nfse-automatica`
com o cabeçalho `x-agente-token`, lido do Vault (`nfse_automatica_token`, gerado pela própria migração, nunca digitado).
A função confere o token no banco (`nfse_token_confere`), pede a lista (`nfse_auto_pendentes`), emite cada fatura e
grava o resultado (`nfse_auto_registrar`). As três funções são só da chave de serviço; a tela só lê as tentativas
(Contratos ver). O agendador só chama a função se algum parâmetro estiver em automático.

Testes: `supabase/testes/111_base_052.sql` e `112_ajustes_052.sql` (token, lista, uma vez por dia, aviso no sino,
confirmação ao ligar, nada se apaga).


## 7. Receita por sistema (migração 059, 05/11/2026)

**Para quê.** Cada sistema ou módulo que a MDC licencia (Ledgra, EXato…) é cadastrado uma vez; cada licença vendida é um
**contrato a receber** que aponta o sistema no campo **Sistema vendido** (opcional; honorários e outros serviços ficam
sem). A aba **Contratos › Receita por sistema** soma tudo por sistema, no mês escolhido.

**Tela (`TelaSistemas.tsx`, `JanelaSistema.tsx`, `CampoSistemaContrato.tsx`).**

- Indicadores: receita mensal contratada (com o número de licenças ativas), recebido no mês (de quanto foi faturado),
  em atraso e **previsto nos próximos 12 meses**.
- Tabela por sistema: licenças ativas (com novas e encerradas nos últimos 12 meses), receita mensal e % da receita,
  recebido/faturado no mês, em atraso, previsto e barrinhas do faturado dos 12 meses. "Sem sistema" aparece quando há
  contrato a receber sem sistema. PDF e Excel trazem também os 12 meses em colunas e a linha de total.
- Quem **gere** Contratos cadastra (botão "Novo sistema", sugestões de um clique na tela vazia), edita e
  inativa/reativa (com confirmação). Inativo some da lista do contrato novo, mas o contrato que já usa continua igual.
- No contrato a receber, "Sistema vendido" com "+ Novo sistema" sem sair da janela; a lista e a ficha mostram o sistema.

**Regras (banco).**

- `fin_sistemas` (nome único por empresa, sem diferenciar maiúsculas/espaços); grava só `fin_sistema_salvar`
  (Contratos: gerir); nada se apaga (gatilho `nada_se_apaga`: inative).
- `fin_recorrentes.sistema_id`: só contrato a receber (no a pagar é ignorado); sistema de outra empresa ou inativo é
  recusado; editar sem mandar o sistema mantém o que estava.
- `fin_receita_sistemas(cliente, mês)` (Contratos: ver): faturado e recebido pela **competência** das contas do
  contrato (canceladas não contam); em atraso = saldo das contas em aberto vencidas até hoje; novos = início da vigência
  nos 12 meses até o mês; encerrados = encerrados nesses 12 meses; **previsto** = valor atual de cada contrato ativo que
  lança contas × meses dos 12 seguintes dentro da vigência (a partir da primeira conta; reajustes futuros não entram).

**Menu enxuto (mesma migração).** Estoque, Entradas e Saídas ficam com status `desligado` em `hub_apps`: somem do menu
(`hub_meus_apps`, 015) e a Guarda barra as rotas; nada foi apagado e as regras do banco não mudam (para religar, volte
o status para `ativo`). O certificado A1 da NFS-e passou para **Financeiro › Certificado digital** (mesma tela).

**Cobrança Ledgra e menu (060, 05/11/2026).** A Cobrança Ledgra também foi desligada (o Ledgra cobra os próprios
clientes; as licenças vendidas ficam aqui). O grupo Gestão do menu ficou em dois blocos: Financeiro, Contratos e
Relatórios; depois Fornecedores e clientes, Centros de custo e Plano de contas (`hub_apps.ordem` + `MenuLateral`).

## 8. NBS e tributos aproximados conforme a legislação (migração 062, 05/11/2026)

**NBS filtrado pela tabela oficial.** O campo NBS (Regras fiscais › Emitente e cada tipo de serviço) mostra só os
códigos que o **Anexo VIII da NFS-e Nacional** (correlação item da LC 116 × NBS × atividade do Simples) permite para o
serviço escolhido; NBS fora da tabela aparece em vermelho (o Emissor pode recusar a nota). Se a tabela não traz o
serviço, volta a busca na lista completa, com aviso. Componentes: `CampoNbsLegal.tsx`, `NbsETributosSimples.tsx`.

**Atualização automática.** A Função Edge `fiscal-tabelas` roda toda segunda às 07h10 (pg_cron, token interno do
Vault, como a `nfse-automatica`): abre a página da documentação técnica (RTC) no portal da NFS-e, acha a planilha do
Anexo VIII de versão mais alta e, se for mais nova que a carregada, baixa, lê (`_fiscal/anexoViii.ts`) e troca a tabela
de uma vez (`fis_tabela_carregar`, que recusa versão igual/menor e planilha com menos de 500 linhas) e avisa os
administradores no sino. A 1ª carga é feita logo depois de publicada; se o portal não responder nessa hora, usa uma
cópia pública da planilha oficial v1.02.00. Tabelas `fis_lc116_nbs` e `fis_tabelas` (leitura para quem tem login;
gravação só pela Função, com a chave de serviço).

**Tributos aproximados do Simples (pTotTribSN).** A Lei 12.741/2012 (art. 1º, §6º) deixa o optante do Simples informar
a alíquota a que está sujeito. O HUB calcula a **alíquota efetiva** da LC 123, art. 18, §1º-A: (RBT12 × alíquota
nominal − parcela a deduzir) ÷ RBT12, com o anexo pela atividade do Anexo VIII (III, IV ou Fator R com a folha dos 12
meses: 28% ou mais = Anexo III) e a faixa pelo RBT12; escritório contábil com ISS fixo (art. 18, §22-A) tira a parte do
ISS da repartição do Anexo III. O botão "Usar X%" preenche o campo; a pessoa salva. Regra em `lib/fiscal/simples.ts`
(com testes).
