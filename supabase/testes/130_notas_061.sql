-- Testes da 061: "Notas fiscais" (entradas) de volta ao menu e ordem da Gestão.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
\echo '=== N1 Notas fiscais ligada (esperado: ativo, Notas fiscais)'
select status, nome from hub_apps where slug = 'entradas';
\echo '=== N2 ordem da Gestão (esperado: financeiro, contratos, entradas, relatorios, centros_custo, plano_contas)'
select string_agg(slug, ', ' order by ordem) as ordem_gestao from hub_apps
 where slug in ('financeiro', 'contratos', 'entradas', 'relatorios', 'centros_custo', 'plano_contas') and status = 'ativo';
\echo '=== N3 Estoque, Saídas e Cobrança Ledgra continuam desligados (esperado: 3)'
select count(*) as desligados_3 from hub_apps where slug in ('estoque', 'saidas', 'licencas') and status = 'desligado';
