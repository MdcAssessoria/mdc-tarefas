\set ON_ERROR_STOP 0
\set VERBOSITY terse
set role authenticated;
\echo '--- (035) equipe só com Estoque (operar) acessa os dados de gestão'
set teste.membro = 'analista';
set teste.uid = '00000000-0000-0000-0000-0000000000e7';
select app.fin_pode('00000000-0000-0000-0000-0000000000c1', 'operar') as estoque_opera;
select app.fin_pode('00000000-0000-0000-0000-0000000000c1', 'gerir') as estoque_gerir_falso;
select app.hub_pode('00000000-0000-0000-0000-0000000000a1', 'licencas', 'ver') as nao_ve_licencas;
\echo '--- (035) equipe sem módulo de gestão não acessa'
set teste.uid = '00000000-0000-0000-0000-0000000000e8';
select app.fin_pode('00000000-0000-0000-0000-0000000000c1', 'ver') as tarefas_nao_ve;
\echo '--- (035) quem não é membro não acessa'
set teste.membro = '';
select app.fin_pode('00000000-0000-0000-0000-0000000000c1', 'ver') as fora_nao_ve;
reset role;
