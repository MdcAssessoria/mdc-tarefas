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

## Decisões tomadas (30/10/2026)
- Exportação no leiaute de importação de lançamentos contábeis do Domínio, em Excel e TXT.
- O módulo entra no honorário pago pelo cliente.
- PDF: bancos de primeira linha e cooperativas (Sicoob, Sicredi); OFX é o formato principal.
- Plano de contas sai do Domínio em Excel.
- Piloto: a própria MDC.
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

## Decisões em aberto
- Entradas/Saídas no mesmo honorário do Financeiro ou faixa acima.
- Onde roda o serviço fiscal (servidor próprio da MDC ou nuvem) e quem mantém.
