-- Testes da 066: código interno do retransmissor da NFS-e (gerado pelo banco; Função lê, site só confere).
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
\echo '=== R1 o banco gerou o código (64 letras hexadecimais) (esperado: t)'
select exists (select 1 from vault.secrets where name = 'nfse_relay_token' and secret ~ '^[0-9a-f]{64}$') as gerado;
set role service_role;
\echo '=== R2 a Função (service_role) lê o código (esperado: 64)'
select length(nfse_relay_token()) as tamanho;
select nfse_relay_token() as tk \gset
reset role;
set role anon;
\echo '=== R3 o site confere: certo = t, errado = f, vazio = f'
select nfse_relay_confere(:'tk') as certo, nfse_relay_confere(repeat('0', 64)) as errado, nfse_relay_confere(null) as vazio;
\echo '--- R4 visitante sem login lê o código (deve falhar)'
select nfse_relay_token();
reset role;
set role authenticated;
\echo '--- R5 usuário com login lê o código (deve falhar)'
select nfse_relay_token();
reset role;
