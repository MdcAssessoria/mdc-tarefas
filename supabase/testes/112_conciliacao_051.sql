-- Testes da 051: conciliação do extrato (ligar a pagamentos e contas, criar lançamento, transferência, ignorar,
-- desfazer, travas de permissão e de empresa). Blocos "(deve falhar)" terminam em ERROR com mensagem em português;
-- os demais não podem ter ERROR.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
select max(id) filter (where chave = 'L1') as l1, max(id) filter (where chave = 'L2') as l2, max(id) filter (where chave = 'L3') as l3,
       max(id) filter (where chave = 'L4') as l4, max(id) filter (where chave = 'L5') as l5, max(id) filter (where chave = 'L6') as l6,
       max(id) filter (where chave = 'L7') as l7, max(id) filter (where chave = 'L8') as l8, max(id) filter (where chave = 'X1') as x1
  from fin_extrato_linhas \gset
select id as baixa_l8 from fin_baixas where titulo_id = '00000000-0000-0000-0000-0000000051a5' \gset

\echo '=== C1 quem opera o Financeiro lê a tela (esperado: 7 linhas no Banco MDC, 4 contas em aberto ou mais, 1 pagamento sem extrato)'
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-000000000e44';
set teste.membro = 'analista';
select jsonb_array_length(d->'linhas') as linhas_7,
       (select count(*) from jsonb_array_elements(d->'titulos') t where t->>'id' like '%51a%') as contas_abertas_4,
       jsonb_array_length(d->'baixas') as pagamentos_sem_extrato_1, d->>'pode_operar' as pode_operar_true
  from fin_conciliacao_dados('00000000-0000-0000-0000-00000000b401', '2030-10-01', '2030-10-31') d;

\echo '--- C2 quem só vê Contratos lê a tela de conciliação (deve falhar)'
set teste.uid = '00000000-0000-0000-0000-000000000e42';
select fin_conciliacao_dados('00000000-0000-0000-0000-00000000b401', '2030-10-01', '2030-10-31');
\echo '--- C3 quem só vê Contratos tenta ignorar um lançamento (deve falhar)'
select fin_extrato_ignorar(:l6, 'tentativa sem acesso');

