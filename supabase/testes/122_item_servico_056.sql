-- Testes da 056: item de serviço guarda o código nacional da NFS-e (LC 116), o NBS e o ISS; produto nunca guarda.
-- Blocos "(deve falhar)" terminam em ERROR; os demais não podem ter ERROR.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-000000000e51';
set teste.membro = 'analista';

\echo '--- S1 código do serviço com 4 números (deve falhar)'
select est_salvar_item('{"cliente":"00000000-0000-0000-0000-000000000c41","nome":"Honorários","tipo":"servico","unidade":"SV",
  "controla_estoque":false,"servico_codigo":"17.19"}'::jsonb);
\echo '--- S2 ISS acima do teto de 5% (deve falhar)'
select est_salvar_item('{"cliente":"00000000-0000-0000-0000-000000000c41","nome":"Honorários","tipo":"servico","unidade":"SV",
  "controla_estoque":false,"servico_codigo":"17.19.01","iss_aliquota":"6"}'::jsonb);
\echo '--- S3 NBS com tamanho errado (deve falhar)'
select est_salvar_item('{"cliente":"00000000-0000-0000-0000-000000000c41","nome":"Honorários","tipo":"servico","unidade":"SV",
  "controla_estoque":false,"servico_codigo":"171901","nbs":"1.1302"}'::jsonb);
\echo '--- S4 quem só vê o Financeiro cadastra serviço (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-000000000e52';
select est_salvar_item('{"cliente":"00000000-0000-0000-0000-000000000c41","nome":"Honorários","tipo":"servico","unidade":"SV",
  "controla_estoque":false,"servico_codigo":"171901"}'::jsonb);
set teste.uid = '00000000-0000-0000-0000-000000000e51';

\echo '=== S5 serviço de contabilidade com código, NBS e ISS (esperado: 171901, 113021000, 2.00)'
select est_salvar_item('{"cliente":"00000000-0000-0000-0000-000000000c41","nome":"S056 Honorários contábeis","tipo":"servico",
  "unidade":"SV","controla_estoque":false,"servico_codigo":"17.19.01","nbs":"1.1302.10.00","iss_aliquota":"2"}'::jsonb) as servico \gset
reset role;
select servico_codigo, nbs, iss_aliquota from est_itens where id = :'servico';
select count(*) as auditado_1 from hub_auditoria where acao = 'item_incluir' and alvo = :'servico' and depois->>'servico_codigo' = '171901';
set role authenticated;
\echo '=== S6 editar sem mandar os campos limpa o código (a tela sempre manda o que está na janela) (esperado: t)'
select est_salvar_item(jsonb_build_object('id', :'servico', 'cliente', '00000000-0000-0000-0000-000000000c41', 'nome', 'S056 Honorários contábeis',
  'tipo', 'servico', 'unidade', 'SV', 'controla_estoque', false, 'servico_codigo', '171901')) is not null as editado;
reset role;
select servico_codigo = '171901' and nbs is null and iss_aliquota is null as so_codigo from est_itens where id = :'servico';
set role authenticated;
\echo '=== S7 produto com código de serviço: o banco ignora (esperado: t)'
select est_salvar_item('{"cliente":"00000000-0000-0000-0000-000000000c41","nome":"S056 Parafuso","tipo":"produto","unidade":"UN",
  "controla_estoque":false,"servico_codigo":"171901","iss_aliquota":"2"}'::jsonb) as produto \gset
reset role;
select servico_codigo is null and iss_aliquota is null as produto_sem_servico from est_itens where id = :'produto';
\echo '--- S8 gravar código de serviço em produto direto na tabela (deve falhar)'
update est_itens set servico_codigo = '171901' where id = :'produto';
