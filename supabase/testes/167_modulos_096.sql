-- Testes da 096: módulos de cada empresa na licença (EXato da c3, chave EXA-TESTE-00000; Beta 092c2 marcada na 166).
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
set teste.membro = 'analista';
select id as k_exato from lic_contratos
 where cliente_id = '00000000-0000-0000-0000-0000000000c3' and sistema = 'exato' and situacao = 'ativo' limit 1 \gset

set role authenticated;
set teste.uid = '00000000-0000-0000-0000-0000000085e1';
\echo '--- M1 quem só vê muda módulos (deve falhar)'
select lic_contrato_empresa_modulos_definir(:'k_exato', '00000000-0000-0000-0000-0000000092c2', array['rs']);
\echo '=== M2 quem vê lê o pacote (esperado: tem rs e crm, com nome sem o prefixo do sistema)'
select m->>'modulo' as modulo, m->>'nome' as nome from jsonb_array_elements(lic_contrato_modulos(:'k_exato')) m
 where m->>'modulo' in ('rs', 'crm');

set teste.uid = '00000000-0000-0000-0000-0000000085e2';
\echo '--- M3 empresa fora da licença (Alfa, tirada na 166) (deve falhar)'
select lic_contrato_empresa_modulos_definir(:'k_exato', '00000000-0000-0000-0000-0000000092c1', array['rs']);
\echo '--- M4 módulo fora do pacote (deve falhar)'
select lic_contrato_empresa_modulos_definir(:'k_exato', '00000000-0000-0000-0000-0000000092c2', array['rs', 'inventado']);
\echo '--- M5 gravar direto na tabela (deve falhar)'
insert into lic_contrato_empresa_modulos (contrato_id, cliente_id, org_id, modulos)
values (:'k_exato', '00000000-0000-0000-0000-0000000092c2', '00000000-0000-0000-0000-0000000000a1', array['rs']);
\echo '=== M6 Beta só com CRM (maiúscula/espaço/repetido limpos); o cliente da licença só com R&S (esperado: 1, 1)'
select lic_contrato_empresa_modulos_definir(:'k_exato', '00000000-0000-0000-0000-0000000092c2', array['CRM', ' crm ']) as beta,
       lic_contrato_empresa_modulos_definir(:'k_exato', '00000000-0000-0000-0000-0000000000c3', array['rs']) as da_licenca;

reset role;
set role anon;
\echo '=== M7 o EXato lê: pacote, usuários e módulos por empresa (esperado: c3 [rs], Beta [crm])'
select r->'modulos' as pacote, r ? 'usuarios_incluidos' as tem_usuarios,
       (select jsonb_agg(jsonb_build_object('cnpj', e->>'cnpj', 'modulos', e->'modulos')) from jsonb_array_elements(r->'empresas') e) as empresas
  from lic_empresas('exato', 'EXA-TESTE-00000', '11222333000181') r;

reset role;
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-0000000085e2';
\echo '=== M8 vazio volta a todos; tirar Beta da licença tira a escolha dela (esperado: 2 = pacote do teste, 0 marcadas, 0 linhas da Beta e da c3)'
select lic_contrato_empresa_modulos_definir(:'k_exato', '00000000-0000-0000-0000-0000000000c3', '{}') as todos_do_pacote;
select lic_contrato_empresas_definir(:'k_exato', '{}') as marcadas;
reset role;
select count(*) filter (where cliente_id = '00000000-0000-0000-0000-0000000092c2') as linhas_beta,
       count(*) filter (where cliente_id = '00000000-0000-0000-0000-0000000000c3') as linhas_c3
  from lic_contrato_empresa_modulos;
\echo '=== M9 permissões (esperado: f, f, f)'
select has_function_privilege('anon', 'public.lic_contrato_empresa_modulos_definir(uuid,uuid,text[])', 'execute') as definir_anon,
       has_function_privilege('anon', 'public.lic_contrato_modulos(uuid)', 'execute') as pacote_anon,
       has_function_privilege('authenticated', 'app.lic_modulos_do_contrato(uuid)', 'execute') as app_auth;
