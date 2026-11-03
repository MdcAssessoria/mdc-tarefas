# Módulo Contratos

> **Resumo:** contratos fixos da gestão da própria MDC (decisão do Edvaldo, 02/11/2026): **a receber** (honorários
> mensais dos clientes da MDC) e **a pagar** (aluguel, sistemas, serviços). O módulo guarda o contrato em si (partes,
> número, objeto, vigência, renovação, anexos e histórico), lança a conta de cada mês no **Financeiro** no dia 1 e, uma
> vez por ano, **propõe o reajuste** pelo índice acumulado de 12 meses do Banco Central (IPCA, IGP-M, INPC) ou por % fixo;
> a pessoa confere e confirma. Migração `041_contratos_recorrentes.sql`; testes em `supabase/testes/95_base_041.sql` e
> `96_recorrentes_041.sql`.

## 1. Telas

Módulo próprio no grupo **Gestão** do menu lateral (ferramenta `contratos` em `hub_apps`, acesso ver/operar/gerir
liberado pelo administrador por pessoa).

| Endereço | Quem usa | O que faz |
| --- | --- | --- |
| `/contratos` | Contratos (ver; cadastrar e mexer com operar) | Lista no molde 8.3.1 (só os contratos da MDC): tipo (a receber/a pagar), situação e busca; indicadores que filtram (recebe por mês, paga por mês, reajustes pendentes, vigência terminando em 30 dias); quadro que vira cartão no celular; saldo mensal dos ativos; PDF e Excel. Ações: **Novo contrato**, **Reajustar** (quando pendente), ficha, editar, suspender/reativar e encerrar (com motivo, `JanelaMotivo`) |
| `/contratos/reajustes` | Contratos | Reajustes pendentes de confirmar (com a proposta do HUB) e o histórico de reajustes e mudanças de valor; indicadores (pendentes, feitos no ano, efeito no mês); PDF e Excel |

Janelas:

- **Novo/Editar contrato** (`ContratoFixo`): tipo, nome, número, cliente/fornecedor (digitado na hora é cadastrado
  junto, como no lançamento normal), categoria com **+ Nova categoria** (`NovaCategoriaRapida`), objeto, vigência (início,
  fim ou prazo indeterminado, renovação automática, aviso X dias antes), valor mensal e dia de vencimento, "Lançar a conta
  no Financeiro todo mês" e a primeira conta, reajuste (índice, % fixo, mês) e "Mais informações" (centro de custo,
  banco previsto, observação). Uma frase mostra o que o HUB vai fazer: "Todo dia 1º o HUB lança … com vencimento em …".
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
| A conta do mês nasce no dia 1 (rotina 06h30); se a rotina falhar, o dia seguinte recupera — gera o mês atual e o anterior, **sem duplicar** (trava o contrato + índice único `fin_titulos (recorrente_id, competencia)`, inclusive conta cancelada) | `app.fin_recorrentes_gerar`, `app.fin_recorrentes_rotina` |
| Ao cadastrar (ou reativar), a conta do mês atual sai na hora; meses anteriores ao cadastro não são lançados. "Primeira conta" é este mês ou um mês futuro | `fin_recorrente_salvar`, `fin_recorrente_reativar` |
| Vencimento = dia do contrato; quando o mês não tem o dia (31 em fevereiro), o último dia do mês | `app.fin_vencimento_no_mes`, `regras.vencimentoNoMes` |
| Sem renovação automática, as contas param no mês do fim da vigência e a rotina encerra o contrato no mês seguinte. Com renovação, a vigência ganha mais 12 meses (histórico) | `fin_recorrentes.fim`, rotina |
| Aviso no sino X dias antes do fim da vigência (uma vez por vigência) e no mês do reajuste (uma vez por ciclo): administradores e quem tem Contratos **gerir** | rotina |
| Suspenso não lança; ao reativar volta a lançar a partir do mês da reativação (meses suspensos não voltam). Encerrar não lança mais nada; a conta do mês já lançada fica | `fin_recorrente_suspender/reativar/encerrar` |
| Editar vale para as próximas contas; as já lançadas não mudam. Mudança de valor vai para o histórico (`origem = edicao`). Tipo (pagar/receber) e empresa não mudam | `fin_recorrente_salvar` |
| Reajuste pendente: o último mês do reajuste que já chegou, com 12 meses de contrato até lá, **depois do mês em que o contrato entrou no HUB** (o valor informado no cadastro já é o do ciclo) e sem reajuste confirmado nesse ciclo | `app.fin_reajuste_pendente`, `regras.reajustePendente` |
| Proposta: acumulado dos 12 meses anteriores ao mês do reajuste (reajuste em 03/2027 usa 03/2026–02/2027), produto de (1 + %/100) − 1; faltando mês, não propõe e diz quais faltam | `app.fin_indice_acumulado` |
| Confirmar: % de −50 a 100; contas já lançadas não mudam, salvo se a pessoa marcar para atualizar as do ciclo em aberto e sem pagamento | `fin_recorrente_reajustar` |
| Nada se apaga: contratos, histórico, reajustes e índices sem DELETE (grant e gatilho `nada_se_apaga`) | 041 |

## 3. Banco (migração 041)

Tabelas (prefixo `fin_` porque cada contrato alimenta `fin_titulos`): `fin_recorrentes` (o contrato),
`fin_recorrente_reajustes` (reajustes e mudanças de valor), `fin_recorrente_eventos` (histórico legível), `fin_indices`
(série mensal dos índices), `app.fin_indices_pedidos` (pedidos ao Banco Central). `fin_titulos` ganhou `recorrente_id` e
`competencia`. Leitura com `app.contratos_pode(cliente, 'ver')`; gravação só pelas funções (`app.contratos_pode(cliente,
'operar')` = `app.hub_pode(org, 'contratos', …)`). O Portal não vê contratos. `contratos` entrou em `app.modulos_gestao()`
(o módulo lê fornecedores/clientes, categorias, centros e bancos para o cadastro), mas **não** em `app.modulos_operar()`.

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

## 4. Pendências

- Contrato com valor variável (ex.: honorário por faixa de faturamento) e contrato sem valor mensal: hoje todo contrato
  tem valor mensal (pode não lançar contas).
- Reajuste de ciclo perdido (mais de um ano sem confirmar): só o ciclo mais recente fica pendente.
- Regenerar `web/src/lib/database.types.ts` do banco depois de aplicar a 041 (os tipos novos foram escritos à mão).
