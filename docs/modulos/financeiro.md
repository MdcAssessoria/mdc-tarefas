# Módulo Financeiro

> **Resumo:** a gestão financeira de cada cliente dentro do HUB, usada pela equipe MDC e (próxima etapa de tela) pelo
> próprio cliente no Portal. Etapa 1: plano de contas do Domínio, contas bancárias e extratos (OFX ou Excel).
> Etapa 1B (01/11/2026): cadastros (fornecedores/clientes, despesas e receitas ligadas ao plano, centros de custo),
> contas a pagar e a receber (parcelas, baixa parcial com juros/multa/desconto, estorno, cancelamento), Entradas e
> saídas (o dinheiro que entrou/saiu e para onde foi) e Itens e estoque (com "controla estoque?"). Próximas: pedidos de
> compra e venda (baixa automática do estoque), conciliação com o extrato, notas de entrada (XML da SEFAZ/NFS-e com o
> certificado A1, manifestação do destinatário) e de saída (emissão). Cada etapa é auditada e testada com MDC e
> Greencore (Piloto HUB) antes da carteira.

## 1. Telas

| Endereço | Quem usa | O que faz |
| --- | --- | --- |
| `/financeiro` | Equipe (ver; cadastro com operar) | Contas bancárias da empresa escolhida: saldo pelos extratos, último lançamento, lançamentos a conciliar, conta contábil ligada; cadastrar e editar; PDF e Excel |
| `/financeiro/extratos` | Equipe (ver; importar com operar) | Importa OFX ou planilha numa conta (confere antes de gravar); lista com filtros de conta, período, entradas/saídas, situação e busca; totais; PDF e Excel |
| `/financeiro/plano` | Equipe (ver; importar com operar) | Importa o plano de contas do Domínio (Excel/CSV); lista com busca e filtros; PDF e Excel |
| `/financeiro/pagar` e `/financeiro/receber` | Equipe (ver; lançar e baixar com operar) | Contas a pagar / a receber: filtro de vencimento em um clique, situação (em aberto, vencidos, a vencer, pagos, cancelados), fornecedor/cliente, categoria e busca; frase de resumo; 3 indicadores que filtram ao clicar (vencido, a vencer, pago); lançar (parcelas mensais, "já foi pago", fornecedor novo cadastrado na hora), pagar/receber (total ou parcial), editar, histórico com estorno, cancelar com motivo; PDF e Excel |
| `/financeiro/movimento` | Equipe | Entradas e saídas: pagamentos e recebimentos do período (realizado) e, se marcado, o previsto (contas em aberto que vencem no período); entrou, saiu, resultado; "para onde foi o dinheiro" por categoria (clique filtra); lançar entrada/saída à vista; PDF e Excel |
| `/financeiro/cadastros` | Equipe (ver; cadastrar com operar) | Abas Fornecedores e clientes (CPF/CNPJ conferido), Despesas e receitas (cada uma ligada a conta analítica ativa do plano), Centros de custo; busca, filtros, PDF e Excel |
| `/financeiro/estoque` | Equipe (ver; movimentar com operar; regra de negativo com gerir) | Abas Itens (produto/serviço, "controla estoque", mínimo, custo, preço, NCM, categorias de compra e venda; indicadores de valor em estoque e itens abaixo do mínimo), Estoques (locais, padrão, regra de estoque negativo) e Movimentações (entrada, saída, inventário, transferência, estorno); PDF e Excel |

A empresa escolhida fica lembrada no navegador (`hub-mdc:financeiro:cliente`) e vale para as três telas.

