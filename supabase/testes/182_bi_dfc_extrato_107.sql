-- Testes da 107 (DFC pelo extrato). Rodam NA PRODUÇÃO dentro de begin…rollback; nada fica gravado.
-- Esperado: a variação do caixa do grupo em out–21/nov/2026 (sem eliminar entre as empresas) = variação dos bancos.
create temp table _r(k text, v text) on commit drop;
grant all on _r to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"17391d29-62ee-4353-8818-8ee0edcdc0e9","role":"authenticated"}', true);
insert into _r select 't1_variacao_dfc', round(sum(valor))::text from public.bi_relatorio('dfc',
  array['128cce4c-cb86-414c-8096-c786c320cff0','2bfba338-901a-46ce-8b0d-fdc5163169da','5db45b1b-bc87-44c1-bf5a-5a115f6dec30']::uuid[],
  '2026-10-01', '2026-11-21', false) where codigo = 'variacao_caixa';
insert into _r select 't1_variacao_bancos', round(sum(saldo_final) filter (where mes = '2026-11-01') - sum(saldo_anterior) filter (where mes = '2026-10-01'))::text
  from public.bi_saldos(array['128cce4c-cb86-414c-8096-c786c320cff0','2bfba338-901a-46ce-8b0d-fdc5163169da','5db45b1b-bc87-44c1-bf5a-5a115f6dec30']::uuid[], '2026-10-01', '2026-11-21');
insert into _r select 't2_origem_extrato', count(*)::text from public.bi_origem('dfc', array['5db45b1b-bc87-44c1-bf5a-5a115f6dec30']::uuid[],
  '2026-11-01', '2026-11-21', true, 'rec_clientes') where origem = 'extrato';
reset role;
select k, v from _r order by k;
