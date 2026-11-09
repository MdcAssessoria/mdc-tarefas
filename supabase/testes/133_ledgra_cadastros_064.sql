-- Testes da 064: quem pode cadastrar empresas e contas bancárias no Ledgra Link pelo HUB (Contratos › gerir).
-- A Função Edge ledgra-link confere link_pode_cadastrar com o login de quem pediu antes de falar com o Ledgra Link.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
set role authenticated;
set teste.membro = 'analista';

\echo '=== L1 quem gere Contratos pode cadastrar (esperado: t)'
set teste.uid = '00000000-0000-0000-0000-000000000e43';
select link_pode_cadastrar('00000000-0000-0000-0000-0000000000a1') as pode;
\echo '=== L2 quem só opera Contratos não cadastra (esperado: f)'
set teste.uid = '00000000-0000-0000-0000-000000000e41';
select link_pode_cadastrar('00000000-0000-0000-0000-0000000000a1') as pode;
\echo '=== L3 quem só vê Contratos não cadastra (esperado: f)'
set teste.uid = '00000000-0000-0000-0000-000000000e42';
select link_pode_cadastrar('00000000-0000-0000-0000-0000000000a1') as pode;
\echo '=== L4 quem é de fora da organização não cadastra (esperado: f)'
set teste.uid = '00000000-0000-0000-0000-00000000ffff';
set teste.membro = '';
select link_pode_cadastrar('00000000-0000-0000-0000-0000000000a1') as pode;

reset role;
set role anon;
\echo '--- L5 visitante sem login chama a conferência (deve falhar)'
select link_pode_cadastrar('00000000-0000-0000-0000-0000000000a1');
reset role;
