-- Testes da 116 (projeção do BI). Rodam NA PRODUÇÃO dentro de begin…rollback; nada fica gravado.
-- Esperado: ok_* gravam; bloq_* com a mensagem em português; anon_* = false.
create temp table _r(k text, v text) on commit drop;
grant all on _r to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"17391d29-62ee-4353-8818-8ee0edcdc0e9","role":"authenticated"}', true);
do $$
declare v_id uuid; v_res jsonb; v_cli uuid := '128cce4c-cb86-414c-8096-c786c320cff0';
begin
  v_id := public.bi_projecao_salvar(null, v_cli, 'Cenário base 116', 2025, '{"anos": 2, "crescimentoReceita": [5,5,5,5,5]}'::jsonb);
  insert into _r values ('ok_salvar', (v_id is not null)::text);
  perform public.bi_projecao_salvar(v_id, v_cli, 'Cenário base 116 v2', 2025, '{"anos": 3}'::jsonb);
  insert into _r select 'ok_atualizar', nome || ' | ' || (premissas ->> 'anos') from public.bi_projecoes where id = v_id;
  begin perform public.bi_projecao_salvar(null, v_cli, 'Cenário base 116 v2', 2025, '{"anos": 2}'::jsonb);
  exception when others then insert into _r values ('bloq_nome_repetido', sqlerrm); end;
  begin perform public.bi_projecao_salvar(null, v_cli, 'x', 2025, '{"anos": 2}'::jsonb);
  exception when others then insert into _r values ('bloq_nome_curto', sqlerrm); end;
  begin perform public.bi_projecao_salvar(null, v_cli, 'Seis anos', 2025, '{"anos": 6}'::jsonb);
  exception when others then insert into _r values ('bloq_anos', sqlerrm); end;
  begin perform public.bi_projecao_provisionar(v_id, '[{"cnpj":"14.012.035/0001-55","relatorio":"dre","linha":"custos","competencia":"2025-01-01","valor":10}]'::jsonb);
  exception when others then insert into _r values ('bloq_ano_base', sqlerrm); end;
  begin perform public.bi_projecao_provisionar(v_id, '[{"cnpj":"11.222.333/0001-81","relatorio":"dre","linha":"custos","competencia":"2026-01-01","valor":10}]'::jsonb);
  exception when others then insert into _r values ('bloq_outra_empresa', sqlerrm); end;
  v_res := public.bi_projecao_provisionar(v_id, '[{"cnpj":"14.012.035/0001-55","relatorio":"dre","linha":"custos","competencia":"2026-01-01","valor":1234.5},{"cnpj":"14.012.035/0001-55","relatorio":"dre","linha":"receita_bruta","competencia":"2027-03-01","valor":5000}]'::jsonb);
  insert into _r values ('ok_provisionar', v_res::text);
  insert into _r select 'ok_orcamento', string_agg(linha || '=' || valor || '@' || competencia, ' ; ' order by competencia)
    from public.bi_orcamento where cliente_id = v_cli and competencia in ('2026-01-01', '2027-03-01') and linha in ('custos', 'receita_bruta');
  insert into _r select 'ok_marcado', array_to_string(provisionado_anos, ',') from public.bi_projecoes where id = v_id;
  v_res := public.bi_projecao_provisionar(v_id, '[{"cnpj":"14.012.035/0001-55","relatorio":"dre","linha":"lucro_bruto","competencia":"2026-01-01","valor":1}]'::jsonb);
  insert into _r values ('bloq_subtotal_volta_erro', v_res::text);
  perform public.bi_projecao_excluir(v_id);
  insert into _r select 'ok_excluir', (not exists (select 1 from public.bi_projecoes where id = v_id))::text;
end $$;
reset role;
insert into _r select 'anon_salvar', has_function_privilege('anon', 'public.bi_projecao_salvar(uuid,uuid,text,int,jsonb)', 'execute')::text;
insert into _r select 'anon_provisionar', has_function_privilege('anon', 'public.bi_projecao_provisionar(uuid,jsonb)', 'execute')::text;
select k, v from _r order by k;