Código: regras puras em `web/src/dominios/financeiro/` (`ofx.ts`, `extratoPlanilha.ts`, `planoDominio.ts`, testes em
`leitores.test.ts`), leituras paginadas em `leituras.ts`, gravações em `repositorio.ts`, telas em
`web/src/app/(hub)/financeiro/`. Etapa 1B: regras puras em `regras.ts` (CPF/CNPJ, período, parcelas, situação; testes
em `regras.test.ts`), exportação comum PDF/Excel em `exportar.ts`, telas compartilhadas em `componentes/`
(`TelaTitulos`, `LancarTitulo`, `BaixaTitulo`, `CadPessoas`, `CadCategorias`, `CadCentros`, `EstoqueItens`, `EstoqueLocais`,
`EstoqueMovimentos`, `estoqueBase`, `Comuns`).

## 2. Regras

| Regra | Onde |
| --- | --- |
| Plano de contas: precisa das colunas Classificação e Descrição (ou Nome); Código e Tipo (S/A) são opcionais. Sem coluna Tipo, conta com filha é sintética | `planoDominio.ts` |
| Importar o plano de novo atualiza: conta nova entra, existente é atualizada, conta que saiu do Domínio fica **inativa** (nunca apagada) | `fin_importar_plano` (migração 026) |
| Conta bancária só se liga a conta **analítica ativa** do plano do mesmo cliente; não muda de cliente | gatilho `tg_fin_conta_bancaria` |
| Extrato OFX (SGML ou XML) e planilha (data, histórico, valor ou débito/crédito); OFX com acento antigo é lido como Windows-1252 | `ofx.ts`, `extratoPlanilha.ts`, `leituras.textoDoArquivo` |
| Lançamento repetido não entra duas vezes: chave = FITID do banco + data + valor (há bancos que repetem o FITID) ou, sem FITID, data + valor + histórico + documento; iguais no mesmo dia ganham número de ordem | `chavesDoArquivo` + `unique (conta_id, chave)` |
| OFX com mais de uma conta é recusado (um extrato por conta) | `lerOfx` |
| Planilha: a descrição nunca é a coluna da data; valor sem sinal com coluna D/C separada vira saída quando D | `extratoPlanilha.ts` |
| Depois de gravar, o HUB compara o saldo calculado com o saldo final informado pelo banco no OFX e avisa a diferença | `ImportarExtrato.tsx` |
| Desfazer importação: retira o lote e os lançamentos dele, só se nenhum foi conciliado; fica na auditoria | `fin_desfazer_lote` |
| Reimportar o plano mostra antes quantas contas entram e quantas ficariam inativas (alerta forte acima de 30%) | tela do plano |
| Aviso quando o número da conta do arquivo não bate com o cadastrado | tela de extratos |
| Saldo da conta = saldo do banco no fim do dia informado + lançamentos dos dias seguintes | `saldoDaConta` |

## 3. Banco (migração 026)

`fin_plano_contas`, `fin_plano_importacoes`, `fin_contas_bancarias`, `fin_extrato_lotes`, `fin_extrato_linhas`.
Leitura com `app.hub_pode(org, 'financeiro', 'ver')`; contas bancárias gravadas direto com `operar`; plano e extrato só
pelas funções `fin_importar_plano`, `fin_importar_extrato` e `fin_desfazer_lote` (security definer, conferem `operar`,
tudo ou nada, registradas na auditoria). A conta contábil do banco só é validada quando muda (reimportar o plano não
trava a edição da conta bancária).


## 4. Etapa 1B: cadastros e contas a pagar/receber (migrações 028 e 030)

