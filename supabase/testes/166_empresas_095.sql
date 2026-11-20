-- Testes da 095: empresas que usam o sistema em cada licença e a leitura pelo servidor do sistema com a chave.
-- Usa a licença do EXato do cliente c3 (chave EXA-TESTE-00000, da 160) e os clientes de exemplo da 162.
-- Blocos "(deve falhar)" terminam em ERROR com mensagem em português; os demais sem ERROR.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
set teste.membro = 'analista';
select id as k_exato from lic_contratos
 where cliente_id = '00000000-0000-0000-0000-0000000000c3' and sistema = 'exato' and situacao = 'ativo' limit 1 \gset

set role anon;
\echo '=== E1 sem empresas marcadas: só o cliente da licença (esperado: ativa, 1 empresa, da_licenca = true)'
select r->>'situacao' as situacao, jsonb_array_length(r->'empresas') as qtd, r->'empresas'->0->>'da_licenca' as da_licenca
  from lic_empresas('exato', 'EXA-TESTE-00000', '11.222.333/0001-81') r;
\echo '=== E2 chave errada, sistema errado e CNPJ de outro (esperado: invalida, invalida, cnpj_diferente; sem empresas)'
select lic_empresas('exato', 'EXA-ERRADA-0000', '11222333000181') as chave_errada,
       lic_empresas('ledgra', 'EXA-TESTE-00000', '11222333000181') as outro_sistema,
       lic_empresas('exato', 'EXA-TESTE-00000', '99888777000130') as outro_cnpj;

reset role;
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-0000000085e1';
\echo '--- E3 quem só vê marca empresas (deve falhar)'
select lic_contrato_empresas_definir(:'k_exato', array['00000000-0000-0000-0000-0000000092c1']::uuid[]);
\echo '--- E4 gravar direto na tabela (deve falhar)'
insert into lic_contrato_empresas (contrato_id, cliente_id, org_id)
values (:'k_exato', '00000000-0000-0000-0000-0000000092c1', '00000000-0000-0000-0000-0000000000a1');

set teste.uid = '00000000-0000-0000-0000-0000000085e2';
\echo '--- E5 cliente inativo (deve falhar)'
select lic_contrato_empresas_definir(:'k_exato', array['00000000-0000-0000-0000-0000000092c3']::uuid[]);
\echo '--- E6 cliente de outra organização (deve falhar)'
select lic_contrato_empresas_definir(:'k_exato', array['00000000-0000-0000-0000-0000000092c5']::uuid[]);
\echo '=== E7 operar marca Alfa e Beta (e repete o cliente da licença, que não entra na lista) (esperado: 2)'
select lic_contrato_empresas_definir(:'k_exato', array['00000000-0000-0000-0000-0000000092c1', '00000000-0000-0000-0000-0000000092c2',
  '00000000-0000-0000-0000-0000000000c3']::uuid[]) as marcadas;

reset role;
set role anon;
\echo '=== E8 o EXato lê: o cliente da licença primeiro, depois Alfa e Beta; só os campos do cadastro (esperado: 3; CNPJ só números)'
select e->>'razao_social' as razao, e->>'cnpj' as cnpj, e->>'da_licenca' as da_licenca,
       (select array_agg(k order by k) from jsonb_object_keys(e) k) as campos
  from jsonb_array_elements(lic_empresas('exato', 'EXA-TESTE-00000', '11222333000181')->'empresas') e;

reset role;
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-0000000085e2';
\echo '=== E9 troca a lista: fica só Beta (esperado: 1)'
select lic_contrato_empresas_definir(:'k_exato', array['00000000-0000-0000-0000-0000000092c2']::uuid[]) as marcadas;
\echo '=== E10 quem vê a licença lê a lista (esperado: BETA 092 SERVICOS LTDA)'
set teste.uid = '00000000-0000-0000-0000-0000000085e1';
select c.razao_social from lic_contrato_empresas e join clientes c on c.id = e.cliente_id where e.contrato_id = :'k_exato';

reset role;
\echo '=== E11 permissões: lic_empresas aberta ao anon; definir não (esperado: t, f)'
select has_function_privilege('anon', 'public.lic_empresas(text,text,text)', 'execute') as empresas_anon,
       has_function_privilege('anon', 'public.lic_contrato_empresas_definir(uuid,uuid[])', 'execute') as definir_anon;
