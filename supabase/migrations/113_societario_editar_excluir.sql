-- =====================================================================================================
--  113 · Societário: editar os dados do processo e excluir processo (pedido do Edvaldo, 22/11/2026)
--
--  • soc_processo_editar (societario › operar, processo em andamento): nome da empresa (só quando ainda não está
--    ligada a um cliente), CNPJ, UF, o que muda/observações, responsável (membro ativo) e previsão. Na abertura,
--    nome e UF seguem para a ficha. Cada mudança vai para a linha do tempo com o antes e o depois
--    (observações cortadas em 300 letras) e o registro completo para a auditoria do HUB.
--  • soc_processo_excluir (societario › gerir, motivo de 5 letras ou mais): apaga de vez o processo aberto por
--    engano — fases, protocolos, taxas, exigências, histórico e ficha de abertura vão junto. Não exclui processo
--    concluído (já produziu efeito, como o cadastro do cliente) nem processo com anexo ativo (o arquivo é imutável:
--    retire os anexos antes). As tarefas das fases ficam canceladas (tarefa nunca se apaga) e o retrato do processo
--    fica na auditoria do HUB (hub_auditoria).
-- =====================================================================================================

create or replace function public.soc_processo_editar(p_proc uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  a public.soc_processos; v_codigo text; v_cnpj text; v_uf text; v_resp uuid; v_prev date; v_futuro text;
  v_desc text; v_mud text[] := '{}';
begin
  select * into a from public.soc_processos where id = p_proc for update;
  if a.id is null then raise exception 'Processo não encontrado'; end if;
  if not app.hub_pode(a.org_id, 'societario', 'operar') then raise exception 'Você não tem permissão para editar processos societários'; end if;
  if a.status <> 'aberto' then raise exception 'Só processo em andamento pode ser editado'; end if;
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'Dados do processo inválidos'; end if;
  select codigo into v_codigo from public.soc_tipos where id = a.tipo_id;

  v_futuro := case when p ? 'futuro_cliente' then nullif(btrim(p ->> 'futuro_cliente'), '') else a.futuro_cliente end;
  if a.cliente_id is null and v_futuro is null then raise exception 'Informe o nome da empresa'; end if;
  if a.cliente_id is not null then v_futuro := a.futuro_cliente; end if;
  if v_futuro is not null and length(v_futuro) > 150 then raise exception 'Nome da empresa com mais de 150 letras'; end if;

  v_cnpj := case when p ? 'cnpj' then nullif(regexp_replace(coalesce(p ->> 'cnpj', ''), '\D', '', 'g'), '') else a.cnpj end;
  if p ? 'cnpj' and v_cnpj is not null and length(v_cnpj) <> 14 then raise exception 'O CNPJ tem 14 números'; end if;

  v_uf := case when p ? 'uf' then nullif(upper(btrim(p ->> 'uf')), '') else a.uf end;
  if v_uf is not null and v_uf !~ '^[A-Z]{2}$' then raise exception 'UF com 2 letras (ex.: SP)'; end if;

  v_desc := case when p ? 'descricao' then nullif(btrim(p ->> 'descricao'), '') else a.descricao end;
  if v_desc is not null and length(v_desc) > 4000 then raise exception 'Observações com mais de 4.000 letras'; end if;

  v_resp := case when p ? 'responsavel_id' then nullif(p ->> 'responsavel_id', '')::uuid else a.responsavel_id end;
  if v_resp is null then raise exception 'Escolha o responsável'; end if;
  if v_resp is distinct from a.responsavel_id
     and not exists (select 1 from public.membros m where m.org_id = a.org_id and m.user_id = v_resp and m.ativo) then
    raise exception 'O responsável precisa ser uma pessoa ativa da equipe';
  end if;

  v_prev := case when p ? 'previsao_em' then nullif(p ->> 'previsao_em', '')::date else a.previsao_em end;
  if v_prev is not null and v_prev < a.pedido_em then raise exception 'A previsão não pode ser antes da abertura do processo'; end if;

  if v_futuro is distinct from a.futuro_cliente then v_mud := v_mud || ('nome: ' || coalesce(a.futuro_cliente, '—') || ' → ' || v_futuro); end if;
  if v_cnpj is distinct from a.cnpj then v_mud := v_mud || ('CNPJ: ' || coalesce(a.cnpj, '—') || ' → ' || coalesce(v_cnpj, '—')); end if;
  if v_uf is distinct from a.uf then v_mud := v_mud || ('UF: ' || coalesce(a.uf, '—') || ' → ' || coalesce(v_uf, '—')); end if;
  if v_desc is distinct from a.descricao then
    v_mud := v_mud || ('observações: "' || coalesce(left(a.descricao, 300) || case when length(a.descricao) > 300 then '…' else '' end, '—')
                      || '" → "' || coalesce(left(v_desc, 300) || case when length(v_desc) > 300 then '…' else '' end, '—') || '"');
  end if;
  if v_resp is distinct from a.responsavel_id then
    v_mud := v_mud || ('responsável: ' || coalesce((select nome from public.membros where org_id = a.org_id and user_id = a.responsavel_id), '—')
                      || ' → ' || (select nome from public.membros where org_id = a.org_id and user_id = v_resp));
  end if;
  if v_prev is distinct from a.previsao_em then
    v_mud := v_mud || ('previsão: ' || coalesce(to_char(a.previsao_em, 'DD/MM/YYYY'), '—') || ' → ' || coalesce(to_char(v_prev, 'DD/MM/YYYY'), '—'));
  end if;
  if cardinality(v_mud) = 0 then return; end if;

  update public.soc_processos set futuro_cliente = v_futuro, cnpj = v_cnpj, uf = v_uf, descricao = v_desc,
         responsavel_id = v_resp, previsao_em = v_prev, atualizado_em = now()
   where id = p_proc;
  -- abertura: o nome e a UF da ficha acompanham o cabeçalho
  if v_codigo = 'abertura' then
    update public.soc_aberturas set
      razao_social = case when length(v_futuro) between 3 and 150 then v_futuro else razao_social end,
      uf = coalesce(v_uf, uf), atualizado_por = auth.uid(), atualizado_em = now()
     where processo_id = p_proc;
  end if;
  perform app.soc_evento(p_proc, 'comentario', 'Dados do processo alterados — ' || array_to_string(v_mud, '; '), false);
  -- texto completo (observações longas) fica na auditoria do HUB
  perform app.registrar(a.org_id, 'societario', 'editar_processo', a.id::text,
    jsonb_build_object('futuro_cliente', a.futuro_cliente, 'cnpj', a.cnpj, 'uf', a.uf, 'descricao', a.descricao,
                       'responsavel_id', a.responsavel_id, 'previsao_em', a.previsao_em),
    jsonb_build_object('futuro_cliente', v_futuro, 'cnpj', v_cnpj, 'uf', v_uf, 'descricao', v_desc,
                       'responsavel_id', v_resp, 'previsao_em', v_prev));
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
  raise exception 'Algum valor está em formato inválido (data ou responsável). Confira e salve de novo.';
end $$;

create or replace function public.soc_processo_excluir(p_proc uuid, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.soc_processos; v_motivo text := btrim(coalesce(p_motivo, '')); v_anexos int;
begin
  select * into a from public.soc_processos where id = p_proc for update;
  if a.id is null then raise exception 'Processo não encontrado'; end if;
  if not app.hub_pode(a.org_id, 'societario', 'gerir') then
    raise exception 'Só quem gere o Societário pode excluir processos. Você pode pedir para cancelar.';
  end if;
  if length(regexp_replace(v_motivo, '[^[:alpha:]]', '', 'g')) < 5 then
    raise exception 'Informe o motivo da exclusão (pelo menos 5 letras)';
  end if;
  if a.status = 'concluido' then
    raise exception 'Processo concluído não pode ser excluído: ele já produziu efeito (como o cadastro do cliente).';
  end if;
  select count(*) into v_anexos from public.hub_arquivos
   where app = 'societario' and ref_id = p_proc and org_id = a.org_id and retirado_em is null;
  if v_anexos > 0 then
    raise exception 'O processo tem % anexo(s). Retire os anexos no cartão Documentos antes de excluir.', v_anexos;
  end if;

  perform app.registrar(a.org_id, 'societario', 'excluir_processo', a.id::text,
    jsonb_build_object(
      'processo', to_jsonb(a),
      'fases', coalesce((select jsonb_agg(to_jsonb(f) order by f.ordem) from public.soc_fases f where f.processo_id = p_proc), '[]'),
      'protocolos', coalesce((select jsonb_agg(to_jsonb(x)) from public.soc_protocolos x where x.processo_id = p_proc), '[]'),
      'taxas', coalesce((select jsonb_agg(to_jsonb(x)) from public.soc_taxas x where x.processo_id = p_proc), '[]'),
      'exigencias', coalesce((select jsonb_agg(to_jsonb(x)) from public.soc_exigencias x where x.processo_id = p_proc), '[]'),
      'eventos', coalesce((select jsonb_agg(to_jsonb(x) order by x.em) from public.soc_eventos x where x.processo_id = p_proc), '[]'),
      'ficha_abertura', (select to_jsonb(x) from public.soc_aberturas x where x.processo_id = p_proc),
      'socios', coalesce((select jsonb_agg(to_jsonb(x) order by x.ordem) from public.soc_abertura_socios x where x.processo_id = p_proc), '[]')),
    jsonb_build_object('motivo', v_motivo));

  update public.tarefas set status = 'cancelada'
   where id in (select tarefa_id from public.soc_fases where processo_id = p_proc and tarefa_id is not null)
     and status not in ('concluida', 'cancelada');
  delete from public.soc_processos where id = p_proc;
end $$;

revoke all on function public.soc_processo_editar(uuid, jsonb) from public, anon;
revoke all on function public.soc_processo_excluir(uuid, text) from public, anon;
grant execute on function public.soc_processo_editar(uuid, jsonb) to authenticated;
grant execute on function public.soc_processo_excluir(uuid, text) to authenticated;
comment on function public.soc_processo_editar(uuid, jsonb) is
  'Edita nome, CNPJ, UF, observações, responsável e previsão do processo em andamento (operar); registra na linha do tempo (113).';
comment on function public.soc_processo_excluir(uuid, text) is
  'Exclui de vez processo não concluído e sem anexo ativo (gerir; motivo); tarefas canceladas; retrato na hub_auditoria (113).';
