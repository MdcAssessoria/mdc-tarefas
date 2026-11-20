-- Testes da 105 (classificação pela equipe MDC, saldos dos bancos e 9.1.01). Rodam NA PRODUÇÃO dentro de
-- begin…rollback; nada fica gravado. Usuário: Edvaldo (admin da MDC). Grupo Clara: 128cce4c (Mecânica),
-- 2bfba338 (Company), 5db45b1b (Claratec).
create temp table _r(k text, v text) on commit drop;
grant all on _r to authenticated, anon;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"17391d29-62ee-4353-8818-8ee0edcdc0e9","role":"authenticated"}', true);
-- T1 lista da classificação do grupo — esperado: linhas > 0 e pendentes contadas
insert into _r select 't1_categorias', count(*)::text from public.bi_classificacao_listar(
  array['128cce4c-cb86-414c-8096-c786c320cff0','2bfba338-901a-46ce-8b0d-fdc5163169da','5db45b1b-bc87-44c1-bf5a-5a115f6dec30']::uuid[],
  '2026-01-01', '2026-11-30');
insert into _r select 't1_sem_conta', count(*)::text from public.bi_classificacao_listar(
  array['128cce4c-cb86-414c-8096-c786c320cff0','2bfba338-901a-46ce-8b0d-fdc5163169da','5db45b1b-bc87-44c1-bf5a-5a115f6dec30']::uuid[],
  '2026-01-01', '2026-11-30') where conta is null or conta = '9.9.02';
-- T2 classificar uma categoria e ver a conta mudar (fica no rollback)
insert into _r select 't2_salvar', public.bi_excecao_salvar(array['128cce4c-cb86-414c-8096-c786c320cff0']::uuid[],
  '128cce4c-cb86-414c-8096-c786c320cff0', x.categoria_codigo, '6.2.08', false, 'teste 181')::text
  from public.bi_classificacao_listar(array['128cce4c-cb86-414c-8096-c786c320cff0']::uuid[], '2026-01-01', '2026-11-30') x
 where x.origem = 'codigo' limit 1;
insert into _r select 't2_hist', count(*)::text from bi_plano_excecoes_hist where motivo = 'teste 181';
-- T3 sem gravação direta — esperado: permission denied
do $$ begin insert into bi_plano_excecoes_hist (org_id, categoria_codigo, acao) select org_id, 'x', 'classificada' from clientes limit 1;
  insert into _r values ('t3_hist_grava', 'GRAVOU'); exception when others then insert into _r values ('t3_hist_grava', sqlerrm); end $$;
do $$ begin insert into omie_saldos (cliente_id, org_id, conta_corrente, mes, saldo_anterior, saldo_final)
  select id, org_id, 'x', '2026-01-01', 0, 0 from clientes where id = '128cce4c-cb86-414c-8096-c786c320cff0';
  insert into _r values ('t3_saldos_grava', 'GRAVOU'); exception when others then insert into _r values ('t3_saldos_grava', sqlerrm); end $$;
-- T4 motivo curto recusado ao desfazer
do $$ begin perform public.bi_excecao_excluir(array['128cce4c-cb86-414c-8096-c786c320cff0']::uuid[],
  (select id from bi_plano_excecoes where observacao = 'teste 181' limit 1), 'abc');
  insert into _r values ('t4_motivo', 'ACEITOU'); exception when others then insert into _r values ('t4_motivo', sqlerrm); end $$;
-- T5 9.1.01: o que entra vai para outros recebimentos
insert into _r select 't5_9101_' || linha, round(sum(valor))::text from public.bi_relatorio_contas('dfc',
  array['128cce4c-cb86-414c-8096-c786c320cff0','2bfba338-901a-46ce-8b0d-fdc5163169da','5db45b1b-bc87-44c1-bf5a-5a115f6dec30']::uuid[],
  '2026-01-01', '2026-11-30', true) where conta = '9.1.01' group by linha;
-- T6 saldos legíveis pela função
insert into _r select 't6_saldos', count(*)::text from public.bi_saldos(array['128cce4c-cb86-414c-8096-c786c320cff0']::uuid[], '2026-01-01', '2026-11-30');
reset role;
-- T7 anônimo não lê saldos nem chama a classificação
set local role anon;
do $$ begin perform count(*) from omie_saldos; insert into _r values ('t7_anon_saldos', 'LEU'); exception when others then insert into _r values ('t7_anon_saldos', sqlerrm); end $$;
do $$ begin perform public.bi_classificacao_listar(array['128cce4c-cb86-414c-8096-c786c320cff0']::uuid[], '2026-01-01', '2026-11-30');
  insert into _r values ('t7_anon_lista', 'CHAMOU'); exception when others then insert into _r values ('t7_anon_lista', sqlerrm); end $$;
reset role;
select k, v from _r order by k;
