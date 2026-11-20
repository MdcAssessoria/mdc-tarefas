-- Testes da 093: busca de clientes pelo código do Domínio com 1 ou 2 dígitos.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
set role service_role;
\echo '=== B1 código de 1 dígito (esperado: ZETA, só ela; ALFA e outros com 7 no CNPJ ficam de fora)'
select razao_social, codigo_dominio from integracao_clientes_buscar('7');
\echo '=== B2 código de 2 dígitos de cliente inativo (esperado: 0 linhas)'
select count(*) as inativa from integracao_clientes_buscar('41');
\echo '=== B3 código curto que não existe (esperado: 0 linhas)'
select count(*) as nao_existe from integracao_clientes_buscar('99');
\echo '=== B4 texto curto continua sem busca (esperado: 0 linhas para "ab" e "7a")'
select (select count(*) from integracao_clientes_buscar('ab')) as letras,
       (select count(*) from integracao_clientes_buscar('7a')) as misto;
\echo '=== B5 o resto da 092 continua igual (esperado: BETA pelo código 9202; ALFA por parte do CNPJ 666.777)'
select razao_social from integracao_clientes_buscar('9202');
select razao_social from integracao_clientes_buscar('666.777');
reset role;
set role authenticated;
\echo '--- B6 usuário com login busca código curto (deve falhar)'
select * from integracao_clientes_buscar('7');
reset role;
