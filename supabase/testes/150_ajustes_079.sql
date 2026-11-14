-- Testes da 079: membros da família só por função, o único responsável não sai, teto geral do cadastro aberto.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
set teste.membro = '';
select id as fam from organizacoes where nome = 'Família Silva Souza' \gset
select count(*) as antes from membros where org_id = :'fam' \gset
set teste.uid = '00000000-0000-0000-0000-0000000075e1';
set role authenticated;
\echo '--- T1 responsável põe alguém na família direto pela API (deve falhar)'
insert into membros (org_id, user_id, nome, papel) values (:'fam', '00000000-0000-0000-0000-0000000075e3', 'Intruso', 'analista');
\echo '=== T2 responsável muda o papel direto pela API: nada muda (esperado: 0)'
with x as (update membros set papel = 'gestor' where org_id = :'fam' returning 1) select count(*) from x;
\echo '=== T3 apagar membro direto pela API não apaga nada; a família continua visível (esperado: t | t)'
delete from membros where org_id = :'fam';
reset role;
select count(*) = :antes as nada_apagado from membros where org_id = :'fam';
set teste.uid = '00000000-0000-0000-0000-0000000075e1';
set role authenticated;
select count(*) > 0 as ve_a_familia from membros where org_id = :'fam';
\echo '--- T4 o único responsável tenta sair (deve falhar: a família precisa de um responsável)'
select pessoal_remover(:'fam', '00000000-0000-0000-0000-0000000075e1');
reset role;
\echo '=== T5 o responsável continua ativo (esperado: t)'
select ativo from membros where org_id = :'fam' and user_id = '00000000-0000-0000-0000-0000000075e1';
\echo '=== T6 teto geral: com 60 cadastros na hora, um endereço novo é recusado (esperado: f)'
delete from app.pessoal_cadastros;
insert into app.pessoal_cadastros (ip_hash) select md5(g::text) from generate_series(1, 60) g;
select pessoal_cadastro_tentativa('fedcba9876543210fedcba');
\echo '=== T7 abaixo do teto um endereço novo passa (esperado: t)'
delete from app.pessoal_cadastros;
select pessoal_cadastro_tentativa('fedcba9876543210fedcba');
reset role;
\echo '=== T8 na empresa a regra antiga continua: o administrador muda o papel de alguém (esperado: 1)'
select org_id as emp, user_id as pessoa from membros where org_id <> :'fam' and not app.org_pessoal(org_id) and papel <> 'admin' limit 1 \gset
select user_id as adm from membros where org_id = :'emp' and papel = 'admin' and ativo limit 1 \gset
set teste.uid = :'adm';
set role authenticated;
with x as (update membros set nome = nome where org_id = :'emp' and user_id = :'pessoa' returning 1) select count(*) from x;
reset role;