| Regra | Onde |
| --- | --- |
| Categoria (despesa/receita) só liga em conta **analítica ativa** do plano da mesma empresa; não muda de empresa; só a equipe MDC cadastra (o cliente no Portal só lê), como os centros de custo | `tg_fin_categoria`, políticas `fin_incluir`/`fin_alterar` (030) |
| Fornecedor/cliente, centro de custo e estoque (local) não mudam de empresa | `tg_fin_sem_troca_empresa` (030) |
| Fornecedor digitado na hora no lançamento: o banco acha pelo nome ou cadastra, na mesma transação | `fin_lancar` (`pessoa_nome`, 030) |
| Valor digitado: "1.250" = mil duzentos e cinquenta (ponto é milhar); "1.250,50" e "1250.50" também valem | `regras.numeroBr` |
| Editar valor de título pago em parte: precisa ficar maior do que o já pago (senão daria baixa do restante) | `tg_fin_titulo` (030) |
| Entradas e saídas: juros e multa e descontos aparecem em linhas próprias ("Juros e multas pagos/recebidos", "Descontos obtidos/concedidos"), não na categoria do título | `movimento/page.tsx` |
| Conta a pagar usa categoria de despesa; a receber, de receita; fornecedor, centro e banco previsto da mesma empresa | `tg_fin_titulo` |
| Lançar: valor dividido em parcelas mensais iguais, centavos na última; vencimento no mesmo dia (último dia do mês quando não existe, ex.: 31/01 → 28/02); "já foi pago" quita todas na hora | `fin_lancar`, prévia em `regras.dividirParcelas` |
| Pagar/receber: baixa total ou parcial; `valor` = quanto do título foi baixado, `total` = o que passou no banco (valor + juros + multa − desconto); quita quando o baixado chega ao valor | `fin_baixar` |
| Estorno de pagamento: marca (não apaga), exige motivo, reabre o título; recusa se já conciliado com o extrato | `fin_estornar_baixa` |
| Cancelar: só título em aberto sem pagamento, com motivo | `fin_cancelar_titulo` |
| Situação e valor pago só mudam pelas funções; título quitado/cancelado não se edita; valor não fica abaixo do já pago | `tg_fin_titulo` (`app.fin_interno`) |
| Situação na tela: Vencido (vencimento < hoje, com saldo), Vence hoje, A vencer, Pago em parte, Pago, Cancelado | `regras.situacaoDoTitulo` |
| CPF/CNPJ só com números e dígitos verificadores conferidos na tela; único por empresa | `regras.documentoValido`, índice `fin_pessoas_documento` |
| Nada se apaga (sem política de delete): cadastros inativam | RLS |
| Saldo dos bancos continua vindo do extrato; pagamentos registrados aqui serão ligados às linhas do extrato na conciliação (etapa 2), sem contar duas vezes | — |

## 5. Acesso do cliente (Portal)

As tabelas da etapa 1B usam `app.fin_pode(cliente, nível)`: equipe com a ferramenta Financeiro **ou** pessoa do cliente
com a permissão `financeiro` no Portal (ver e lançar; `gerir` só a equipe). O cliente também enxerga as contas
bancárias e o plano da própria empresa. **A tela do Portal ainda não existe** (próxima entrega); até lá, a permissão
`financeiro` não aparece na lista de permissões do Portal.

## 6. Itens e estoque (migração 029)

| Regra | Onde |
| --- | --- |
| Item é produto ou serviço; **serviço nunca controla estoque**; item com saldo não deixa de controlar estoque | `est_itens_servico_sem_estoque`, `tg_est_item` |
| Item não estocável não entra em movimento manual; na saída automática (pedidos/notas) passa sem mexer no estoque | `app.est_gravar`, `app.est_saida` |
| Saída/transferência confere o saldo do local com o item travado (duas saídas ao mesmo tempo não furam o estoque); estoque negativo só se a equipe (gerir) liberar para a empresa | `app.est_gravar`, `est_definir_negativo` |
| Inventário: a pessoa informa o saldo **contado**; o HUB lança a diferença | `est_movimentar` (tipo ajuste) |
| Transferência: dois movimentos ligados pelo mesmo grupo; estorno desfaz os dois | `est_movimentar`, `est_estornar_movimento` |
| Estorno só de movimento manual, com motivo, e recusado se deixar o estoque negativo | `est_estornar_movimento` |
| Saldo = soma dos movimentos não estornados, por item e local | visão `est_saldos` (security_invoker) |
| Um estoque padrão por empresa | índice `est_locais_padrao` |
