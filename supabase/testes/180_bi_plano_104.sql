-- Testes da 104 (plano de contas padrão do BI). Rodam NA PRODUÇÃO dentro de begin…rollback; nada fica gravado.
-- Usuário: Edvaldo (admin da MDC). Grupo Clara: 128cce4c (Mecânica), 2bfba338 (Company), 5db45b1b (Claratec).
create temp table _r(k text, v text) on commit drop;
grant all on _r to authenticated, anon;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"17391d29-62ee-4353-8818-8ee0edcdc0e9","role":"authenticated"}', true);
-- T1 plano padrão legível — esperado: 109 contas
insert into _r select 't1_plano', count(*)::text from bi_plano where org_id is null;
-- T2 sem gravação direta no plano e nas exceções — esperado: permission denied
do $$ begin insert into bi_plano (codigo, nome, tipo, ordem) values ('9.9.09', 'x', 'FORA', 1);
  insert into _r values ('t2_plano_grava', 'GRAVOU'); exception when others then insert into _r values ('t2_plano_grava', sqlerrm); end $$;
do $$ begin update bi_plano_excecoes set plano_codigo = '6.2.08';
  insert into _r values ('t2_exc_grava', 'GRAVOU'); exception when others then insert into _r values ('t2_exc_grava', sqlerrm); end $$;
-- T3 funções internas fechadas — esperado: permission denied
do $$ begin perform app.bi_fatos('dre', array['128cce4c-cb86-414c-8096-c786c320cff0']::uuid[], '2026-01-01', '2026-01-31', true);
  insert into _r values ('t3_fatos', 'CHAMOU'); exception when others then insert into _r values ('t3_fatos', sqlerrm); end $$;
-- T4 relatórios do grupo em 2026 — DRE fecha: resultado líquido = soma das analíticas
insert into _r select 't4_resultado_liquido', sum(valor)::text from public.bi_relatorio('dre',
  array['128cce4c-cb86-414c-8096-c786c320cff0','2bfba338-901a-46ce-8b0d-fdc5163169da','5db45b1b-bc87-44c1-bf5a-5a115f6dec34']::uuid[],
  '2026-01-01', '2026-11-30', true) where codigo = 'resultado_liquido';
insert into _r select 't4_nao_classificado_dre', sum(valor)::text from public.bi_relatorio('dre',
  array['128cce4c-cb86-414c-8096-c786c320cff0','2bfba338-901a-46ce-8b0d-fdc5163169da','5db45b1b-bc87-44c1-bf5a-5a115f6dec34']::uuid[],
  '2026-01-01', '2026-11-30', true) where codigo = 'nao_classificado';
insert into _r select 't4_contas_fecha', (abs(
  (select sum(valor) from public.bi_relatorio_contas('dre', array['128cce4c-cb86-414c-8096-c786c320cff0']::uuid[], '2026-01-01', '2026-11-30', true))
  - (select sum(valor) from public.bi_relatorio('dre', array['128cce4c-cb86-414c-8096-c786c320cff0']::uuid[], '2026-01-01', '2026-11-30', true) where not subtotal)
  ) < 0.05)::text;
insert into _r select 't4_origem_linhas', count(*)::text from public.bi_origem('dre', array['128cce4c-cb86-414c-8096-c786c320cff0']::uuid[],
  '2026-01-01', '2026-11-30', true, 'despesas_pessoal');
-- T5 exceções recuperadas do de-para antigo, a conferir
insert into _r select 't5_excecoes_a_conferir', count(*)::text from bi_plano_excecoes where a_conferir;
reset role;
set local role anon;
-- T6 anon sem leitura — esperado: permission denied
do $$ begin perform count(*) from bi_plano; insert into _r values ('t6_anon', 'LEU'); exception when others then insert into _r values ('t6_anon', sqlerrm); end $$;
reset role;
select k, v from _r order by k;
