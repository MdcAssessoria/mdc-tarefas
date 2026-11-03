-- Testes da 044: painel de certificados (cofre do HUB) e a conferência da Função Edge antes de ir ao Ledgra Link.
-- Blocos "(deve falhar)" terminam em ERROR com mensagem em português; os demais sem ERROR.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
set role authenticated;

\echo '=== C1 administrador vê os dois certificados do cofre do HUB, sem arquivo nem senha (esperado: 2 linhas, demonstrativos e notas)'
set teste.uid = '00000000-0000-0000-0000-0000000000e1';
set teste.membro = 'admin';
select origem, titular, documento, (valido_ate < now()) as vencido from cert_painel('00000000-0000-0000-0000-0000000000a1');
\echo '=== C2 a resposta não tem coluna de arquivo/senha (esperado: 0)'
select count(*) as colunas_secretas from information_schema.routines r
  join information_schema.parameters p on p.specific_name = r.specific_name
 where r.routine_name = 'cert_painel' and p.parameter_name ~ '(pfx|senha|secret)';
\echo '=== C3 administrador pode buscar os certificados bancários (esperado: t)'
select link_pode_ver_certificados('00000000-0000-0000-0000-0000000000a1') as pode;

\echo '--- C4 quem não é da organização abre o painel (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-00000000ffff';
set teste.membro = '';
select * from cert_painel('00000000-0000-0000-0000-0000000000a1');
\echo '=== C5 quem não é da organização não busca no Ledgra Link (esperado: f)'
select link_pode_ver_certificados('00000000-0000-0000-0000-0000000000a1') as pode;

reset role;
set role anon;
\echo '--- C6 visitante sem login chama o painel (deve falhar)'
select * from cert_painel('00000000-0000-0000-0000-0000000000a1');
reset role;
set role authenticated;
