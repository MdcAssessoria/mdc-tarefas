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
| `/comercial/ferramentas` | ver | **Ferramentas abertas** (13/11/2026): páginas públicas da MDC no domínio do HUB, sem login, que trazem leads para o Funil. Cada cartão: link oficial `hub.mdcassessoria.com/hub-mdc/ferramentas/<id>` com o canal de divulgação ("Onde vai divulgar" vira `utm_source` e aparece em "Como chegou"), Abrir, Copiar link, Enviar pelo WhatsApp (convite pronto), Código para o site (iframe para o WordPress, altura automática), Ver leads; leads no mês e no total. PDF e Excel do catálogo |
| `/comercial/[id]` | ver (editar: operar) | Ficha: contato (WhatsApp, e-mail), arquivar, "Fechou: virar cliente", etapas clicáveis e duas abas — **Acompanhamento** (histórico e próximos passos; dados da empresa, contato e negociação; respostas do Simulador) e **Proposta e contrato** (valores negociados, prévia, PDF, enviado, assinado, renegociar, versões anteriores). No celular o histórico vem antes dos dados |
| `/comercial/contratos` | ver | Contratos de todas as oportunidades: busca, período de criação, situação (padrão: sem os cancelados); indicadores em ajuste, aguardando assinatura e assinados no mês; PDF de cada contrato; PDF e Excel da lista |
| `/comercial/modelo` | gerir | Texto-base com as variáveis (`{{honorario_mensal}}`…), logo do cabeçalho do contrato, prévia e PDF de exemplo. Cada gravação gera versão nova; contratos já gerados não mudam |

## 2. Regras

- **Nada se apaga** (migração 036): oportunidade sai do funil **arquivando com motivo** (`crm_arquivar`, janela de
  motivo obrigatória) e pode voltar; atividade fica no histórico (o texto dos registros feitos à mão pode ser
  corrigido; os automáticos de contrato/etapa não); contrato muda para **cancelado** ("Renegociar") e continua em
  "Versões anteriores".
- **Excluir de vez** (migração 054, pedido do Edvaldo em 04/11/2026): para lead de teste, duplicado ou que entrou por
  engano. Só quem **gere** o Comercial vê o botão (ficha, menu "⋯" do cartão, Arquivadas e seleção em Leads); pede
  motivo (5 letras ou mais) e avisa que não dá para desfazer. Leva junto o histórico e os rascunhos de contrato. O banco
  recusa quem virou cliente ou tem contrato assinado (esses se arquivam) e guarda o retrato completo na auditoria
  (`crm_excluir`, `excluir_oportunidade`). Apagar direto pela tabela continua bloqueado (`nada_se_apaga`).
- **Buscar dados da Receita** na ficha: o campo CNPJ tem o botão "Buscar dados" (BrasilAPI, `CampoCnpj`), que preenche
  razão social, cidade, UF, e-mail (se vazio) e o regime quando é Simples/MEI.
- Marcar como **perdida** pede o motivo (`motivo_perda`). Marcar como **ganho** confirma e cadastra o cliente
  (`crm_converter_cliente`). Ao marcar contrato como **assinado**, a tela pergunta se cadastra o cliente agora.
- Registro de ligação/WhatsApp/e-mail/reunião tira a oportunidade de "Novo lead"; "Próximo passo" exige data e vira o
  "Próximo retorno". Retorno com data anterior a hoje (fuso da organização) aparece como atrasado.
- Contrato: enquanto rascunho, os valores mudam; "Marcar como enviado/assinado" só com os valores salvos (o PDF salva
  sozinho). Enviado leva a oportunidade para "Proposta" quando estava antes dela.
- Contrato em rascunho sai com a marca d'água **MINUTA** na diagonal em todas as páginas (047, DES-01): minuta impressa
  não passa por contrato definitivo.
- Contrato em PDF (`contratoPdf.ts`, revisto em 03/11/2026 pelos achados C-03, D-01, D-02 e D-13): valor por extenso
  na regra portuguesa ("um milhão e mil reais", "dois milhões e quinhentos mil reais", "mil" e não "um mil"); o
  "R$" nunca se separa do valor na quebra de linha (só quebra em espaço comum); o fecho ("E, por estarem de acordo…") e a
  linha de local e data vão sempre para a mesma página das assinaturas; o nome do contratante quebra pela largura da
  coluna em até 2 linhas (com "…" se ainda sobrar) e o CNPJ/CPF de cada parte sai sob a linha de assinatura.

