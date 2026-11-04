-- BD-04 (reauditoria de 03/11/2026): as provas dos testes 20 (títulos), 30 (estoque), 50 (notas de entrada) e 70
-- (transferências) refeitas com a regra de produção (042 em diante): só a MDC (c41) tem gestão, acesso pelo módulo em
-- hub_acessos, o Portal não alcança a gestão. Os testes originais continuam rodando antes da 042 (cliente c1) como
-- histórico. Blocos "(deve falhar)" terminam em ERROR com mensagem em português; os demais sem ERROR.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
set teste.hoje = '2027-04-10';
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-000000000e51';
set teste.membro = 'analista';

\echo '=================== T (20) títulos a pagar e receber da MDC'
\echo '--- T1 categoria em conta sintética (deve falhar)'
insert into fin_categorias (org_id, cliente_id, tipo, nome, conta_contabil_id) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000c41','despesa','BD04 X','00000000-0000-0000-0000-000000004104');
\echo '--- T2 categoria com conta de outra empresa (deve falhar)'
insert into fin_categorias (org_id, cliente_id, tipo, nome, conta_contabil_id) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000c41','despesa','BD04 X','00000000-0000-0000-0000-000000000001');
\echo '--- T3 categoria em outra empresa (deve falhar: gestão só da MDC)'
insert into fin_categorias (org_id, cliente_id, tipo, nome, conta_contabil_id) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1','despesa','BD04 X','00000000-0000-0000-0000-000000000001');
\echo '=== T4 cadastros certos na MDC (esperado: 1 linha cada)'
insert into fin_categorias (id, org_id, cliente_id, tipo, nome, conta_contabil_id) values
 ('00000000-0000-0000-0000-00000000bd01','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000c41','despesa','BD04 Aluguel','00000000-0000-0000-0000-000000004101') returning nome;
insert into fin_categorias (id, org_id, cliente_id, tipo, nome, conta_contabil_id) values
 ('00000000-0000-0000-0000-00000000bd02','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000c41','receita','BD04 Vendas','00000000-0000-0000-0000-000000004102') returning nome;
