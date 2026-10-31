# HUB-MDC Gestão — desenho dos módulos (a iniciar)

Registrado em 30/10/2026. Documento completo (com diagrama do fluxo):
https://claude.ai/artifact/Cu9hzs8eU74YeaVaaKmw5B

## Pedido do Edvaldo
Controle financeiro dentro do HUB, disponível ao cliente, que:
- cria contas de banco;
- importa extrato OFX, Excel e PDF;
- concilia receitas e despesas;
- importa o plano de contas do Domínio para o módulo;
- cria centros de custo e/ou contas de despesa amarrados ao plano de contas;
- ao conciliar, já gera a contabilidade.

## Princípio
Um único cadastro de contas: o plano do Domínio do cliente. Toda categoria financeira aponta para
uma conta analítica do plano, então conciliar = contabilizar. A MDC revisa e exporta o mês no
leiaute de importação de lançamentos do Domínio.

## Fluxo
Plano do Domínio → contas bancárias (conta contábil do banco) e categorias/centros →
importar extrato (lote, sem duplicidade) → conciliação (regra, título em aberto ou manual; divisão;
transferências) → lançamento D/C → revisão e exportação MDC → importação no Domínio.

## Tabelas (prefixo fin_, org_id + cliente_id, RLS como o Portal)
fin_plano_contas, fin_plano_importacoes, fin_contas_bancarias, fin_centros_custo, fin_categorias,
fin_regras, fin_extrato_lotes, fin_extrato_linhas, fin_titulos, fin_conciliacoes,
fin_conciliacao_itens, fin_lancamentos, fin_exportacoes.
Travas no banco: soma dos itens = linha; só conta analítica ativa; conciliado/exportado imutável;
desconciliação auditada.

## Regras contábeis
- Entrada sem título: D Banco / C conta da categoria. Saída sem título: D conta da categoria / C Banco.
- Recebimento de título: D Banco / C Clientes. Pagamento: D Fornecedores / C Banco.
- Título por competência: D despesa / C Fornecedores; D Clientes / C receita.
- Transferência própria: D banco destino / C banco origem.
- Exportação marca e trava lançamentos; mês fechado só reabre pela MDC.

## Fases
1. Base contábil (plano Domínio, categorias, centros, modelo por segmento).
2. Bancos e extratos (OFX, Excel, lotes, duplicidade).
3. Conciliação + lançamentos + exportação Domínio + fechamento.
4. Gestão do cliente (a pagar/receber, painel, relatórios, PDF dos principais bancos).

## Decisões tomadas (30/10/2026)
- Exportação no leiaute de importação de lançamentos contábeis do Domínio, em Excel e TXT.
- O módulo entra no honorário pago pelo cliente.
- PDF: bancos de primeira linha e cooperativas (Sicoob, Sicredi); OFX é o formato principal.
- Plano de contas sai do Domínio em Excel.
- Piloto: a própria MDC.
- Entradas e Saídas também entram na cobrança ao cliente.
- Notas (XML, PDF, protocolos) ficam no Supabase do HUB (fis_notas + Storage), sem exclusão (guarda pelo prazo decadencial);
  o serviço fiscal só assina e transmite, não armazena.
- Clientes do Simples podem usar os módulos como gestão.
- Notas: integração própria com SEFAZ e ambiente nacional da NFS-e (sem API paga), bibliotecas validadas
  (ex.: sped-nfe/NFePHP, PyNFe) num serviço fiscal separado (mTLS + assinatura XML), testes em homologação.
- Certificado A1: o cliente guarda na área dele do HUB; o administrador da MDC acessa todos.

## Módulos Entradas (compras) e Saídas (vendas)
Módulos à parte que descarregam no Financeiro: cada nota vira título a pagar/receber; a conciliação
baixa o título e contabiliza. Mesmo cadastro de pessoas, plano e categorias.
- Entradas: Distribuição DF-e com certificado A1 do cliente, manifestação do destinatário, NFS-e
  tomada pelo ambiente nacional, XML avulso (NF-e, CT-e), de-para fornecedor/produto/CFOP →
  categoria e centro, títulos a pagar pelas parcelas, XML para o Domínio.
- Saídas: emissão de NF-e e NFS-e padrão nacional (NFC-e depois), cadastros com NCM/CFOP/CST/CSOSN e
  IBS/CBS, regras fiscais por operação travadas pela MDC, cancelamento/CC-e/inutilização,
  DANFE/DANFSe por e-mail (hub@), títulos a receber, XML para o Domínio.
- Emissão e recebimento por integração própria (ver decisões).
- Tabelas: fis_pessoas, fis_produtos, fis_regras_fiscais, fis_notas, fis_nota_itens, fis_eventos;
  fin_titulos.nota_id.
- Fases 5 (Entradas) e 6 (Saídas).

## Relatórios (Financeiro, Entradas e Saídas — mesmo molde)
Regra permanente: tudo pensado para público leigo, de alta aparência e intuitivo.
Molde único de tela: período em um clique (Este mês, Mês passado, Últimos 3 meses, Este ano, Escolher datas);
no máximo 3 filtros à vista + "Mais filtros", etiquetas com X e "Limpar"; frase de resumo gerada pelos números;
3 indicadores; gráfico que filtra a tabela ao clicar; tabela com busca, ordenação e total; exportar PDF
(timbrado MDC, período e filtros no cabeçalho) e Excel (formatado, aba com filtros, valores numéricos) exatamente
o que está na tela; relatórios favoritos; tela vazia que ensina o próximo passo; versão celular.
Linguagem leiga ("Dinheiro que entrou/saiu"); termo técnico só com explicação ao passar o mouse.
Catálogo:
- Financeiro: fluxo realizado, fluxo previsto, a pagar/receber, para onde foi o dinheiro (categoria/centro),
  de onde veio o dinheiro, resultado do mês (DRE gerencial de caixa), extrato conciliado, pendências de conciliação.
