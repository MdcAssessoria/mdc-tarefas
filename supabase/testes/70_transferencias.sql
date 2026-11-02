-- Testes da migração 034: transferência entre contas bancárias (roda depois de 20_titulos e 30_estoque).
\set VERBOSITY terse
reset role;
insert into fin_contas_bancarias (id, org_id, cliente_id, nome) values
  ('00000000-0000-0000-0000-0000000007b2','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1','Sicoob'),
  ('00000000-0000-0000-0000-0000000007b3','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1','Conta encerrada'),
  ('00000000-0000-0000-0000-0000000007b4','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c2','Banco do Cliente 2');
update fin_contas_bancarias set ativo = false where id = '00000000-0000-0000-0000-0000000007b3';
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-0000000000e1';
set teste.papel = 'operar';
\echo '--- transferir 500 do Itaú para o Sicoob'
select fin_transferir('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000007b2','2026-03-01',500.004,'reforço de caixa') is not null as ok;
select valor, observacao, estornada from fin_transferencias;
\echo '--- mesma conta (deve falhar)'
select fin_transferir('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b1','2026-03-01',10);
\echo '--- conta de outra empresa (deve falhar)'
select fin_transferir('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000007b4','2026-03-01',10);
\echo '--- conta inativa (deve falhar)'
select fin_transferir('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000007b3','2026-03-01',10);
\echo '--- valor zero (deve falhar)'
select fin_transferir('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000007b2','2026-03-01',0);
\echo '--- insert direto (deve falhar)'
insert into fin_transferencias (org_id, cliente_id, origem_id, destino_id, data, valor) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000007b2','2026-03-02',1);
\echo '--- só ver não transfere (deve falhar)'
set teste.papel = 'ver';
select fin_transferir('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000007b2','2026-03-01',10);
set teste.papel = 'operar';
\echo '--- estornar sem motivo (deve falhar)'
select fin_estornar_transferencia((select max(id) from fin_transferencias), ' ');
\echo '--- estornar com motivo'
select fin_estornar_transferencia((select max(id) from fin_transferencias), 'lançada em duplicidade');
select estornada, estorno_motivo from fin_transferencias;
\echo '--- estornar de novo (deve falhar)'
select fin_estornar_transferencia((select max(id) from fin_transferencias), 'de novo');
\echo '--- apagar (deve apagar 0)'
delete from fin_transferencias;
select count(*) transferencias from fin_transferencias;
\echo '--- auditoria registrou transferir e estornar'
reset role;
select acao from hub_auditoria where acao like '%transfer%' order by id;
\echo '--- módulos novos no menu'
select slug, rota from hub_apps where slug in ('entradas','saidas','estoque','centros_custo','plano_contas','relatorios') order by ordem;
