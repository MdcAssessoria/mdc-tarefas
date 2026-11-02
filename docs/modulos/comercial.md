# Módulo Comercial (CRM)

> **Resumo:** funil de vendas da MDC: cada empresa interessada (cadastrada à mão ou vinda sozinha do Simulador de
> Regime) passa pelas etapas Novo lead → Em contato → Reunião → Proposta → Negociação → Ganho/Perdido. Na ficha de cada
> oportunidade ficam os dados, o histórico de conversas e o contrato, montado a partir do modelo-base da MDC. Ao fechar,
> a empresa vira cliente da carteira (`crm_converter_cliente`). Telas no molde 8.3.1 desde 02/11/2026.

## 1. Telas (ferramenta `comercial`)

| Endereço | Nível | O que faz |
| --- | --- | --- |
| `/comercial` | ver (mover, arquivar, cadastrar: operar) | Funil. Filtros: busca, "Entrou no funil" (período), situação (em andamento, ganhas, perdidas, todas); em "Mais filtros" responsável, origem e "só retornos atrasados". Indicadores: em andamento (com valor em negociação), retornos atrasados, viraram cliente (conversão e média) e perdidas — os três últimos filtram ao clicar. Três vistas em abas: **Quadro por etapa** (no computador colunas com arrastar e soltar e o menu "⋯" do cartão com "Mover para…"; no celular um seletor de etapa com a quantidade e os cartões daquela etapa empilhados, cada um com "Mover para"), **Lista** e **Arquivadas** ("Voltar ao funil"). "Limpar funil" arquiva de uma vez perdidas e paradas há X dias. PDF e Excel do que está filtrado |
| `/comercial/leads` | ver (arquivar/voltar em lote: operar) | Leads (padrão: só os do Simulador). Filtros: busca, "Recebido" (período), como chegou; em "Mais filtros" etapa e "Mostrar" (no funil, arquivados, todos). Indicadores que filtram: ainda não contatados, em andamento, viraram cliente; e a economia estimada somada. Seleção em lote para arquivar ou devolver ao funil. PDF e Excel |
| `/comercial/[id]` | ver (editar: operar) | Ficha: contato (WhatsApp, e-mail), arquivar, "Fechou: virar cliente", etapas clicáveis e duas abas — **Acompanhamento** (histórico e próximos passos; dados da empresa, contato e negociação; respostas do Simulador) e **Proposta e contrato** (valores negociados, prévia, PDF, enviado, assinado, renegociar, versões anteriores). No celular o histórico vem antes dos dados |
| `/comercial/contratos` | ver | Contratos de todas as oportunidades: busca, período de criação, situação (padrão: sem os cancelados); indicadores em ajuste, aguardando assinatura e assinados no mês; PDF de cada contrato; PDF e Excel da lista |
| `/comercial/modelo` | gerir | Texto-base com as variáveis (`{{honorario_mensal}}`…), logo do cabeçalho do contrato, prévia e PDF de exemplo. Cada gravação gera versão nova; contratos já gerados não mudam |

## 2. Regras

- **Nada se apaga** (migração 036): oportunidade sai do funil **arquivando com motivo** (`crm_arquivar`, janela de
  motivo obrigatória) e pode voltar; atividade fica no histórico (o texto dos registros feitos à mão pode ser
  corrigido; os automáticos de contrato/etapa não); contrato muda para **cancelado** ("Renegociar") e continua em
  "Versões anteriores".
- Marcar como **perdida** pede o motivo (`motivo_perda`). Marcar como **ganho** confirma e cadastra o cliente
  (`crm_converter_cliente`). Ao marcar contrato como **assinado**, a tela pergunta se cadastra o cliente agora.
- Registro de ligação/WhatsApp/e-mail/reunião tira a oportunidade de "Novo lead"; "Próximo passo" exige data e vira o
  "Próximo retorno". Retorno com data anterior a hoje (fuso da organização) aparece como atrasado.
- Contrato: enquanto rascunho, os valores mudam; "Marcar como enviado/assinado" só com os valores salvos (o PDF salva
  sozinho). Enviado leva a oportunidade para "Proposta" quando estava antes dela.

## 3. Código

- `web/src/dominios/comercial/crm.ts` (tipos, etapas, montagem do contrato), `rotulos.ts` (tons das etapas e situações,
  link do WhatsApp, retorno atrasado; testado), `leituras.ts`, `repositorio.ts` (todas as gravações),
  `baixarContrato.ts`, `contratoPdf.ts`.
- `web/src/dominios/comercial/componentes/`: `QuadroFunil`, `JanelasFunil` (nova oportunidade, limpar funil),
  `useAcoesOportunidade` (mover, arquivar, voltar ao funil, virar cliente) e `ficha/` (dados, histórico, contrato).

## 4. Pendência: gravações em várias etapas

Três ações gravam em mais de um passo a partir do navegador (a tela avisa se um passo depois do principal falhar). A
auditoria pediu que virem funções do banco (uma transação):

- `crm_salvar_contrato(p_op uuid, p_modelo uuid, p_valores jsonb)` → numera com trava por organização/ano, monta o texto
  no servidor, cria ou atualiza o rascunho, atualiza `valor_mensal` e registra no histórico.
- `crm_marcar_contrato(p_contrato uuid, p_status text, p_converter boolean default false)` → muda a situação com as
  datas, registra no histórico, leva a oportunidade para "Proposta" ao enviar e, se pedido, chama a conversão.
- `crm_registrar_atividade(p_op uuid, p_tipo text, p_texto text, p_quando date)` → grava a atividade e atualiza
  próximo retorno / etapa inicial.
