-- Testes da 071: pedido de "esqueci a senha" com limite (só a Função, como service_role).
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
set role service_role;
\echo '=== P1 conta existente: pode mandar (esperado: t)'
select hub_pedir_senha(' Ativo@Exemplo.com ') as pode;
\echo '=== P2 e-mail sem conta: não manda, mas o pedido conta para o limite (esperado: f)'
select hub_pedir_senha('ninguem@exemplo.com') as pode;
\echo '=== P3 e-mail inválido (esperado: f)'
select hub_pedir_senha('nao-e-email') as pode;
\echo '=== P4 quarto pedido na mesma hora para o mesmo e-mail: barrado (esperado: t, t, f)'
select hub_pedir_senha('ativo@exemplo.com') as segundo, hub_pedir_senha('ativo@exemplo.com') as terceiro, hub_pedir_senha('ativo@exemplo.com') as quarto;
reset role;
\echo '=== P5 pedidos guardados com o e-mail em minúsculas (esperado: 3 | 1)'
select count(*) filter (where email = 'ativo@exemplo.com') as ativo, count(*) filter (where email = 'ninguem@exemplo.com') as ninguem from app.senha_pedidos;
set role anon;
\echo '--- P6 visitante chama direto (deve falhar)'
select hub_pedir_senha('ativo@exemplo.com');
reset role;
set role authenticated;
\echo '--- P7 usuário logado chama direto (deve falhar)'
select hub_pedir_senha('ativo@exemplo.com');
\echo '--- P8 usuário logado lê os pedidos (deve falhar)'
select count(*) from app.senha_pedidos;
reset role;