insert into fin_contas_bancarias (id, org_id, cliente_id, nome) values ('00000000-0000-0000-0000-00000000bdb1','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000c41','BD04 Itaú') returning nome;
insert into fin_pessoas (id, org_id, cliente_id, tipo, nome, documento) values ('00000000-0000-0000-0000-00000000bdf1','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000c41','fornecedor','BD04 Imobiliária','23456789000188') returning nome;
\echo '--- T5 pessoa com documento repetido (deve falhar)'
insert into fin_pessoas (org_id, cliente_id, tipo, nome, documento) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000c41','fornecedor','BD04 Dup','23456789000188');
\echo '=== T6 lançar 1000,00 em 3 parcelas (esperado: ok t; 333,33 + 333,33 + 333,34 em jan, fev, mar)'
select fin_lancar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"pagar","pessoa":"00000000-0000-0000-0000-00000000bdf1","categoria":"00000000-0000-0000-0000-00000000bd01","descricao":"BD04 Aluguel","vencimento":"2027-01-31","valor":1000,"parcelas":3}'::jsonb) is not null as ok;
select parcela, vencimento, valor from fin_titulos where descricao like 'BD04 Aluguel%' order by parcela;
\echo '--- T7 lançar em outra empresa (deve falhar)'
select fin_lancar('{"cliente":"00000000-0000-0000-0000-0000000000c1","tipo":"pagar","categoria":"00000000-0000-0000-0000-0000000000d1","descricao":"BD04 fora","vencimento":"2027-01-31","valor":10}'::jsonb);
\echo '--- T8 categoria de receita em conta a pagar (deve falhar)'
select fin_lancar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"pagar","categoria":"00000000-0000-0000-0000-00000000bd02","descricao":"BD04 x","vencimento":"2027-01-31","valor":10}'::jsonb);
\echo '--- T9 insert direto já quitado (deve falhar)'
insert into fin_titulos (org_id, cliente_id, tipo, categoria_id, descricao, vencimento, valor, valor_pago, situacao) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000c41','pagar','00000000-0000-0000-0000-00000000bd01','BD04 x','2027-01-01',10,10,'quitado');
\echo '--- T10 update direto da situação (deve falhar)'
update fin_titulos set situacao = 'quitado' where descricao like 'BD04 Aluguel%' and parcela = 1;
reset role;
select id as t1 from fin_titulos where descricao like 'BD04 Aluguel%' and parcela = 1 \gset
select id as t3 from fin_titulos where descricao like 'BD04 Aluguel%' and parcela = 3 \gset
set role authenticated;
\echo '=== T11 baixa parcial 200 + juros 5 (esperado: sem erro)'
select fin_baixar(:'t1', '2027-02-01', 200, '00000000-0000-0000-0000-00000000bdb1', 5, 0, 0, 'pix', null) ? 'baixa' as baixou;
\echo '--- T12 baixa acima do saldo (deve falhar)'
select fin_baixar(:'t1', '2027-02-01', 200, '00000000-0000-0000-0000-00000000bdb1');
\echo '--- T13 reduzir valor abaixo do pago (deve falhar)'
update fin_titulos set valor = 100 where id = :'t1';
\echo '--- T14 valor igual ao já pago (deve falhar)'
update fin_titulos set valor = 200 where id = :'t1';
\echo '--- T15 cancelar com pagamento (deve falhar)'
select fin_cancelar_titulo(:'t1', 'teste do BD-04');
\echo '=== T16 quitar o resto (133,33, com desconto de 3,33 registrado) (esperado: quitado, pago 333,33)'
select fin_baixar(:'t1', '2027-02-02', 133.33, '00000000-0000-0000-0000-00000000bdb1', 0, 0, 3.33) ? 'baixa' as baixou;
select valor, valor_pago, situacao from fin_titulos where id = :'t1';
\echo '--- T17 editar título quitado (deve falhar)'
update fin_titulos set descricao = 'BD04 y' where id = :'t1';
\echo '=== T18 estornar a 2a baixa (esperado: volta a aberto com 200,00 pagos)'
select fin_estornar_baixa((select max(id) from fin_baixas where titulo_id = :'t1'), 'baixa errada');
select valor_pago, situacao from fin_titulos where id = :'t1';
\echo '=== T19 à vista já pago e cancelar a parcela 3 (esperado: quitado 50,00; cancelado)'
select fin_lancar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"receber","categoria":"00000000-0000-0000-0000-00000000bd02","descricao":"BD04 Venda balcão","vencimento":"2027-02-05","valor":50,"pago":{"data":"2027-02-05","conta":"00000000-0000-0000-0000-00000000bdb1"}}'::jsonb) is not null as ok;
select situacao, valor_pago from fin_titulos where descricao = 'BD04 Venda balcão';
select fin_cancelar_titulo(:'t3', 'acordo com a imobiliária');
select situacao from fin_titulos where id = :'t3';
\echo '=== T20 apagar não apaga (esperado: 4 títulos BD04)'
delete from fin_titulos where descricao like 'BD04%';
select count(*) as titulos from fin_titulos where descricao like 'BD04%';
\echo '--- T21 fornecedor mudar de empresa (deve falhar)'
update fin_pessoas set cliente_id = '00000000-0000-0000-0000-0000000000c1' where id = '00000000-0000-0000-0000-00000000bdf1';
\echo '=== T22 fornecedor digitado na hora: cria uma vez e reaproveita (esperado: ok, ok, 1)'
select fin_lancar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"pagar","pessoa_nome":"BD04 Posto Novo","categoria":"00000000-0000-0000-0000-00000000bd01","descricao":"BD04 Combustível","vencimento":"2027-03-10","valor":100}'::jsonb) is not null as ok;
select fin_lancar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"pagar","pessoa_nome":"bd04 posto novo","categoria":"00000000-0000-0000-0000-00000000bd01","descricao":"BD04 Combustível 2","vencimento":"2027-03-11","valor":90}'::jsonb) is not null as ok;
select count(*) as postos from fin_pessoas where lower(nome) = 'bd04 posto novo';
\echo '--- T23 lançamento que falha não deixa fornecedor (deve falhar)'
select fin_lancar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"pagar","pessoa_nome":"BD04 Fantasma","categoria":"00000000-0000-0000-0000-00000000bd02","descricao":"BD04 x","vencimento":"2027-03-11","valor":90}'::jsonb);
select count(*) as fantasma from fin_pessoas where nome = 'BD04 Fantasma';
\echo '=== T24 só ver: lê os títulos da MDC (esperado: > 0)'
set teste.uid = '00000000-0000-0000-0000-000000000e52';
select count(*) > 0 as le from fin_titulos where descricao like 'BD04%';
\echo '--- T25 só ver lança (deve falhar)'
select fin_lancar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"pagar","categoria":"00000000-0000-0000-0000-00000000bd01","descricao":"BD04 x","vencimento":"2027-03-10","valor":80}'::jsonb);
\echo '=== T26 Portal (cliente c1): não vê a gestão da MDC (esperado: 0 e 0)'
set teste.membro = '';
set teste.uid = '00000000-0000-0000-0000-0000000000e2';
select count(*) as titulos_mdc from fin_titulos where cliente_id = '00000000-0000-0000-0000-000000000c41';
select count(*) as contas_mdc from fin_contas_bancarias where cliente_id = '00000000-0000-0000-0000-000000000c41';
\echo '--- T27 Portal lança na MDC (deve falhar)'
select fin_lancar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"pagar","categoria":"00000000-0000-0000-0000-00000000bd01","descricao":"BD04 x","vencimento":"2027-03-10","valor":80}'::jsonb);
\echo '--- T28 Portal lança na própria empresa (deve falhar: o Portal não tem mais gestão)'
select fin_lancar('{"cliente":"00000000-0000-0000-0000-0000000000c1","tipo":"pagar","categoria":"00000000-0000-0000-0000-0000000000d1","descricao":"BD04 x","vencimento":"2027-03-10","valor":80}'::jsonb);
\echo '=== T29 sem acesso nenhum (esperado: 0)'
set teste.uid = '00000000-0000-0000-0000-0000000000e9';
select count(*) as nada from fin_titulos;
\echo '--- T30 sem acesso nenhum lança (deve falhar)'
select fin_lancar('{"cliente":"00000000-0000-0000-0000-000000000c41","tipo":"pagar","categoria":"00000000-0000-0000-0000-00000000bd01","descricao":"BD04 x","vencimento":"2027-03-10","valor":80}'::jsonb);