## 3. Código

- `web/src/dominios/comercial/crm.ts` (tipos, etapas, montagem do contrato), `rotulos.ts` (tons das etapas e situações,
  link do WhatsApp, retorno atrasado; testado), `leituras.ts`, `repositorio.ts` (todas as gravações),
  `baixarContrato.ts`, `contratoPdf.ts`.
- `web/src/dominios/comercial/componentes/`: `QuadroFunil`, `JanelasFunil` (nova oportunidade, limpar funil),
  `useAcoesOportunidade` (mover, arquivar, voltar ao funil, virar cliente) e `ficha/` (dados, histórico, contrato).

## 4. Gravações pelo banco (migração 038, 02/11/2026)

As três ações que gravavam em vários passos pelo navegador viraram funções do banco, cada uma numa transação só
(tudo ou nada), conferindo Comercial (operar):

- `crm_salvar_contrato(p_op, p_modelo, p_valores, p_texto)` → rascunho existente: atualiza; sem rascunho: numera
  `AAAA/NNN` com trava por organização e ano (índice único `crm_contratos_numero_uk`: duas pessoas salvando ao mesmo
  tempo recebem números diferentes), cria, atualiza `valor_mensal` e registra no histórico. A tela monta o texto com
  `{{numero}}` e o banco põe o número.
- `crm_marcar_contrato(p_contrato, p_status, p_converter)` → enviado/assinado/cancelado com as datas, histórico,
  "Proposta" ao enviar e, se pedido, cadastra o cliente ao assinar. Contrato cancelado não muda mais.
- `crm_registrar_atividade(p_op, p_tipo, p_texto, p_quando)` → grava no histórico e atualiza próximo retorno / etapa
  inicial. Tipos `contrato` e `etapa` são só do sistema.

Testes: `supabase/testes/91_base_038.sql` e `92_crm_038.sql` (inclui a corrida pelo `dblink`).

## Ferramentas abertas (13/11/2026)

- **Onde ficam:** cada ferramenta é uma página estática em `web/public/ferramentas/<id>/index.html`, servida em
  `hub.mdcassessoria.com/hub-mdc/ferramentas/<id>` (rewrite em `web/next.config.ts`). Não passa pelo login nem pela
  Guarda do HUB. O catálogo da tela (nome, texto, origem no CRM, convite) fica em `dominios/comercial/ferramentas.ts`.
- **Leads:** a página chama direto `crm_receber_lead` com a chave publicável do HUB (pública por natureza). A função só
  aceita lead com consentimento, no máximo 20 por minuto, e não duplica (`origem_ref` = id gerado na página).
- **Site da MDC:** a página pode ser embutida em `mdcassessoria.com` (cabeçalho `frame-ancestors` só para
  `/ferramentas/*`); o código pronto sai pelo botão "Código para o site".
- **Simulador de Regime 2027:** saiu do GitHub Pages (`mdcassessoria.github.io/mdc-simulador`, que agora redireciona) e
  do banco separado `mdc-simulador`; o lead não passa mais pelo repasse `supabase/simulador/001_encaminhar_leads_hub.sql`.
  O banco separado fica só como histórico dos leads antigos.
- **Visual (13/11/2026):** padrão do HUB (Hanken Grotesk e Bodoni Moda servidas de `public/ferramentas/comum/fontes`,
  logo dourada em `comum/`, sem Google Fonts), botões sempre com ícone e texto, escolhas em cartões no lugar das réguas
  (a régua fica em "Ajustar o percentual exato"), 4 passos curtos com barra de progresso (empresa, faturamento e regime,
  custos, contato) e o resultado com o botão do WhatsApp no topo e fixo no celular; o parecer completo abre por clique.
- **Ferramenta nova:** criar `public/ferramentas/<id>/index.html` (enviando o lead por `crm_receber_lead`) e uma linha
  em `FERRAMENTAS`. Se a origem for nova, incluí-la em `ORIGENS` (`dominios/comercial/crm.ts`) e na função do banco.

