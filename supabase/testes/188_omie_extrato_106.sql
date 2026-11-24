-- Testes da 106 (movimentos do extrato do Omie, achado ARQ-01 da auditoria de 21/11/2026) no Postgres temporário.
-- Prova: ninguém logado grava em omie_extrato (só a Função omie-sincronizar, com a chave de serviço) e quem está logado
-- lê só as empresas que app.bi_pode_ver libera. No fim, uma chamada de bi_indicadores (111) sobre a mesma base.
-- Blocos "(deve falhar)" terminam em ERROR; os demais sem ERROR.
\set ON_ERROR_STOP 0
\set VERBOSITY terse
reset role;
set teste.membro = '';
set teste.papel = '';

-- dados como a Função gravaria: Cliente 1 e Cliente 2 (organização a1) e Eps (organização a2)
insert into omie_extrato (cliente_id, org_id, conta_corrente, lancamento, mes, data, valor, natureza, dados) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 'cc1', 'L1', '2026-10-01', '2026-10-05', 100, 'R', '{}'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 'cc1', 'L2', '2026-10-01', '2026-10-06', -40, 'P', '{}'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a1', 'cc2', 'L1', '2026-10-01', '2026-10-07', 70, 'R', '{}'),
  ('00000000-0000-0000-0000-0000000092c5', '00000000-0000-0000-0000-0000000000a2', 'cc9', 'L1', '2026-10-01', '2026-10-08', 55, 'R', '{}');
\echo '--- X1 mês que não é o dia 1 (deve falhar)'
insert into omie_extrato (cliente_id, org_id, conta_corrente, lancamento, mes, dados)
values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 'cc1', 'L3', '2026-10-15', '{}');

-- analista e4 com o BI liberado (bi_gestao ver) e responsável só pelo Cliente 1
insert into hub_acessos (org_id, user_id, app, papel)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e4', 'bi_gestao', 'ver')
on conflict (org_id, user_id, app) do update set papel = 'ver', expira_em = null;
insert into cliente_responsaveis (org_id, cliente_id, setor_id, user_id)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', gen_random_uuid(),
        '00000000-0000-0000-0000-0000000000e4');

set role authenticated;
set teste.uid = '00000000-0000-0000-0000-0000000000e1';
\echo '=== X2 administrador da organização a1 lê as duas empresas dela e não a da a2 (esperado: 3 linhas, 2 empresas, 0 da a2)'
select count(*) as linhas, count(distinct cliente_id) as empresas,
       count(*) filter (where org_id = '00000000-0000-0000-0000-0000000000a2') as da_a2 from omie_extrato;
\echo '--- X3 administrador grava direto (deve falhar)'
insert into omie_extrato (cliente_id, org_id, conta_corrente, lancamento, mes, dados)
values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 'cc1', 'X', '2026-10-01', '{}');
\echo '--- X4 administrador muda um valor (deve falhar)'
update omie_extrato set valor = 1 where lancamento = 'L1';
\echo '--- X5 administrador apaga o mês (deve falhar)'
delete from omie_extrato where mes = '2026-10-01';

set teste.uid = '00000000-0000-0000-0000-0000000000e4';
\echo '=== X6 analista responsável só pelo Cliente 1 (esperado: 2 linhas, todas do Cliente 1)'
select count(*) as linhas, bool_and(cliente_id = '00000000-0000-0000-0000-0000000000c1') as so_cliente_1 from omie_extrato;

set teste.uid = '00000000-0000-0000-0000-0000000000e3';
\echo '=== X7 analista sem o BI liberado (esperado: 0 linhas)'
select count(*) as linhas from omie_extrato;

reset role;
set role anon;
\echo '--- X8 sem login (deve falhar)'
select count(*) from omie_extrato;

reset role;
\echo '=== X9 nada mudou com as tentativas (esperado: 4 linhas, soma 185.00)'
select count(*) as linhas, sum(valor) as soma from omie_extrato;

-- 111: bi_indicadores roda sobre a base simulada (um título a receber pago em parte)
insert into omie_movimentos (cliente_id, org_id, chave, codigo_titulo, natureza, categoria_codigo, status, emissao, registro,
                             vencimento, pagamento, valor_documento, valor_pago) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 'T1|0|0|', 'T1', 'R', '1.01.01', 'A VENCER',
   '2026-10-01', '2026-10-01', '2026-10-30', null, 1000, 0),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 'T1|B1', 'T1', 'R', '1.01.01', 'RECEBIDO',
   '2026-10-01', '2026-10-01', '2026-10-30', '2026-10-10', 0, 400);
set role authenticated;
set teste.uid = '00000000-0000-0000-0000-0000000000e1';
\echo '=== X10 bi_indicadores do Cliente 1 em outubro (esperado: object, corte 2026-10-31)'
select jsonb_typeof(r) as tipo, r->>'corte' as corte
  from public.bi_indicadores(array['00000000-0000-0000-0000-0000000000c1']::uuid[], '2026-10-01', '2026-10-31', true) r;
set teste.uid = '00000000-0000-0000-0000-0000000000e3';
\echo '--- X11 bi_indicadores sem o BI liberado (deve falhar)'
select public.bi_indicadores(array['00000000-0000-0000-0000-0000000000c1']::uuid[], '2026-10-01', '2026-10-31', true);
reset role;
