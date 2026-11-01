\set ON_ERROR_STOP 0
\set VERBOSITY terse
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-0000000000e1';
set teste.papel = 'operar';
\echo '--- serviço que controla estoque (deve falhar)'
insert into est_itens (org_id, cliente_id, nome, tipo, controla_estoque) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1','Consultoria','servico',true);
insert into est_itens (id, org_id, cliente_id, nome, tipo, controla_estoque, unidade) values
 ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1','Parafuso','produto',true,'UN'),
 ('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1','Brinde','produto',false,'UN');
insert into est_locais (id, org_id, cliente_id, nome, padrao) values
 ('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1','Depósito',true),
 ('00000000-0000-0000-0000-000000000022','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1','Loja',false);
\echo '--- entrada 10'
select est_movimentar('{"item":"00000000-0000-0000-0000-000000000011","local":"00000000-0000-0000-0000-000000000021","tipo":"entrada","quantidade":10,"custo_unitario":2.5}');
\echo '--- saída 12 (deve falhar: insuficiente)'
select est_movimentar('{"item":"00000000-0000-0000-0000-000000000011","local":"00000000-0000-0000-0000-000000000021","tipo":"saida","quantidade":12}');
\echo '--- transferência 4 para loja'
select est_movimentar('{"item":"00000000-0000-0000-0000-000000000011","local":"00000000-0000-0000-0000-000000000021","destino":"00000000-0000-0000-0000-000000000022","tipo":"transferencia","quantidade":4}');
\echo '--- ajuste depósito para 5 (sistema 6)'
select est_movimentar('{"item":"00000000-0000-0000-0000-000000000011","local":"00000000-0000-0000-0000-000000000021","tipo":"ajuste","quantidade":5}');
\echo '--- movimento em item não estocável (deve falhar)'
select est_movimentar('{"item":"00000000-0000-0000-0000-000000000012","local":"00000000-0000-0000-0000-000000000021","tipo":"entrada","quantidade":1}');
\echo '--- saída interna em item não estocável (passa sem mexer)'
reset role;
select app.est_saida('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000021',null,3,'pedido_venda','x') is null as nao_mexeu;
set role authenticated;
select l.nome, s.saldo from est_saldos s join est_locais l on l.id = s.local_id order by 1;
\echo '--- deixar de controlar com saldo (deve falhar)'
update est_itens set controla_estoque = false where id = '00000000-0000-0000-0000-000000000011';
\echo '--- estornar a entrada inicial (deve falhar: ficaria negativo)'
select est_estornar_movimento((select min(id) from est_movimentos), 'teste');
\echo '--- estornar transferência (par)'
select est_estornar_movimento((select id from est_movimentos where tipo='transferencia' and quantidade < 0), 'errado');
select l.nome, s.saldo from est_saldos s join est_locais l on l.id = s.local_id order by 1;
\echo '--- inserir movimento direto (deve falhar)'
insert into est_movimentos (org_id, cliente_id, item_id, local_id, data, tipo, quantidade) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000021',current_date,'entrada',100);
\echo '--- (030 A-2) estoque mudar de empresa (deve falhar)'
update est_locais set cliente_id = '00000000-0000-0000-0000-0000000000c2' where id = '00000000-0000-0000-0000-000000000022';
\echo '--- gerir libera negativo e sai 20'
set teste.papel = 'gerir';
select est_definir_negativo('00000000-0000-0000-0000-0000000000c1', true);
select est_movimentar('{"item":"00000000-0000-0000-0000-000000000011","local":"00000000-0000-0000-0000-000000000021","tipo":"saida","quantidade":20}') is not null as ok;
select sum(saldo) from est_saldos;
