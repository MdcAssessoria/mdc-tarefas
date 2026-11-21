-- Testes da 109. Rodam NA PRODUÇÃO dentro de begin…rollback; nada fica gravado.
-- Esperado (Grupo Clara, out–nov/2026):
--   t1: com a eliminação, o fluxo do grupo difere da variação sem eliminação só pelo saldo das operações entre empresas
--       sem par (R$ 800), e não mais pelos fatos sem CNPJ/CPF (antes: R$ 122.711).
--   t2: bi_intragrupo devolve as operações entre as empresas (> 0) e a soma delas é a própria diferença do t1.
--   t3: os títulos do Omie têm nome (> 95%).
--   t4: uma empresa só → bi_intragrupo vazio.
create temp table _r(k text, v text) on commit drop;
grant all on _r to authenticated;
insert into _r select 't3_titulos_com_nome_pct', round(100.0 * count(*) filter (where coalesce(nome, '') <> '') / count(*))::text
  from public.omie_movimentos where chave like '%|0|0|%';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"17391d29-62ee-4353-8818-8ee0edcdc0e9","role":"authenticated"}', true);
insert into _r select 't1_dif_eliminacao', round(
  (select sum(valor) from public.bi_relatorio('dfc', array['128cce4c-cb86-414c-8096-c786c320cff0','2bfba338-901a-46ce-8b0d-fdc5163169da','5db45b1b-bc87-44c1-bf5a-5a115f6dec30']::uuid[],
     '2026-10-01', '2026-11-30', false) where codigo = 'variacao_caixa')
  - (select sum(valor) from public.bi_relatorio('dfc', array['128cce4c-cb86-414c-8096-c786c320cff0','2bfba338-901a-46ce-8b0d-fdc5163169da','5db45b1b-bc87-44c1-bf5a-5a115f6dec30']::uuid[],
     '2026-10-01', '2026-11-30', true) where codigo = 'variacao_caixa'))::text;
insert into _r select 't2_intra', count(*) || ' / ' || round(sum(valor))
  from public.bi_intragrupo(array['128cce4c-cb86-414c-8096-c786c320cff0','2bfba338-901a-46ce-8b0d-fdc5163169da','5db45b1b-bc87-44c1-bf5a-5a115f6dec30']::uuid[],
       '2026-10-01', '2026-11-30') where tipo = 'intra';
insert into _r select 't4_uma_empresa', count(*)::text
  from public.bi_intragrupo(array['128cce4c-cb86-414c-8096-c786c320cff0']::uuid[], '2026-10-01', '2026-11-30');
reset role;
select k, v from _r order by k;
