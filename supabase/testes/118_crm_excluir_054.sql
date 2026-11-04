-- Testes da 054: excluir lead de vez (só quem gere o Comercial, com motivo, nunca cliente nem contrato assinado).
-- Blocos "(deve falhar)" terminam em ERROR; os demais não podem ter ERROR.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;

\echo '--- X1 anônimo tenta excluir (deve falhar)'
set role anon;
select crm_excluir(array['00000000-0000-0000-0000-0000000054a1']::uuid[], 'lead de teste');
set role authenticated;
\echo '--- X2 quem só opera o Comercial tenta excluir (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-000000000e54';
set teste.membro = 'analista';
set teste.papel = 'operar';
select crm_excluir(array['00000000-0000-0000-0000-0000000054a1']::uuid[], 'lead de teste');
\echo '--- X3 quem gere tenta apagar direto pela tabela (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-0000000000e5';
set teste.membro = 'gestor';
set teste.papel = 'gerir';
delete from crm_oportunidades where id = '00000000-0000-0000-0000-0000000054a1';
\echo '--- X4 quem gere exclui sem motivo (deve falhar)'
select crm_excluir(array['00000000-0000-0000-0000-0000000054a1']::uuid[], 'ok');
\echo '--- X5 quem gere tenta excluir quem já é cliente (deve falhar)'
select crm_excluir(array['00000000-0000-0000-0000-0000000054a3']::uuid[], 'lead de teste');
\echo '--- X6 quem gere tenta excluir lead com contrato assinado (deve falhar)'
select crm_excluir(array['00000000-0000-0000-0000-0000000054a4']::uuid[], 'lead de teste');
\echo '--- X7 lote com um cliente no meio: nada é excluído (deve falhar)'
select crm_excluir(array['00000000-0000-0000-0000-0000000054a2', '00000000-0000-0000-0000-0000000054a3']::uuid[], 'limpeza de teste');

\echo '=== X8 depois das recusas, as 4 oportunidades continuam (esperado: 4)'
reset role;
select count(*) as continuam_4 from crm_oportunidades where id::text like '%54a_';
\echo '=== X9 quem gere exclui o lead de teste e o duplicado, com histórico e rascunho (esperado: 2)'
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-0000000000e5';
set teste.membro = 'gestor';
set teste.papel = 'gerir';
select crm_excluir(array['00000000-0000-0000-0000-0000000054a1', '00000000-0000-0000-0000-0000000054a2']::uuid[], 'lead de teste duplicado') as excluidas_2;
\echo '=== X10 sumiram com atividades e rascunho; cliente e assinado ficam; retrato na auditoria (esperado: 0, 0, 0, 2, t)'
reset role;
select (select count(*) from crm_oportunidades where id in ('00000000-0000-0000-0000-0000000054a1', '00000000-0000-0000-0000-0000000054a2')) as oportunidades_0,
       (select count(*) from crm_atividades where oportunidade_id = '00000000-0000-0000-0000-0000000054a1') as atividades_0,
       (select count(*) from crm_contratos where oportunidade_id = '00000000-0000-0000-0000-0000000054a1') as contratos_0,
       (select count(*) from crm_oportunidades where id in ('00000000-0000-0000-0000-0000000054a3', '00000000-0000-0000-0000-0000000054a4')) as ficam_2,
       (select jsonb_array_length(antes->'atividades') = 1 and depois->>'motivo' = 'lead de teste duplicado'
          from hub_auditoria where acao = 'excluir_oportunidade' and alvo = '00000000-0000-0000-0000-0000000054a1' and antes ? 'atividades') as retrato_t;
\echo '=== X11 depois da exclusão, apagar direto continua proibido (esperado: nada_se_apaga ativo)'
select count(*) as gatilho_1 from pg_trigger where tgname = 'nada_se_apaga' and tgrelid = 'public.crm_oportunidades'::regclass;