\echo '=================== E (30) estoque da MDC'
set teste.uid = '00000000-0000-0000-0000-000000000e51';
set teste.membro = 'analista';
\echo '--- E1 serviço que controla estoque (deve falhar)'
insert into est_itens (org_id, cliente_id, nome, tipo, controla_estoque) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000c41','BD04 Consultoria','servico',true);
\echo '--- E2 item em outra empresa (deve falhar)'
insert into est_itens (org_id, cliente_id, nome, tipo, controla_estoque, unidade) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1','BD04 Fora','produto',true,'UN');
\echo '=== E3 itens e locais da MDC (esperado: sem erro)'
insert into est_itens (id, org_id, cliente_id, nome, tipo, controla_estoque, unidade) values
 ('00000000-0000-0000-0000-00000000bd11','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000c41','BD04 Parafuso','produto',true,'UN'),
 ('00000000-0000-0000-0000-00000000bd12','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000c41','BD04 Brinde','produto',false,'UN');
insert into est_locais (id, org_id, cliente_id, nome, padrao) values
 ('00000000-0000-0000-0000-00000000bd21','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000c41','BD04 Depósito',true),
 ('00000000-0000-0000-0000-00000000bd22','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000c41','BD04 Loja',false);
\echo '=== E4 entrada 10, transferência 4 para a loja, ajuste do depósito para 5 (esperado: depósito 5, loja 4)'
select est_movimentar('{"item":"00000000-0000-0000-0000-00000000bd11","local":"00000000-0000-0000-0000-00000000bd21","tipo":"entrada","quantidade":10,"custo_unitario":2.5}') is not null as ok;
select est_movimentar('{"item":"00000000-0000-0000-0000-00000000bd11","local":"00000000-0000-0000-0000-00000000bd21","destino":"00000000-0000-0000-0000-00000000bd22","tipo":"transferencia","quantidade":4}') is not null as ok;
select est_movimentar('{"item":"00000000-0000-0000-0000-00000000bd11","local":"00000000-0000-0000-0000-00000000bd21","tipo":"ajuste","quantidade":5}') is not null as ok;
select l.nome, s.saldo from est_saldos s join est_locais l on l.id = s.local_id where l.nome like 'BD04%' order by 1;
\echo '--- E5 saída 12 (deve falhar: insuficiente)'
select est_movimentar('{"item":"00000000-0000-0000-0000-00000000bd11","local":"00000000-0000-0000-0000-00000000bd21","tipo":"saida","quantidade":12}');
\echo '--- E6 movimento em item não estocável (deve falhar)'
select est_movimentar('{"item":"00000000-0000-0000-0000-00000000bd12","local":"00000000-0000-0000-0000-00000000bd21","tipo":"entrada","quantidade":1}');
\echo '--- E7 deixar de controlar com saldo (deve falhar)'
update est_itens set controla_estoque = false where id = '00000000-0000-0000-0000-00000000bd11';
\echo '--- E8 estornar a entrada inicial (deve falhar: ficaria negativo)'
select est_estornar_movimento((select min(m.id) from est_movimentos m where m.item_id = '00000000-0000-0000-0000-00000000bd11'), 'teste do BD-04');
\echo '=== E9 estornar a transferência (esperado: depósito 9, loja 0)'
select est_estornar_movimento((select m.id from est_movimentos m where m.item_id = '00000000-0000-0000-0000-00000000bd11' and m.tipo = 'transferencia' and m.quantidade < 0), 'transferência errada');
select l.nome, s.saldo from est_saldos s join est_locais l on l.id = s.local_id where l.nome like 'BD04%' order by 1;
\echo '--- E10 inserir movimento direto (deve falhar)'
insert into est_movimentos (org_id, cliente_id, item_id, local_id, data, tipo, quantidade) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000c41','00000000-0000-0000-0000-00000000bd11','00000000-0000-0000-0000-00000000bd21',current_date,'entrada',100);
\echo '--- E11 local mudar de empresa (deve falhar)'
update est_locais set cliente_id = '00000000-0000-0000-0000-0000000000c1' where id = '00000000-0000-0000-0000-00000000bd22';
\echo '--- E12 operar libera estoque negativo (deve falhar: só gerir)'
select est_definir_negativo('00000000-0000-0000-0000-000000000c41', true);
\echo '=== E13 gerir libera negativo e sai 20 (esperado: ok, saldo -11)'
set teste.uid = '00000000-0000-0000-0000-000000000e53';
select est_definir_negativo('00000000-0000-0000-0000-000000000c41', true);
select est_movimentar('{"item":"00000000-0000-0000-0000-00000000bd11","local":"00000000-0000-0000-0000-00000000bd21","tipo":"saida","quantidade":20}') is not null as ok;
select sum(s.saldo) as saldo from est_saldos s where s.item_id = '00000000-0000-0000-0000-00000000bd11';
select est_definir_negativo('00000000-0000-0000-0000-000000000c41', false);
\echo '--- E14 gerir libera negativo em outra empresa (deve falhar)'
select est_definir_negativo('00000000-0000-0000-0000-0000000000c1', true);

