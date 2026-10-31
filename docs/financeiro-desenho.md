# HUB-MDC Financeiro — desenho do módulo (a iniciar)

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

## Decisões em aberto
- Leiaute de importação de lançamentos do Domínio usado pela MDC.
- Formato de saída do plano de contas do Domínio (Excel, TXT ou consulta direta).
- Módulo incluso no honorário ou cobrado à parte.
- Bancos prioritários para PDF; clientes piloto; uso por clientes do Simples só como gestão.
