\set ON_ERROR_STOP 1
-- Base para a 048 (regras dos contratos; roda por último). Entram:
--  · e48: Contratos operar + Financeiro operar; e49: Contratos gerir com acesso VENCIDO; e40: administrador (membro);
--  · os contratos dos testes anteriores são encerrados (sem os gatilhos), menos o f432 da 045, que sempre falha ao lançar
--    (categoria errada) e serve para provar o aviso de falha no sino (B-08);
--  · índices: IPCA de 03/2029 a 02/2030 (1% ao mês), IGP-M de 03/2029 a 01/2030 negativo (o 02/2030 entra no teste).
insert into membros (org_id, user_id, nome, papel, ativo) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000e48', 'Opera contratos e financeiro', 'analista', true),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000e49', 'Gestora com acesso vencido', 'analista', true),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000e40', 'Administrador', 'admin', true)
on conflict do nothing;
insert into hub_acessos (org_id, user_id, app, papel, expira_em) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000e48', 'contratos', 'operar', null),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000e48', 'financeiro', 'operar', null),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000e49', 'contratos', 'gerir', '2029-01-01')
on conflict do nothing;

set session_replication_role = replica;
update fin_recorrentes set situacao = 'encerrado', situacao_motivo = 'Encerrado para os testes da 048'
 where situacao <> 'encerrado' and id <> '00000000-0000-0000-0000-00000000f432';
update fin_recorrentes set gerar_desde = '2029-01-01', inicio = '2027-12-01' where id = '00000000-0000-0000-0000-00000000f432';
set session_replication_role = origin;

insert into fin_indices (indice, mes, percentual)
select 'IPCA', (date '2029-03-01' + make_interval(months => k))::date, 1 from generate_series(0, 11) k
on conflict (indice, mes) do update set percentual = excluded.percentual;
insert into fin_indices (indice, mes, percentual)
select 'IGP-M', (date '2029-03-01' + make_interval(months => k))::date, -0.5 from generate_series(0, 10) k
on conflict (indice, mes) do update set percentual = excluded.percentual;
