-- Testes da 123 (Tarefas › Gerir libera Configurações › Clientes e o relatório da equipe). Rodam NA PRODUÇÃO dentro de
-- begin…rollback; nada fica gravado. Esperado: analista com "operar" é barrado; o mesmo analista com "gerir" altera a
-- empresa, define responsável, inativa/reativa e vê as tarefas da equipe; gere_tarefas não é executável por anon.
create temp table _r(k text, v text) on commit drop;
grant all on _r to authenticated;
create temp table _c on commit drop as
select c.id cliente, c.org_id org, (select count(*) from public.tarefas t where t.org_id = c.org_id) total_org
  from public.clientes c where c.org_id = '224d1feb-deb6-4fd1-a2c6-a63140d8426e' and c.ativo order by c.criado_em limit 1;
grant select on _c to authenticated;

-- analista da MDC com Tarefas › operar
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b0b7e9b6-92a9-41c8-b07f-727bfd03ba7d","role":"authenticated"}', true);
do $$ declare n int; begin
  update public.clientes set segmento = segmento where id = (select cliente from _c);
  get diagnostics n = row_count;
  insert into _r values ('bloq_operar_altera_empresa', n::text);
  begin perform public.inativar_cliente((select cliente from _c), current_date, 'teste');
  exception when others then insert into _r values ('bloq_operar_inativa', sqlerrm); end;
  insert into _r select 'operar_ve_tarefas', (count(*) < (select total_org from _c))::text from public.tarefas where org_id = (select org from _c);
end $$;

-- o administrador dá "gerir" ao mesmo analista (como dono do banco, só neste teste)
reset role;
update public.hub_acessos set papel = 'gerir'
 where org_id = '224d1feb-deb6-4fd1-a2c6-a63140d8426e' and user_id = 'b0b7e9b6-92a9-41c8-b07f-727bfd03ba7d' and app = 'tarefas';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b0b7e9b6-92a9-41c8-b07f-727bfd03ba7d","role":"authenticated"}', true);
do $$ declare n int; v_setor uuid; begin
  update public.clientes set segmento = segmento where id = (select cliente from _c);
  get diagnostics n = row_count;
  insert into _r values ('ok_gerir_altera_empresa', n::text);
  select id into v_setor from public.setores where org_id = (select org from _c) limit 1;
  insert into public.cliente_responsaveis (org_id, cliente_id, setor_id, user_id)
  values ((select org from _c), (select cliente from _c), v_setor, 'b0b7e9b6-92a9-41c8-b07f-727bfd03ba7d')
  on conflict (cliente_id, setor_id) do update set user_id = excluded.user_id;
  insert into _r values ('ok_gerir_responsavel', 'true');
  insert into _r select 'ok_gerir_inativa', (public.inativar_cliente((select cliente from _c), current_date, 'teste') is not null)::text;
  insert into _r select 'ok_gerir_reativa', (public.reativar_cliente((select cliente from _c)) is not null)::text;
  insert into _r select 'ok_gerir_ve_equipe', (count(*) = (select total_org from _c))::text from public.tarefas where org_id = (select org from _c);
end $$;
reset role;
insert into _r select 'anon_gere_tarefas', has_function_privilege('anon', 'app.gere_tarefas(uuid)', 'execute')::text;
do $x$ begin raise exception E'RESULTADO\n%', (select string_agg(k || ' = ' || v, E'\n' order by k) from _r); end $x$;
