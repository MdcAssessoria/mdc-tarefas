\set ON_ERROR_STOP 0
\set VERBOSITY terse
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-0000000000e1';
set teste.papel = 'operar';
\echo '--- categoria em conta sintética (deve falhar)'
insert into fin_categorias (org_id, cliente_id, tipo, nome, conta_contabil_id) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1','despesa','X','00000000-0000-0000-0000-000000000003');
\echo '--- categoria com conta de outro cliente (deve falhar)'
insert into fin_categorias (org_id, cliente_id, tipo, nome, conta_contabil_id) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1','despesa','X','00000000-0000-0000-0000-000000000004');
\echo '--- categorias certas'
insert into fin_categorias (id, org_id, cliente_id, tipo, nome, conta_contabil_id) values
 ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1','despesa','Aluguel','00000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1','receita','Vendas','00000000-0000-0000-0000-000000000002');
insert into fin_contas_bancarias (id, org_id, cliente_id, nome) values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1','Itaú');
insert into fin_pessoas (id, org_id, cliente_id, tipo, nome, documento) values ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1','fornecedor','Imobiliária','12345678000199');
\echo '--- pessoa com documento repetido (deve falhar)'
insert into fin_pessoas (org_id, cliente_id, tipo, nome, documento) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1','fornecedor','Dup','12345678000199');
\echo '--- lançar 3 parcelas de 1000,00'
select fin_lancar('{"cliente":"00000000-0000-0000-0000-0000000000c1","tipo":"pagar","pessoa":"00000000-0000-0000-0000-0000000000f1","categoria":"00000000-0000-0000-0000-0000000000d1","descricao":"Aluguel","vencimento":"2026-01-31","valor":1000,"parcelas":3}'::jsonb) is not null as ok;
select parcela, vencimento, valor, descricao from fin_titulos order by parcela;
\echo '--- categoria de receita em conta a pagar (deve falhar)'
select fin_lancar('{"cliente":"00000000-0000-0000-0000-0000000000c1","tipo":"pagar","categoria":"00000000-0000-0000-0000-0000000000d2","descricao":"x","vencimento":"2026-01-31","valor":10}'::jsonb);
\echo '--- insert direto já quitado (deve falhar)'
insert into fin_titulos (org_id, cliente_id, tipo, categoria_id, descricao, vencimento, valor, valor_pago, situacao) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1','pagar','00000000-0000-0000-0000-0000000000d1','x','2026-01-01',10,10,'quitado');
\echo '--- update direto da situação (deve falhar)'
update fin_titulos set situacao = 'quitado' where parcela = 1;
\echo '--- baixa parcial 200 + juros 5'
select fin_baixar((select id from fin_titulos where parcela = 1), '2026-02-01', 200, '00000000-0000-0000-0000-0000000000b1', 5, 0, 0, 'pix', null);
\echo '--- baixa acima do saldo (deve falhar)'
select fin_baixar((select id from fin_titulos where parcela = 1), '2026-02-01', 200, '00000000-0000-0000-0000-0000000000b1');
\echo '--- reduzir valor abaixo do pago (deve falhar)'
update fin_titulos set valor = 100 where parcela = 1;
\echo '--- cancelar com pagamento (deve falhar)'
select fin_cancelar_titulo((select id from fin_titulos where parcela = 1), 'teste');
\echo '--- quitar o resto com desconto 3,33'
select fin_baixar((select id from fin_titulos where parcela = 1), '2026-02-02', 133.33, '00000000-0000-0000-0000-0000000000b1', 0, 0, 3.33);
select parcela, valor, valor_pago, situacao, quitado_em from fin_titulos where parcela = 1;
select valor, juros, desconto, total from fin_baixas order by id;
\echo '--- editar título quitado (deve falhar)'
update fin_titulos set descricao = 'y' where parcela = 1;
\echo '--- estornar 2a baixa'
select fin_estornar_baixa((select max(id) from fin_baixas), 'errado');
select parcela, valor_pago, situacao from fin_titulos where parcela = 1;
\echo '--- lançar à vista já pago (entrada)'
select fin_lancar('{"cliente":"00000000-0000-0000-0000-0000000000c1","tipo":"receber","categoria":"00000000-0000-0000-0000-0000000000d2","descricao":"Venda balcão","vencimento":"2026-02-05","valor":50,"pago":{"data":"2026-02-05","conta":"00000000-0000-0000-0000-0000000000b1"}}'::jsonb) is not null as ok;
select tipo, situacao, valor_pago from fin_titulos where tipo='receber';
\echo '--- cancelar parcela 3'
select fin_cancelar_titulo((select id from fin_titulos where parcela = 3 and tipo='pagar'), 'acordo');
\echo '--- apagar (deve apagar 0)'
delete from fin_titulos;
select count(*) titulos from fin_titulos;
\echo '--- (030 A-2) fornecedor mudar de empresa (deve falhar)'
update fin_pessoas set cliente_id = '00000000-0000-0000-0000-0000000000c2' where id = '00000000-0000-0000-0000-0000000000f1';
\echo '--- (030 M-1) valor igual ao já pago (deve falhar)'
update fin_titulos set valor = 200 where parcela = 1 and tipo = 'pagar';
\echo '--- (030 M-4) fornecedor digitado na hora: cria uma vez e reaproveita'
select fin_lancar('{"cliente":"00000000-0000-0000-0000-0000000000c1","tipo":"pagar","pessoa_nome":"Posto Novo","categoria":"00000000-0000-0000-0000-0000000000d1","descricao":"Combustível","vencimento":"2026-03-10","valor":100}'::jsonb) is not null as ok;
select fin_lancar('{"cliente":"00000000-0000-0000-0000-0000000000c1","tipo":"pagar","pessoa_nome":"posto novo","categoria":"00000000-0000-0000-0000-0000000000d1","descricao":"Combustível 2","vencimento":"2026-03-11","valor":90}'::jsonb) is not null as ok;
select count(*) as postos_cadastrados from fin_pessoas where lower(nome) = 'posto novo';
\echo '--- (030 M-4) lançamento que falha não deixa fornecedor (deve falhar)'
select fin_lancar('{"cliente":"00000000-0000-0000-0000-0000000000c1","tipo":"pagar","pessoa_nome":"Fantasma","categoria":"00000000-0000-0000-0000-0000000000d2","descricao":"x","vencimento":"2026-03-11","valor":90}'::jsonb);
select count(*) as fantasma from fin_pessoas where nome = 'Fantasma';
\echo '--- portal: usuário do cliente vê c1, não vê c2'
set teste.papel = '';
set teste.uid = '00000000-0000-0000-0000-0000000000e2';
select count(*) as ve_c1 from fin_titulos;
select count(*) as contas_portal from fin_contas_bancarias;
\echo '--- portal cria categoria em outra empresa (deve falhar)'
insert into fin_categorias (org_id, cliente_id, tipo, nome, conta_contabil_id) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c2','despesa','Hack','00000000-0000-0000-0000-000000000004');
\echo '--- (030 M-2) portal cria categoria na própria empresa (deve falhar)'
insert into fin_categorias (org_id, cliente_id, tipo, nome, conta_contabil_id) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1','despesa','Do cliente','00000000-0000-0000-0000-000000000001');
\echo '--- portal lança no c1 (ok)'
select fin_lancar('{"cliente":"00000000-0000-0000-0000-0000000000c1","tipo":"pagar","categoria":"00000000-0000-0000-0000-0000000000d1","descricao":"Luz","vencimento":"2026-03-10","valor":80}'::jsonb) is not null as ok;
\echo '--- portal muda regra de estoque (deve falhar)'
select est_definir_negativo('00000000-0000-0000-0000-0000000000c1', true);
\echo '--- sem acesso nenhum'
set teste.uid = '00000000-0000-0000-0000-0000000000e9';
select count(*) as nada from fin_titulos;
\echo '--- sem acesso nenhum lança (deve falhar)'
select fin_lancar('{"cliente":"00000000-0000-0000-0000-0000000000c1","tipo":"pagar","categoria":"00000000-0000-0000-0000-0000000000d1","descricao":"x","vencimento":"2026-03-10","valor":80}'::jsonb);
reset role;
select acao, count(*) from hub_auditoria group by acao order by 1;
