-- Testes da 062: tabela oficial serviço × NBS (Anexo VIII) e atualização só pela Função (chave de serviço).
-- e48 = Contratos operar; e40 = administrador. Blocos "(deve falhar)" terminam em ERROR.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
\echo '=== T1 carga inicial: 997 pares em 208 itens, versão 1.02.00'
select count(*) as pares_997, count(distinct item) as itens_208, (select versao from fis_tabelas where tabela = 'anexo_viii') as versao
  from fis_lc116_nbs;
set role authenticated;
set teste.membro = 'analista';
set teste.uid = '00000000-0000-0000-0000-000000000e48';
\echo '=== T2 contabilidade (17.19.01): só os 3 NBS da lei (esperado: 113022100, 113022200, 113022300; atividade 7 = Anexo III)'
select x->>'nbs' as nbs, x->>'ativ_sn' as ativ from jsonb_array_elements(fis_nbs_do_servico('17.19.01')->'nbs') x;
\echo '=== T3 aceita o código sem pontos e o item (esperado: 3 e 3)'
select jsonb_array_length(fis_nbs_do_servico('171901')->'nbs') as com_codigo, jsonb_array_length(fis_nbs_do_servico('17.19')->'nbs') as com_item;
\echo '=== T4a código completo do grupo 99 (locação de imóvel 99.03.01): acha pelo código (esperado: 99.03.01, maior que 0)'
select fis_nbs_do_servico('990301')->>'item' as item, jsonb_array_length(fis_nbs_do_servico('990301')->'nbs') > 0 as tem;
\echo '=== T4 serviço que não existe: lista vazia (esperado: 0)'
select jsonb_array_length(fis_nbs_do_servico('99.99.99')->'nbs') as vazio_0;
\echo '--- T5 usuário do site grava na tabela (deve falhar)'
insert into fis_lc116_nbs (item, nbs, versao) values ('17.19', '999999999', '9.9.9');
\echo '--- T6 usuário do site chama a carga (deve falhar)'
select fis_tabela_carregar('anexo_viii', '9.0.0', null, null, '[]'::jsonb);
\echo '--- T7 usuário do site lê o token do agendador (deve falhar)'
select fis_tabelas_token_confere('x');
reset role;
set role anon;
\echo '--- T8 sem login consulta o NBS (deve falhar)'
select fis_nbs_do_servico('17.19.01');
reset role;
set role service_role;
\echo '--- T9 Função tenta carregar versão igual à atual (deve falhar: "não é mais nova")'
select fis_tabela_carregar('anexo_viii', '1.02.00', null, null, '[]'::jsonb);
\echo '--- T10 Função tenta carregar planilha com poucas linhas (deve falhar: "formato pode ter mudado")'
select fis_tabela_carregar('anexo_viii', '1.03.00', null, null, '[{"item":"17.19","nbs":"1.1302.21.00"}]'::jsonb);
\echo '=== T11 Função carrega versão nova com 600 linhas: troca tudo, guarda a versão e avisa no sino (esperado: 1.03.00, 600, t)'
select (fis_tabela_carregar('anexo_viii', '1.03.00', '2026-11-30', 'teste',
  (select jsonb_agg(jsonb_build_object('item', lpad((g % 99 + 1)::text, 2, '0') || '.' || lpad((g / 99 + 1)::text, 2, '0'),
                                       'nbs', lpad(g::text, 9, '1'), 'nbs_descricao', 'NBS ' || g, 'ativ_sn', '7'))
     from generate_series(1, 600) g))->>'versao') as versao_nova;
reset role;
select (select versao from fis_tabelas where tabela = 'anexo_viii') as versao, count(*) as linhas,
       exists (select 1 from hub_notificacoes where titulo = 'Tabela NBS atualizada') as avisou
  from fis_lc116_nbs;
\echo '=== T12 Função registra a conferência sem versão nova (esperado: t)'
set role service_role;
select fis_tabela_conferida('anexo_viii', 'Sem versão nova no portal') is null as ok;
reset role;
select ultima_mensagem = 'Sem versão nova no portal' and conferida_em is not null as registrou from fis_tabelas;
