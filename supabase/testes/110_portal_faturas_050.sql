-- Testes da 050: Portal › Faturas (lista com NFS-e e boleto, XML da nota no bucket fiscal só para o próprio cliente).
-- Blocos "(deve falhar)" terminam em ERROR com mensagem em português; os demais não podem ter ERROR.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;

\echo '=== P1 cliente c1 vê as faturas dele com a NFS-e de produção e o boleto (esperado: nota 9001, boleto itau com linha e Pix em 1 ou mais, nenhuma nota de teste)'
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-000000000e46';
set teste.membro = '';
select count(*) > 0 as tem_faturas,
       count(*) filter (where x->'nfse'->>'numero' = '9001') as nota_producao_1,
       count(*) filter (where x->'nfse'->>'numero' = '9003') as nota_teste_0,
       count(*) filter (where x->'boleto'->>'banco' = 'itau' and x->'boleto'->>'linha_digitavel' <> '' and x->'boleto'->>'pix_copia_cola' <> '') > 0 as boleto_com_linha,
       count(*) filter (where x->'tomador'->>'nome' is not null) = count(*) as tomador_em_todas,
       count(*) filter (where x->>'contrato' is not null) = count(*) as contrato_em_todas
  from jsonb_array_elements(portal_faturas_detalhe('00000000-0000-0000-0000-0000000000c1')) x;
select count(*) as nao_ve_fatura_do_c3_0 from jsonb_array_elements(portal_faturas_detalhe('00000000-0000-0000-0000-0000000000c1')) x
 where x->'nfse'->>'numero' = '9002';

\echo '--- P2 cliente c1 pede as faturas do c3 (deve falhar)'
select portal_faturas_detalhe('00000000-0000-0000-0000-0000000000c3');
\echo '--- P3 login do Portal sem a permissão documentos (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-0000000000e2';
select portal_faturas_detalhe('00000000-0000-0000-0000-0000000000c1');
\echo '--- P4 quem não é do Portal (equipe sem acesso de cliente) pede as faturas (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-000000000e41';
set teste.membro = 'analista';
select portal_faturas_detalhe('00000000-0000-0000-0000-0000000000c1');

\echo '=== P5 bucket fiscal: o c1 lê só o XML da nota de produção dele (esperado: 1 arquivo, nota-c1.xml)'
set teste.uid = '00000000-0000-0000-0000-000000000e46';
set teste.membro = '';
select count(*) as arquivos_1, string_agg(split_part(name, '/', 6), ',') as nomes from storage.objects where bucket_id = 'fiscal';
\echo '=== P6 o c3 lê só o dele (esperado: nota-c3.xml)'
set teste.uid = '00000000-0000-0000-0000-000000000e47';
select string_agg(split_part(name, '/', 6), ',') as nomes from storage.objects where bucket_id = 'fiscal';
\echo '=== P7 login sem documentos não lê nenhum XML (esperado: 0)'
set teste.uid = '00000000-0000-0000-0000-0000000000e2';
select count(*) as arquivos_0 from storage.objects where bucket_id = 'fiscal';
\echo '=== P8 a fatura cancelada some do Portal e o XML dela também (esperado: 0 e 0)'
reset role;
set session_replication_role = replica;
update fin_faturas set situacao = 'cancelada', cancelamento_motivo = 'teste', cancelada_em = now()
 where id = (select fatura_id from nfse_emissoes where id = '00000000-0000-0000-0000-00000000a502');
set session_replication_role = origin;
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-000000000e47';
select count(*) as arquivos_0 from storage.objects where bucket_id = 'fiscal';
select count(*) as faturas_canceladas_0 from jsonb_array_elements(portal_faturas_detalhe('00000000-0000-0000-0000-0000000000c3')) x
 where x->'nfse'->>'numero' = '9002';
\echo '--- P9 a função interna não é chamada direto (deve falhar)'
select app.portal_fatura_publicada('00000000-0000-0000-0000-00000000a501', '00000000-0000-0000-0000-0000000000c1');
reset role;
