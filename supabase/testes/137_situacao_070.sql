-- Testes da 070: lista de Acessos conta como ativa só quem já criou a senha (usa as contas da 136).
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
\echo '=== V7 (070) lista de Acessos: ativa só quem criou a senha (esperado: Ativo t; Pendente f; Travado f)'
set teste.uid = '00000000-0000-0000-0000-000000000e40';
set teste.membro = 'admin';
set role authenticated;
select m.nome, s.confirmado from hub_situacao_contas('00000000-0000-0000-0000-0000000000a1') s join membros m using (user_id)
 where m.nome in ('Ativo', 'Pendente', 'Travado') order by m.nome;
reset role;
set teste.membro = 'analista';
set role authenticated;
\echo '=== V8 (070) quem não é administrador não vê a situação das contas (esperado: 0)'
select count(*) from hub_situacao_contas('00000000-0000-0000-0000-0000000000a1');
reset role;