\echo '=================== X (70) transferência entre contas da MDC'
reset role;
insert into fin_contas_bancarias (id, org_id, cliente_id, nome) values
  ('00000000-0000-0000-0000-00000000bdb2','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000c41','BD04 Sicoob'),
  ('00000000-0000-0000-0000-00000000bdb3','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000c41','BD04 Conta encerrada');
update fin_contas_bancarias set ativo = false where id = '00000000-0000-0000-0000-00000000bdb3';
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-000000000e51';
\echo '=== X1 transferir 500 do Itaú para o Sicoob (esperado: ok; 500,00)'
select fin_transferir('00000000-0000-0000-0000-00000000bdb1','00000000-0000-0000-0000-00000000bdb2','2027-03-01',500.004,'reforço de caixa') is not null as ok;
select valor, estornada from fin_transferencias where origem_id = '00000000-0000-0000-0000-00000000bdb1';
\echo '--- X2 mesma conta (deve falhar)'
select fin_transferir('00000000-0000-0000-0000-00000000bdb1','00000000-0000-0000-0000-00000000bdb1','2027-03-01',10);
\echo '--- X3 conta de outra empresa (deve falhar)'
select fin_transferir('00000000-0000-0000-0000-00000000bdb1','00000000-0000-0000-0000-0000000000b1','2027-03-01',10);
\echo '--- X4 conta inativa (deve falhar)'
select fin_transferir('00000000-0000-0000-0000-00000000bdb1','00000000-0000-0000-0000-00000000bdb3','2027-03-01',10);
\echo '--- X5 valor zero (deve falhar)'
select fin_transferir('00000000-0000-0000-0000-00000000bdb1','00000000-0000-0000-0000-00000000bdb2','2027-03-01',0);
\echo '--- X6 insert direto (deve falhar)'
insert into fin_transferencias (org_id, cliente_id, origem_id, destino_id, data, valor) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000c41','00000000-0000-0000-0000-00000000bdb1','00000000-0000-0000-0000-00000000bdb2','2027-03-02',1);
\echo '--- X7 só ver não transfere (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-000000000e52';
select fin_transferir('00000000-0000-0000-0000-00000000bdb1','00000000-0000-0000-0000-00000000bdb2','2027-03-01',10);
set teste.uid = '00000000-0000-0000-0000-000000000e51';
reset role;
select max(id) as tr from fin_transferencias where origem_id = '00000000-0000-0000-0000-00000000bdb1' \gset
set role authenticated;
\echo '--- X8 estornar sem motivo (deve falhar)'
select fin_estornar_transferencia(:'tr', ' ');
\echo '=== X9 estornar com motivo (esperado: t)'
select fin_estornar_transferencia(:'tr', 'lançada em duplicidade');
select estornada from fin_transferencias where id = :'tr';
\echo '--- X10 estornar de novo (deve falhar)'
select fin_estornar_transferencia(:'tr', 'de novo');
\echo '=== X11 apagar não apaga (esperado: 1)'
delete from fin_transferencias where id = :'tr';
select count(*) as transferencias from fin_transferencias where id = :'tr';