\echo '=== C4 L1 (+1.500) com a conta a receber de 1.500 (esperado: conciliado, conta quitada, baixa ligada à linha)'
set teste.uid = '00000000-0000-0000-0000-000000000e44';
select fin_conciliar(:l1, jsonb_build_object('titulos', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-0000000051a1')))) ? 'conciliacao' as ok;
select (select situacao from fin_extrato_linhas where id = :l1) as conciliado,
       (select situacao from fin_titulos where id = '00000000-0000-0000-0000-0000000051a1') as quitado,
       (select count(*) from fin_baixas where extrato_linha_id = :l1) as baixas_ligadas_1;

\echo '--- C5 conciliar a L1 de novo (deve falhar)'
select fin_conciliar(:l1, jsonb_build_object('titulos', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-0000000051a4'))));
\echo '--- C6 L2 (−500) só com a conta de 300: a soma não bate (deve falhar)'
select fin_conciliar(:l2, jsonb_build_object('titulos', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-0000000051a2'))));
\echo '--- C6b L2 (saída) com uma conta a receber (deve falhar)'
select fin_conciliar(:l2, jsonb_build_object('titulos', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-0000000051a4'))));

\echo '=== C7 L2 (−500) com as duas contas a pagar (300 + 200) num só débito (esperado: 2 itens, as duas quitadas)'
select jsonb_array_length(fin_conciliar(:l2, jsonb_build_object('titulos', jsonb_build_array(
         jsonb_build_object('id', '00000000-0000-0000-0000-0000000051a2'), jsonb_build_object('id', '00000000-0000-0000-0000-0000000051a3'))))->'itens') as itens_2;
select count(*) filter (where situacao = 'quitado') as quitadas_2 from fin_titulos
 where id in ('00000000-0000-0000-0000-0000000051a2', '00000000-0000-0000-0000-0000000051a3');

\echo '--- C8 L3 criar lançamento sem descrição (deve falhar)'
select fin_conciliar_lancar(:l3, jsonb_build_object('categoria', '00000000-0000-0000-0000-00000000d401'));
\echo '=== C9 L3 (−80) criar lançamento a partir da linha (esperado: conta a pagar de 80 quitada no dia 08/10, conciliada)'
select fin_conciliar_lancar(:l3, jsonb_build_object('categoria', '00000000-0000-0000-0000-00000000d401', 'descricao', 'Tarifa bancária',
         'pessoa_nome', 'Banco MDC')) ? 'titulo' as ok;
select t.tipo as pagar, t.valor as valor_80, t.situacao as quitado, t.vencimento as dia_08, l.situacao as conciliado
  from fin_extrato_linhas l join fin_baixas b on b.extrato_linha_id = l.id join fin_titulos t on t.id = b.titulo_id where l.id = :l3;

\echo '--- C10 L4 transferência para a própria conta (deve falhar)'
select fin_conciliar_transferir(:l4, '00000000-0000-0000-0000-00000000b401');
\echo '=== C11 L4 (−1.000) vira transferência para o Santander (esperado: transferência de 1.000 do Banco MDC para o Santander)'
select (fin_conciliar_transferir(:l4, '00000000-0000-0000-0000-00000000b402'))->>'transferencia' as transf \gset
select origem_id = '00000000-0000-0000-0000-00000000b401' as origem_ok, destino_id = '00000000-0000-0000-0000-00000000b402' as destino_ok, valor as valor_1000
  from fin_transferencias where id = :transf;
\echo '=== C12 L5 (+1.000, Santander) concilia com a mesma transferência (esperado: aparece nos dados do Santander e concilia)'
select count(*) as transferencia_disponivel_1 from jsonb_array_elements(
         fin_conciliacao_dados('00000000-0000-0000-0000-00000000b402', '2030-10-01', '2030-10-31')->'transferencias') x where (x->>'id')::bigint = :transf;
select fin_conciliar(:l5, jsonb_build_object('transferencias', jsonb_build_array(:transf))) ? 'conciliacao' as ok;
select tipo as transferencia from fin_conciliacoes where linha_id = :l5 and not desfeita;
\echo '--- C13 estornar a transferência já conciliada (deve falhar)'
select fin_estornar_transferencia(:transf, 'teste de estorno');

\echo '--- C14 ignorar a L6 com motivo curto (deve falhar)'
select fin_extrato_ignorar(:l6, 'abc');
\echo '=== C15 ignorar a L6 com motivo (esperado: ignorado)'
select fin_extrato_ignorar(:l6, 'Depósito de teste do banco, devolvido') ? 'conciliacao' as ok;
select situacao as ignorado from fin_extrato_linhas where id = :l6;

\echo '=== C16 L7 (+1.520) com a conta de 1.500 e 20 de juros (esperado: baixa de 1.500 + 20 de juros, total 1.520)'
select fin_conciliar(:l7, jsonb_build_object('titulos', jsonb_build_array(
         jsonb_build_object('id', '00000000-0000-0000-0000-0000000051a4', 'valor', 1500, 'juros', 20)))) ? 'conciliacao' as ok;
select b.valor as valor_1500, b.juros as juros_20, b.total as total_1520 from fin_baixas b where b.extrato_linha_id = :l7;

\echo '--- C17 L8 com uma conta já quitada (deve falhar)'
select fin_conciliar(:l8, jsonb_build_object('titulos', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-0000000051a2'))));
\echo '=== C18 L8 (−250) com o pagamento que já existia (esperado: conciliado, sem baixa nova)'
select fin_conciliar(:l8, jsonb_build_object('baixas', jsonb_build_array(:baixa_l8))) ? 'conciliacao' as ok;
select count(*) as baixas_do_condominio_1 from fin_baixas where titulo_id = '00000000-0000-0000-0000-0000000051a5';
\echo '--- C19 estornar o pagamento conciliado (deve falhar)'
select fin_estornar_baixa(:baixa_l8, 'teste de estorno');

\echo '--- C20 conciliar a linha de outra empresa (deve falhar)'
select fin_extrato_ignorar(:x1, 'linha de outra empresa');
\echo '--- C21 gravar a conciliação direto na tabela (deve falhar)'
insert into fin_conciliacoes (org_id, cliente_id, conta_id, linha_id, tipo, valor)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000c41', '00000000-0000-0000-0000-00000000b401', :l6, 'ignorado', 50);
\echo '=== C22 mudar a situação da linha direto não muda nada (esperado: continua ignorado)'
update fin_extrato_linhas set situacao = 'pendente' where id = :l6;
select situacao as ignorado from fin_extrato_linhas where id = :l6;

\echo '--- C23 desfazer sem motivo (deve falhar)'
select fin_conciliacao_desfazer(:l1, '');
\echo '=== C24 desfazer a L1 (esperado: a conciliar; o recebimento continua, sem extrato; 1 lançado aqui)'
select (fin_conciliacao_desfazer(:l1, 'Conciliei com a conta errada'))->>'lancados_aqui' as lancados_aqui_1;
select (select situacao from fin_extrato_linhas where id = :l1) as pendente,
       (select count(*) from fin_baixas where extrato_linha_id = :l1) as ligadas_0,
       (select situacao from fin_titulos where id = '00000000-0000-0000-0000-0000000051a1') as continua_quitado,
       (select count(*) from fin_conciliacoes where linha_id = :l1 and desfeita) as desfeitas_1;
\echo '=== C25 a L1 volta a conciliar com o recebimento que ficou (esperado: conciliado)'
select id as baixa_l1 from fin_baixas where titulo_id = '00000000-0000-0000-0000-0000000051a1' and not estornada \gset
select fin_conciliar(:l1, jsonb_build_object('baixas', jsonb_build_array(:baixa_l1))) ? 'conciliacao' as ok;
\echo '--- C26 desfazer a importação com lançamentos conciliados (deve falhar)'
select fin_desfazer_lote('00000000-0000-0000-0000-0000000051b1', 'importei errado');

\echo '=== C27 saldos de outubro no Banco MDC (esperado: extrato 1240, HUB 1190, diferença 50 = o depósito ignorado)'
select d->'saldos'->>'extrato' as extrato_1240, d->'saldos'->>'hub' as hub_1190, d->'saldos'->>'diferenca' as diferenca_50,
       (select count(*) from jsonb_array_elements(d->'linhas') x where x->>'situacao' = 'pendente') as a_conciliar_0
  from fin_conciliacao_dados('00000000-0000-0000-0000-00000000b401', '2030-10-01', '2030-10-31') d;

\echo '--- C28 apagar uma conciliação, mesmo como dono do banco (deve falhar)'
reset role;
delete from fin_conciliacoes where linha_id = :l6;
\echo '--- C29 a função interna não é chamada direto (deve falhar)'
set role authenticated;
select app.fin_conciliar_ligar(:l6, 'ignorado', '{}', '{}', 'x');
reset role;
