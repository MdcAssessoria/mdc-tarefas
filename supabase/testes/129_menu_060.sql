-- Testes da 060: Cobrança Ledgra desligada (nada apagado) e ordem do grupo Gestão.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
\echo '=== M1 Cobrança Ledgra desligada (esperado: desligado)'
select status from hub_apps where slug = 'licencas';
\echo '=== M2 grupo Gestão na ordem nova (esperado: financeiro, contratos, relatorios, centros_custo, plano_contas)'
select string_agg(slug, ', ' order by ordem) as ordem_gestao from hub_apps
 where slug in ('financeiro', 'contratos', 'relatorios', 'centros_custo', 'plano_contas') and status <> 'desligado';
\echo '=== M3 nada apagado: as tabelas da Cobrança Ledgra continuam (esperado: t)'
select to_regclass('public.lic_contratos') is not null as lic_contratos;