\echo '=================== N (50) nota de entrada da MDC'
reset role;
insert into fin_categorias (id, org_id, cliente_id, tipo, nome, conta_contabil_id) values
 ('00000000-0000-0000-0000-00000000bdf9','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000c41','despesa','BD04 Compras de mercadorias','00000000-0000-0000-0000-000000004101');
set role service_role;
\echo '=== N1 captura grava a nota completa da MDC (esperado: t)'
select fis_gravar_documento('{"cliente":"00000000-0000-0000-0000-000000000c41","origem":"dfe","nsu":901,"caminho":"a1/c41/nfe/2027/03/x.xml",
  "nota":{"modelo":"55","chave":"35270311222333000181550010000056781123456780","conteudo":"completa","numero":"5678","serie":"1",
  "emissao":"2027-03-20T10:15:00-03:00","autorizacao":"2027-03-20T10:16:02-03:00","situacao":"autorizada","tipo_nf":"1",
  "emitente_doc":"11222333000181","emitente_nome":"Fornecedor de Teste","emitente_uf":"SP","destinatario_doc":"48140121000165",
  "valor_total":635,"valor_produtos":600,"cfop_principal":"5102",
  "itens":[{"numero":1,"codigo":"BD-1","descricao":"Parafuso cx 100","ncm":"73181500","cfop":"5102","unidade":"CX","quantidade":10,"valor_unitario":50,"valor_total":500},
           {"numero":2,"codigo":"BD-9","descricao":"Óleo 1L","ncm":"27101932","cfop":"5405","unidade":"UN","quantidade":4,"valor_unitario":25,"valor_total":100}]}}') ? 'nota' as gravou;
