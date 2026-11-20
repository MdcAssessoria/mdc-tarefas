-- Testes da 097 (BI: acesso por empresa, indicadores, orçamento). Rodam NA PRODUÇÃO, dentro de begin…rollback,
-- porque as tabelas omie_*/bi_* ainda não estão nas migrações do repositório (ALT-02). Nada fica gravado.
-- Usuários: Edvaldo (admin) e Carla (analista com bi_gestao). Empresas do Grupo Clara.
begin;
create temp table _r(k text, v text) on commit drop;
grant all on _r to authenticated;
insert into hub_acessos (org_id, user_id, app, papel) values ('224d1feb-deb6-4fd1-a2c6-a63140d8426e','cfb850bb-663a-4858-a097-09825af24781','bi_gestao','operar');
set local role authenticated;
-- Edvaldo (admin)
select set_config('request.jwt.claims', '{"sub":"17391d29-62ee-4353-8818-8ee0edcdc0e9","role":"authenticated"}', true);
insert into _r select 'adm_empresas', string_agg(nome||':'||liberado||':'||pode_aprovar, ' | ') from public.bi_empresas();
insert into _r select 'adm_res_liq_2026', sum(valor)::text from public.bi_relatorio('dre', array['2bfba338-901a-46ce-8b0d-fdc5163169da','128cce4c-cb86-414c-8096-c786c320cff0','5db45b1b-bc87-44c1-bf5a-5a115f6dec30']::uuid[], '2026-01-01','2026-12-31', true) where codigo='resultado_liquido';
insert into _r select 'adm_ind', left(public.bi_indicadores(array['2bfba338-901a-46ce-8b0d-fdc5163169da','128cce4c-cb86-414c-8096-c786c320cff0','5db45b1b-bc87-44c1-bf5a-5a115f6dec30']::uuid[], '2026-01-01','2026-11-20', true)::text, 900);
insert into _r select 'adm_orc_gravar', public.bi_orcamento_gravar('[{"cnpj":"14.012.035/0001-55","relatorio":"DRE","linha":"despesas_pessoal","competencia":"2026-01-01","valor":"1000"},{"cnpj":"14.012.035/0001-55","relatorio":"dre","linha":"receita_bruta","competencia":"2026-01-15","valor":"5000"}]'::jsonb, 'teste')::text;
insert into _r select 'adm_orc_erro', public.bi_orcamento_gravar('[{"cnpj":"14.012.035/0001-55","relatorio":"dre","linha":"lucro_bruto","competencia":"2026-01-01","valor":"10"},{"cnpj":"14.012.035/0001-55","relatorio":"dre","linha":"despesas_pessoal","competencia":"2026-01-01","valor":"-5"}]'::jsonb)::text;
insert into _r select 'adm_orcado_jan', string_agg(codigo||'='||valor, ', ') from public.bi_orcado('dre', array['128cce4c-cb86-414c-8096-c786c320cff0']::uuid[], '2026-01-01','2026-01-31') where codigo in ('receita_bruta','despesas_pessoal','lucro_bruto','resultado_liquido');
-- Carla (analista com bi_gestao, sem acesso à empresa)
select set_config('request.jwt.claims', '{"sub":"cfb850bb-663a-4858-a097-09825af24781","role":"authenticated"}', true);
insert into _r select 'carla_empresas', string_agg(nome||':'||liberado, ' | ') from public.bi_empresas();
do $$ begin perform public.bi_relatorio('dre', array['128cce4c-cb86-414c-8096-c786c320cff0']::uuid[], '2026-01-01','2026-12-31', true);
  insert into _r values ('carla_sem_acesso','LIBEROU'); exception when others then insert into _r values ('carla_sem_acesso', sqlerrm); end $$;
insert into _r select 'carla_ve_mov', count(*)::text from omie_movimentos;
insert into _r select 'carla_ve_orc', count(*)::text from bi_orcamento;
insert into _r select 'carla_pede', (public.bi_acesso_pedir('128cce4c-cb86-414c-8096-c786c320cff0','Análise do fechamento') is not null)::text;
do $$ begin perform public.bi_acesso_pedir('128cce4c-cb86-414c-8096-c786c320cff0','de novo');
  insert into _r values ('carla_pede_2x','LIBEROU'); exception when others then insert into _r values ('carla_pede_2x', sqlerrm); end $$;
do $$ declare v uuid; begin select id into v from bi_acessos where situacao='pedido' limit 1; perform public.bi_acesso_decidir(v, true, null, 30);
  insert into _r values ('carla_aprova_si','LIBEROU'); exception when others then insert into _r values ('carla_aprova_si', sqlerrm); end $$;
-- Edvaldo aprova
select set_config('request.jwt.claims', '{"sub":"17391d29-62ee-4353-8818-8ee0edcdc0e9","role":"authenticated"}', true);
insert into _r select 'adm_lista', string_agg(empresa||':'||pessoa||':'||situacao||':'||posso_decidir, ' | ') from public.bi_acessos_listar();
do $$ declare v uuid; begin select id into v from bi_acessos where situacao='pedido' limit 1; perform public.bi_acesso_decidir(v, true, null, 30); end $$;
-- Carla com acesso
select set_config('request.jwt.claims', '{"sub":"cfb850bb-663a-4858-a097-09825af24781","role":"authenticated"}', true);
insert into _r select 'carla_empresas_2', string_agg(nome||':'||liberado||':'||coalesce(valido_ate::text,''), ' | ') from public.bi_empresas();
insert into _r select 'carla_rel_clara', count(*)::text from public.bi_relatorio('dre', array['128cce4c-cb86-414c-8096-c786c320cff0']::uuid[], '2026-01-01','2026-12-31', true);
do $$ begin perform public.bi_relatorio('dre', array['128cce4c-cb86-414c-8096-c786c320cff0','5db45b1b-bc87-44c1-bf5a-5a115f6dec30']::uuid[], '2026-01-01','2026-12-31', true);
  insert into _r values ('carla_mistura','LIBEROU'); exception when others then insert into _r values ('carla_mistura', sqlerrm); end $$;
insert into _r select 'carla_notif', (select count(*) from hub_notificacoes where user_id='cfb850bb-663a-4858-a097-09825af24781' and app='bi_gestao')::text;
do $$ begin perform * from public.bi_registro_acessos(30); insert into _r values ('carla_registro', (select count(*)::text from public.bi_registro_acessos(30))); exception when others then insert into _r values ('carla_registro', sqlerrm); end $$;
select set_config('request.jwt.claims', '{"sub":"17391d29-62ee-4353-8818-8ee0edcdc0e9","role":"authenticated"}', true);
insert into _r select 'adm_registro', count(*)::text from public.bi_registro_acessos(30);
reset role;
insert into _r select 'notif_admins', count(*)::text from hub_notificacoes where app='bi_gestao' and titulo='Pedido de acesso ao BI';
select k, v from _r;
rollback;
