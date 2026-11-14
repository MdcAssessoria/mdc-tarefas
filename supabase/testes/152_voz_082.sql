-- Testes da 082: lançar falando (quem pode mandar a fala para a IA e o limite de uso).
-- Blocos "(deve falhar)" terminam em ERROR com mensagem em português; os demais sem ERROR.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
set teste.membro = '';
select id as fam from organizacoes where nome = 'Família Silva Souza' \gset
set teste.uid = '00000000-0000-0000-0000-0000000075e1';
set role authenticated;
\echo '=== V1 a responsável da família pode (esperado: ok)'
select pessoal_voz_pode(:'fam');
\echo '--- V2 quem não é da família (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-0000000075e2';
select pessoal_voz_pode(:'fam');
\echo '--- V3 organização que não é família (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-0000000075e1';
select pessoal_voz_pode((select id from organizacoes where tipo <> 'pessoal' limit 1));
\echo '--- V4 lê a tabela de uso direto (deve falhar)'
select count(*) from app.pessoal_voz_uso;
\echo '=== V5 passou de 30 na hora: limite (esperado: limite_hora)'
reset role;
insert into app.pessoal_voz_uso (user_id, org_id) select '00000000-0000-0000-0000-0000000075e1', :'fam' from generate_series(1, 29);
set teste.uid = '00000000-0000-0000-0000-0000000075e1';
set role authenticated;
select pessoal_voz_pode(:'fam');
\echo '--- V6 visitante sem login (deve falhar)'
reset role;
set role anon;
select pessoal_voz_pode(:'fam');
reset role;