\echo '--- N2 nota de outro CNPJ (deve falhar)'
select fis_gravar_documento('{"cliente":"00000000-0000-0000-0000-000000000c41","origem":"dfe","nota":{"modelo":"55","chave":"35270399999999000191550010000000011123456789","conteudo":"completa","emitente_doc":"99999999000191","destinatario_doc":"88888888000191","itens":[]}}');
reset role;
select id as nota from fis_notas where chave = '35270311222333000181550010000056781123456780' \gset
select id as item1 from fis_nota_itens where nota_id = :'nota' and numero = 1 \gset
select id as item2 from fis_nota_itens where nota_id = :'nota' and numero = 2 \gset
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-000000000e51';
\echo '--- N3 a tela não grava documento capturado (deve falhar)'
select fis_gravar_documento('{"cliente":"00000000-0000-0000-0000-000000000c41","nota":{}}');
\echo '--- N4 lançar sem confirmar na SEFAZ (deve falhar)'
select fis_processar_nota(jsonb_build_object('nota', :'nota', 'tipo_entrada', 'revenda'));
reset role;
set role service_role;
select fis_registrar_evento('00000000-0000-0000-0000-000000000c41','{"chave":"35270311222333000181550010000056781123456780","tpEvento":"210200","cStat":"135","protocolo":"891270000000901","registrado_em":"2027-03-21T10:05:00-03:00"}', '<procEventoNFe/>', null) > 0 as confirmou;
reset role;
set role authenticated;
\echo '--- N5 lançar sem ligar os itens ao estoque (deve falhar)'
select fis_processar_nota(jsonb_build_object('nota', :'nota', 'tipo_entrada', 'revenda',
  'categoria', '00000000-0000-0000-0000-00000000bdf9', 'parcelas', '[{"vencimento":"2027-04-20","valor":635}]'::jsonb));
\echo '=== N6 lança como revenda (esperado: 2 títulos, 2 movimentos; 1000 un de parafuso)'
select jsonb_array_length(r->'titulos') as titulos, jsonb_array_length(r->'movimentos') as movimentos from (
  select fis_processar_nota(jsonb_build_object('nota', :'nota', 'tipo_entrada', 'revenda',
  'categoria', '00000000-0000-0000-0000-00000000bdf9',
  'parcelas', '[{"vencimento":"2027-04-20","valor":317.5},{"vencimento":"2027-05-20","valor":317.5}]'::jsonb,
  'itens', jsonb_build_array(
     jsonb_build_object('id', :'item1', 'novo', '{"nome":"BD04 Parafuso unidade","unidade":"UN"}'::jsonb, 'fator', 100),
     jsonb_build_object('id', :'item2', 'novo', '{"nome":"BD04 Óleo 1L"}'::jsonb)))) r) x;
select i.nome, m.quantidade from est_movimentos m join est_itens i on i.id = m.item_id where m.origem = 'nota_entrada' and i.nome like 'BD04%' order by 1;
\echo '--- N7 lançar de novo (deve falhar)'
select fis_processar_nota(jsonb_build_object('nota', :'nota', 'tipo_entrada', 'revenda'));
\echo '=== N8 desfazer: cancela as contas e estorna o estoque (esperado: cancelado 2; estornados 2)'
select fis_desfazer_lancamento(:'nota', 'tipo de entrada errado');
select situacao, count(*) from fin_titulos where nota_id = :'nota' group by 1;
select count(*) filter (where m.estornado) as estornados from est_movimentos m join est_itens i on i.id = m.item_id where m.origem = 'nota_entrada' and i.nome like 'BD04%';
\echo '--- N9 upload em pasta de outra empresa (deve falhar)'
select fis_registrar_upload('{"cliente":"00000000-0000-0000-0000-000000000c41","caminho":"00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-0000000000c1/upload/n.xml","nota":{"chave":"35270312112223330001810000000000000526100000000901"}}');
\echo '--- N10 tipo de entrada da empresa com operar (deve falhar: só gerir)'
select fis_salvar_tipo_entrada('{"cliente":"00000000-0000-0000-0000-000000000c41","codigo":"remessa","gera_pagar":true,"categoria":"00000000-0000-0000-0000-00000000bdf9"}');
\echo '=== N11 Portal (c1) não vê a nota da MDC; sem acesso não vê nada (esperado: 0 e 0)'
set teste.membro = '';
set teste.uid = '00000000-0000-0000-0000-0000000000e2';
select count(*) as notas_mdc_no_portal from fis_notas where cliente_id = '00000000-0000-0000-0000-000000000c41';
set teste.uid = '00000000-0000-0000-0000-0000000000e9';
select count(*) as notas_sem_acesso from fis_notas;
\echo '--- N12 sem acesso desfaz (deve falhar)'
select fis_desfazer_lancamento(:'nota', 'sem acesso');
reset role;
\echo '=== Z auditoria registrou as ações do BD-04 (esperado: > 0)'
select count(*) > 0 as auditou from hub_auditoria where user_id in ('00000000-0000-0000-0000-000000000e51', '00000000-0000-0000-0000-000000000e53');
