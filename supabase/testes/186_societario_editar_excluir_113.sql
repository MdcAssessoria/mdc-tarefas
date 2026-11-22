-- Testes da 113 (editar e excluir processo). Rodam NA PRODUÇÃO dentro de begin…rollback; nada fica gravado.
-- Esperado: ok_* com os valores novos; bloq_* com a mensagem em português; anon_excluir = false.
create temp table _r(k text, v text) on commit drop;
grant all on _r to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"17391d29-62ee-4353-8818-8ee0edcdc0e9","role":"authenticated"}', true);
do $$
declare v_proc uuid; v_tar uuid; r record;
begin
  v_proc := public.soc_abrir_processo('224d1feb-deb6-4fd1-a2c6-a63140d8426e', '0d942101-b390-4da3-a0cc-327d9f5a3b42',
             null, 'TESTE 113 LTDA', null, 'SP', null, null, null, '{}');
  perform public.soc_abertura_salvar(v_proc, jsonb_build_object('regime','simples','razao_social','TESTE 113 LTDA'));
  perform public.soc_processo_editar(v_proc, jsonb_build_object('futuro_cliente','NOVO NOME 113 LTDA','cnpj','11.222.333/0001-81','uf','mg','previsao_em','2027-01-31','descricao','obs'));
  select futuro_cliente, cnpj, uf, previsao_em into r from public.soc_processos where id = v_proc;
  insert into _r values ('ok_editar', concat_ws(' | ', r.futuro_cliente, r.cnpj, r.uf, r.previsao_em));
  insert into _r select 'ok_ficha_segue', razao_social || ' | ' || uf from public.soc_aberturas where processo_id = v_proc;
  insert into _r select 'ok_evento', texto from public.soc_eventos where processo_id = v_proc and texto like 'Dados do processo%';
  begin perform public.soc_processo_editar(v_proc, jsonb_build_object('cnpj','123')); exception when others then insert into _r values ('bloq_cnpj', sqlerrm); end;
  begin perform public.soc_processo_editar(v_proc, jsonb_build_object('futuro_cliente','')); exception when others then insert into _r values ('bloq_nome', sqlerrm); end;
  begin perform public.soc_processo_editar(v_proc, jsonb_build_object('responsavel_id', gen_random_uuid())); exception when others then insert into _r values ('bloq_resp', sqlerrm); end;
  begin perform public.soc_processo_editar(v_proc, jsonb_build_object('previsao_em','2000-01-01')); exception when others then insert into _r values ('bloq_prev', sqlerrm); end;
  begin perform public.soc_processo_excluir(v_proc, 'erro'); exception when others then insert into _r values ('bloq_motivo', sqlerrm); end;
  select tarefa_id into v_tar from public.soc_fases where processo_id = v_proc and tarefa_id is not null limit 1;
  perform public.soc_processo_excluir(v_proc, 'aberto por engano');
  insert into _r select 'ok_excluido', (not exists (select 1 from public.soc_processos where id = v_proc))::text
     || ' | tarefa ' || coalesce((select status::text from public.tarefas where id = v_tar), 'sem tarefa')
     || ' | auditoria ' || (select count(*) from public.hub_auditoria where acao = 'excluir_processo' and alvo = v_proc::text);
end $$;
reset role;
insert into _r select 'anon_excluir', has_function_privilege('anon', 'public.soc_processo_excluir(uuid,text)', 'execute')::text;
select k, v from _r order by k;