- Entradas: compras por fornecedor/produto, notas recebidas (manifestação), impostos nas compras.
- Saídas: faturamento por cliente/produto (curva ABC), notas emitidas/canceladas, faturado x recebido,
  impostos destacados.
Base: lib/excel.ts e lib/relatorioPdf.ts viram um componente único de relatório. Entram com cada módulo (fases 4–6).

## Pacotes e contratação
- Tela nova "Pacotes": nome, descrição, módulos incluídos, valor mensal, ativo. Partida: pacote Gestão =
  Financeiro + Entradas + Saídas + Fiscal (Fiscal vem no pacote de quem compra os três).
- Cadastro do cliente: seção "Módulos contratados" — Pacote ou Módulos avulsos, valor negociado, início/fim.
- Portal mostra só o contratado; contrato encerrado bloqueia acesso e mantém dados. Valor alimenta honorário/CRM.
- Tabelas: hub_pacotes, hub_pacote_modulos, cliente_contratos, cliente_contrato_modulos.

## Módulo Fiscal
- Enquadramento lido do cadastro (clientes.regime) + histórico por ano (cliente_enquadramentos): anexos/atividades
  do Simples, sublimite, opção IBS/CBS fora do DAS (semestral), ST/monofásico, município do ISS, IE.
- Motor de regras com vigência (fis_regras_tributos: tributo, regime, base, alíquota, condições, fonte legal,
  início/fim). Lei nova = linha nova; reprocessar mês antigo usa regra da época.
- Simples: RBT12, anexo, fator R, alíquota efetiva, segregação (ST, monofásico, ISS retido, exportação).
  Presumido: PIS 0,65%/COFINS 3%; IRPJ/CSLL trimestral com presunção, adicional e acréscimo LC 224/2025
  (parcela da receita anual > R$ 5 mi). Real: PIS/COFINS não cumulativo com créditos das Entradas; IRPJ/CSLL
  com LALUR vindo da Contabilidade. ICMS, IPI, ISS.
- Reforma: 2026 apuração paralela IBS/CBS informativa; crédito ligado ao pagamento (split payment);
  importar e comparar a apuração assistida (RFB/Comitê Gestor); relatório "Dentro ou fora do DAS?" para o
  Simples (usa o Simulador de Regime); 2029–2032 ICMS/ISS e IBS lado a lado; 2033 só IBS/CBS/IS.
- Guias: rascunho com memória de cálculo em linguagem simples → MDC fecha → v1 guia anexada (lê linha
  digitável, valor, vencimento) → depois Integra Contador (Serpro, pago por uso) para PGDAS-D/DAS, DARF,
  DCTFWeb. Guia → conta a pagar no Financeiro + cumpre item em Vencimentos. Provisão D despesa/C tributo
  a recolher; pagamento na conciliação.
- Tabelas: cliente_enquadramentos, fis_regras_tributos, fis_apuracoes, fis_guias.

## Módulo Contabilidade
- Consolida pelo plano de contas: conciliações (Financeiro), notas por competência (Entradas/Saídas),
  provisões (Fiscal), lançamentos manuais MDC, folha importada do Domínio. Origem clicável.
- Diário, razão, balancete de qualquer período (molde de relatórios).
- Cópia integral do desenho do balancete atual: o balancete gerado sai no mesmo formato de linhas do
  importado (lib/balancete.ts Linha), então reaproveita grupos, conferências, painel, BP/DRE/DFC, índices
  (liquidez, endividamento, margens, PMR/PMP/PME/PMV, ciclos, carga tributária) com tendência linear,
  fragilidades, saúde por pilares, parecer, PDF assinado e publicação no Portal.
- Conferência HUB × Domínio conta a conta (balancete do Domínio segue importado); fechamento trava origens.

## Fases (revisadas)
1 Pacotes · 2 Base contábil · 3 Bancos e extratos · 4 Conciliação e contabilização · 5 Gestão do cliente ·
6 Entradas · 7 Saídas · 8 Fiscal · 9 Contabilidade.

## Serviço fiscal — onde roda
Escolhido: Google Cloud Run, região São Paulo (southamerica-east1). Liga só quando o HUB chama; cota gratuita
mensal por conta de faturamento: 180 mil vCPU-s, 360 mil GiB-s, 2 milhões de requisições (São Paulo é
"Tier 2", a cota é aplicada como desconto a preço Tier 1). Acesso restrito ao HUB; alerta de orçamento.
Alternativas avaliadas: Fly.io (sem grátis; US$ 3,54/mês a menor máquina em gru) e Oracle Always Free
(grátis, mas recolhe instâncias ociosas e exige administrar o servidor).
Fontes: https://cloud.google.com/run/pricing · https://fly.io/pricing.md ·
https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm

## Pendência para iniciar
- Conta do Google Cloud (fazer quando iniciar os módulos de notas):
  1. Claude abre console.cloud.google.com no Chrome.
  2. Edvaldo cria a conta e faz o login (cartão e senha digitados por ele).
  3. Claude cria o projeto "hub-mdc-fiscal", alerta de orçamento, ativa Cloud Run/Secret Manager
     na região southamerica-east1 e conecta o serviço fiscal ao HUB.
