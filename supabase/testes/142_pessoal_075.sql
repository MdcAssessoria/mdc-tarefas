-- Testes da 075: MDC - Pessoal (criar família, tipo fixo, isolamento entre famílias, trava do cadastro aberto).
-- Blocos "(deve falhar)" terminam em ERROR com mensagem em português; os demais sem ERROR.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
set teste.membro = '';
set teste.uid = '00000000-0000-0000-0000-0000000075e1';
set role authenticated;
\echo '--- P1 nome curto demais (deve falhar)'
select pessoal_criar_familia('ab');
\echo '=== P2 cria a família (esperado: fam- | pessoal | admin | Ana Família | t | 25 | 37)'
select left(pessoal_criar_familia('Família Silva'), 4) as slug;
reset role;
select o.tipo, m.papel, m.nome, o.gestao_cliente_id = c.id as gestao_e_a_familia,
       (select count(*) from fin_categorias f where f.org_id = o.id) as categorias, (select count(*) from fin_plano_contas p where p.org_id = o.id) as contas
  from organizacoes o join membros m on m.org_id = o.id join clientes c on c.org_id = o.id
 where o.nome = 'Família Silva';
set role authenticated;
\echo '=== P3 família com Tarefas e Finanças liberadas para a dona (esperado: financeiro,tarefas)'
reset role;
select string_agg(app, ',' order by app) from hub_acessos where user_id = '00000000-0000-0000-0000-0000000075e1';
set role authenticated;
\echo '--- P4 trocar o tipo da organização pela tela (deve falhar)'
update organizacoes set tipo = 'empresa' where nome = 'Família Silva';
\echo '=== P5 mais duas famílias e a quarta é barrada (a última deve falhar)'
select pessoal_criar_familia('Família Dois') is not null as ok;
select pessoal_criar_familia('Família Três') is not null as ok;
select pessoal_criar_familia('Família Quatro');
reset role;
set teste.uid = '00000000-0000-0000-0000-0000000075e2';
set role authenticated;
\echo '=== P6 o limite de 3 é por conta: outra pessoa ainda cria (ver P7)'
\echo '=== P7 sem e-mail no nome: membro leva a parte antes do @ (esperado: familia.dois)'
select pessoal_criar_familia('Casa do Dois') is not null as ok;
select nome from membros where org_id = (select id from organizacoes where nome = 'Casa do Dois');
\echo '--- P8 navegador chamando a trava do cadastro (deve falhar)'
select pessoal_cadastro_tentativa('0123456789abcdef0123');
reset role;
\echo '=== P9 trava do cadastro: 5 por hora e a sexta recusada (esperado: t,t,t,t,t,f)'
select string_agg(pessoal_cadastro_tentativa('0123456789abcdef0123')::text, ',') from generate_series(1, 6);
\echo '--- P10 visitante sem login cria família (deve falhar)'
set role anon;
select pessoal_criar_familia('Família Anônima');
reset role;
-- ===== convites da família (código de uso único) e travas
reset role;
set teste.uid = '00000000-0000-0000-0000-0000000075e1';
set role authenticated;
\echo '--- P11 convite do HUB numa família (deve falhar)'
reset role;
insert into app.convites (org_id, email) select id, 'qualquer@exemplo.com' from organizacoes where nome = 'Família Silva';
\echo '--- P12 membro entrando direto na família (deve falhar)'
insert into membros (org_id, user_id, nome, papel) select id, '00000000-0000-0000-0000-0000000075e2', 'Intruso', 'analista' from organizacoes where nome = 'Família Silva';
\echo '=== P13 a dona convida a Bia para lançar (esperado: código XXXX-XXXX)'
set role authenticated;
select pessoal_convidar((select id from organizacoes where nome = 'Família Silva'), 'Bia', 'lancar') ~ '^[A-Z2-9]{4}-[A-Z2-9]{4}$' as codigo_ok;
\echo '--- P14 quem não é responsável convida (deve falhar)'
reset role;
set teste.uid = '00000000-0000-0000-0000-0000000075e2';
set role authenticated;
select pessoal_convidar((select id from organizacoes where nome = 'Família Silva'), 'Intrusa', 'lancar');
\echo '--- P15 código errado (deve falhar)'
select pessoal_aceitar_convite('AAAA-AAAA');
\echo '=== P16 aceitar o convite certo: entra como analista com Tarefas e Finanças em operar (esperado: analista | financeiro:operar,tarefas:operar)'
reset role;
set teste.uid = '00000000-0000-0000-0000-0000000075e1';
set role authenticated;
select pessoal_convidar((select id from organizacoes where nome = 'Família Silva'), 'Dois', 'lancar') as c \gset
reset role;
set teste.uid = '00000000-0000-0000-0000-0000000075e2';
set role authenticated;
select left(pessoal_aceitar_convite(:'c'), 4) as slug;
reset role;
select m.papel, (select string_agg(app || ':' || papel, ',' order by app) from hub_acessos a where a.org_id = m.org_id and a.user_id = m.user_id) acessos
  from membros m where m.user_id = '00000000-0000-0000-0000-0000000075e2' and m.org_id = (select id from organizacoes where nome = 'Família Silva');
set role authenticated;
\echo '--- P17 usar o mesmo convite de novo (deve falhar)'
select pessoal_aceitar_convite(:'c');
reset role;
\echo '=== P18 responsável passa a Dois para só consultar (esperado: financeiro:ver,tarefas:ver)'
set teste.uid = '00000000-0000-0000-0000-0000000075e1';
set role authenticated;
select pessoal_definir_permissao((select id from organizacoes where nome = 'Família Silva'), '00000000-0000-0000-0000-0000000075e2', 'consultar');
reset role;
select string_agg(app || ':' || papel, ',' order by app) from hub_acessos where user_id = '00000000-0000-0000-0000-0000000075e2' and org_id = (select id from organizacoes where nome = 'Família Silva');
set role authenticated;
\echo '--- P19 mudar a própria permissão (deve falhar)'
select pessoal_definir_permissao((select id from organizacoes where nome = 'Família Silva'), '00000000-0000-0000-0000-0000000075e1', 'consultar');
\echo '=== P20 tirar a Dois da família (esperado: f | 0)'
select pessoal_remover((select id from organizacoes where nome = 'Família Silva'), '00000000-0000-0000-0000-0000000075e2');
reset role;
select ativo, (select count(*) from hub_acessos where user_id = '00000000-0000-0000-0000-0000000075e2' and org_id = m.org_id) acessos
  from membros m where user_id = '00000000-0000-0000-0000-0000000075e2' and org_id = (select id from organizacoes where nome = 'Família Silva');
\echo '=== P21 senha provisória do HUB não vale para quem está numa família (esperado: f)'
set role authenticated;
select hub_pode_senha_provisoria('familia.dois@exemplo.com') as pode;
reset role;
\echo '=== P22 responsável troca o nome da família (esperado: Família Silva Souza)'
set teste.uid = '00000000-0000-0000-0000-0000000075e1';
set role authenticated;
select pessoal_renomear((select id from organizacoes where nome = 'Família Silva'), 'Família Silva Souza');
reset role;
select nome from organizacoes where nome = 'Família Silva Souza';
\echo '--- P23 quem não é responsável troca o nome (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-0000000075e2';
set role authenticated;
select pessoal_renomear((select id from organizacoes where nome = 'Família Silva Souza'), 'Invadida');
reset role;
