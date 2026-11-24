-- Testes da 117 (centro de custo e carteira de pedidos do BI). Rodam NA PRODUÇÃO dentro de begin…rollback; nada fica
-- gravado. Esperado: ok_* com os valores indicados; bloq_* com a mensagem em português; anon_* = false.
create temp table _r(k text, v text) on commit drop;
grant all on _r to authenticated;

-- dados de teste (como dono do banco): um título de despesa da Clara Company em 2026 rateado 60/40, um centro com nome,
-- dois pedidos (um em carteira atrasado, um faturado no período) e um cancelado (não aparece)
create temp table _t on commit drop as
select m.chave, m.valor_documento from public.omie_movimentos m
 where m.cliente_id = '128cce4c-cb86-414c-8096-c786c320cff0' and m.natureza = 'P' and m.chave like '%|0|0|%'
   and m.emissao between '2026-03-01' and '2026-03-31' and m.valor_documento > 100 and coalesce(m.status, '') not ilike 'cancel%'
 order by m.valor_documento desc limit 1;
grant select on _t to authenticated;
update public.omie_movimentos set departamentos = '[{"codigo":"T117A","pct":60},{"codigo":"T117B","pct":40}]'
 where cliente_id = '128cce4c-cb86-414c-8096-c786c320cff0' and chave = (select chave from _t);
insert into public.omie_departamentos (cliente_id, org_id, codigo, descricao)
select id, org_id, 'T117A', 'Usinagem (teste)' from public.clientes where id = '128cce4c-cb86-414c-8096-c786c320cff0';
insert into public.omie_pedidos (cliente_id, org_id, codigo_pedido, numero, etapa, inclusao, previsao, faturado, faturamento, cancelado, valor)
select id, org_id, x.cod, x.num, x.et, x.inc::date, x.prev::date, x.fat, x.dfat::date, x.canc, x.v
  from public.clientes, (values ('T117-1', '9001', '10', '2026-10-01', '2026-11-10', false, null, false, 1500.00),
                                ('T117-2', '9002', '60', '2026-10-05', '2026-10-20', true, '2026-10-18', false, 800.00),
                                ('T117-3', '9003', '10', '2026-10-06', '2026-11-30', false, null, true, 999.00),
                                ('T117-4', '9004', '50', '2026-10-07', '2026-10-15', false, null, false, 700.00)) x(cod, num, et, inc, prev, fat, dfat, canc, v)
 where id = '128cce4c-cb86-414c-8096-c786c320cff0';
-- 119: o T117-4 foi encerrado na Omie sem faturar: fica fora da carteira
update public.omie_pedidos set encerrado = true where codigo_pedido = 'T117-4';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"17391d29-62ee-4353-8818-8ee0edcdc0e9","role":"authenticated"}', true);
do $$
declare v_cli uuid := '128cce4c-cb86-414c-8096-c786c320cff0'; v_val numeric; v_tot_cc numeric; v_tot_rel numeric;
begin
  select valor_documento into v_val from _t;
  -- o título rateado aparece 60/40 nos dois centros (o B sem nome cadastrado sai como "Centro T117B")
  insert into _r select 'ok_centro_A', centro_nome || ' = ' || (sum(valor) = -round(v_val * 0.6, 2))::text
    from public.bi_centro_custo('dre', array[v_cli], '2026-03-01', '2026-03-31', false) where centro = 'T117A' group by centro_nome;
  insert into _r select 'ok_centro_B', centro_nome || ' = ' || (sum(valor) = -round(v_val * 0.4, 2))::text
    from public.bi_centro_custo('dre', array[v_cli], '2026-03-01', '2026-03-31', false) where centro = 'T117B' group by centro_nome;
  -- a soma de todos os centros fecha com a DRE (linhas analíticas) do mesmo período
  select sum(valor) into v_tot_cc from public.bi_centro_custo('dre', array[v_cli], '2026-03-01', '2026-03-31', false);
  select sum(valor) into v_tot_rel from public.bi_relatorio('dre', array[v_cli], '2026-03-01', '2026-03-31', false) where not subtotal;
  insert into _r values ('ok_fecha_com_dre', (abs(v_tot_cc - v_tot_rel) <= 0.05)::text);
  -- carteira: o em carteira e o faturado no período aparecem; o cancelado e o encerrado (119) não; esperado 9001:false,9002:true
  insert into _r select 'ok_carteira', string_agg(numero || ':' || faturado::text, ',' order by numero)
    from public.bi_carteira(array[v_cli], '2026-10-01', '2026-10-31') where codigo_pedido like 'T117-%';
  begin perform public.bi_centro_custo('xyz', array[v_cli], '2026-03-01', '2026-03-31');
  exception when others then insert into _r values ('bloq_relatorio', sqlerrm); end;
  begin perform public.bi_carteira(array[v_cli], '2026-10-31', '2026-10-01');
  exception when others then insert into _r values ('bloq_periodo', sqlerrm); end;
end $$;

-- quem não tem acesso ao BI da empresa não lê
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000117","role":"authenticated"}', true);
do $$ begin
  begin perform public.bi_carteira(array['128cce4c-cb86-414c-8096-c786c320cff0'::uuid], '2026-10-01', '2026-10-31');
  exception when others then insert into _r values ('bloq_sem_acesso', sqlerrm); end;
  insert into _r select 'bloq_tabela_sem_acesso', count(*)::text from public.omie_pedidos where codigo_pedido like 'T117-%';
end $$;
reset role;
insert into _r select 'anon_centro', has_function_privilege('anon', 'public.bi_centro_custo(text,uuid[],date,date,boolean)', 'execute')::text;
insert into _r select 'anon_carteira', has_function_privilege('anon', 'public.bi_carteira(uuid[],date,date)', 'execute')::text;
insert into _r select 'anon_pedidos', has_table_privilege('anon', 'public.omie_pedidos', 'select')::text;
insert into _r select 'auth_grava_pedidos', has_table_privilege('authenticated', 'public.omie_pedidos', 'insert')::text;
do $x$ begin raise exception E'RESULTADO\n%', (select string_agg(k || ' = ' || v, E'\n' order by k) from _r); end $x$;
