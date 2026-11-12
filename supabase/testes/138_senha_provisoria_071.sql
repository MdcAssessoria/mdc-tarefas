-- Testes da 071: senha provisória gerada pelo administrador e troca obrigatória no primeiro acesso.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
set teste.uid = '00000000-0000-0000-0000-000000000e40';
set teste.membro = 'admin';
set role authenticated;
\echo '=== Q1 administrador gera senha provisória: conta pendente, conta ativa (redefinir) e convite sem conta (esperado: t | t | t)'
select hub_pode_senha_provisoria('travado@exemplo.com') as pendente, hub_pode_senha_provisoria('ativo@exemplo.com') as ativa,
       hub_pode_senha_provisoria('sem.conta@exemplo.com') as convite;
reset role;
set teste.membro = 'analista';
set role authenticated;
\echo '=== Q2 quem não é administrador não gera senha da equipe (esperado: f | f)'
select hub_pode_senha_provisoria('travado@exemplo.com') as pendente, hub_pode_senha_provisoria('ativo@exemplo.com') as ativa;
reset role;
set teste.uid = '';
set role authenticated;
\echo '=== Q3 sem login (esperado: f)'
select hub_pode_senha_provisoria('ativo@exemplo.com') as pode;
reset role;
set role anon;
\echo '--- Q4 visitante chama direto (deve falhar)'
select hub_pode_senha_provisoria('ativo@exemplo.com');
reset role;
\echo '=== Q5 senha provisória: aparece como aguardando na lista; depois da troca, ativa (esperado: f, depois t)'
update auth.users set raw_app_meta_data = '{"trocar_senha": true, "provider": "email"}' where email = 'ativo@exemplo.com';
set teste.uid = '00000000-0000-0000-0000-000000000e40';
set teste.membro = 'admin';
set role authenticated;
select s.confirmado as antes from hub_situacao_contas('00000000-0000-0000-0000-0000000000a1') s join membros m using (user_id) where m.nome = 'Ativo';
reset role;
set teste.uid = '00000000-0000-0000-0000-000000000f63';
set role authenticated;
select hub_senha_trocada();
reset role;
set teste.uid = '00000000-0000-0000-0000-000000000e40';
set role authenticated;
select s.confirmado as depois from hub_situacao_contas('00000000-0000-0000-0000-0000000000a1') s join membros m using (user_id) where m.nome = 'Ativo';
reset role;
\echo '=== Q6 a troca só tira a marca da própria conta e mantém o resto (esperado: {"provider": "email"})'
select raw_app_meta_data from auth.users where email = 'ativo@exemplo.com';
set teste.uid = '';
set role authenticated;
\echo '--- Q7 sem login avisa troca (deve falhar)'
select hub_senha_trocada();
reset role;
set role service_role;
\echo '=== Q8 a Função acha a conta pelo e-mail (esperado: t | t)'
select hub_conta_id(' ATIVO@exemplo.com ') = '00000000-0000-0000-0000-000000000f63' as achou, hub_conta_id('ninguem@x.com') is null as vazio;
reset role;
set role authenticated;
\echo '--- Q9 usuário logado procura conta pelo e-mail (deve falhar)'
select hub_conta_id('ativo@exemplo.com');
reset role;
