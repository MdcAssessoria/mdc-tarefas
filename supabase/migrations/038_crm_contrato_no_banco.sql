-- =====================================================================================================
--  038 · Comercial (CRM): contrato e histórico gravados pelo banco, numa transação só
--
--  Pedido do Edvaldo (02/11/2026), a partir da auditoria: a tela numerava o contrato contando "contratos do ano + 1";
--  duas pessoas salvando ao mesmo tempo pegavam o mesmo número. E salvar/marcar contrato e registrar no histórico eram
--  várias gravações soltas pelo navegador (se uma falhasse, ficava pela metade).
--
--  crm_salvar_contrato      rascunho existente: atualiza; sem rascunho: numera (AAAA/NNN, trava por organização e ano,
--                           número único), cria, atualiza o valor do funil e registra no histórico.
--                           O texto vem montado pela tela com {{numero}} no lugar do número; o banco põe o número.
--  crm_marcar_contrato      enviado/assinado/cancelado com as datas, histórico, etapa "Proposta" ao enviar e, se pedido,
--                           cadastra o cliente ao assinar (crm_converter_cliente), tudo ou nada.
--  crm_registrar_atividade  grava no histórico e atualiza a oportunidade (retorno ou "mexida agora"; o primeiro contato
--                           tira do "Novo lead").
--  Todas conferem Comercial (operar). Nada se apaga (036).
-- =====================================================================================================

-- número do contrato não repete na organização (não há contratos gravados até aqui)
create unique index if not exists crm_contratos_numero_uk on public.crm_contratos (org_id, numero) where numero is not null;

create or replace function app.crm_brl(p numeric)
returns text language sql immutable set search_path = public as $$
  select 'R$ ' || translate(to_char(coalesce(p, 0), 'FM999G999G990D00'), ',.', '.,')
$$;
revoke all on function app.crm_brl(numeric) from public, anon, authenticated;

create or replace function public.crm_salvar_contrato(p_op uuid, p_modelo uuid, p_valores jsonb, p_texto text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o crm_oportunidades; m crm_modelos; u crm_contratos; c crm_contratos;
  v_ano text; v_seq int; v_numero text; v_hon numeric;
begin
  select * into o from crm_oportunidades where id = p_op for update;
  if o.id is null then raise exception 'Oportunidade não encontrada'; end if;
  if not app.hub_pode(o.org_id, 'comercial', 'operar') then raise exception 'Sem permissão para salvar contratos'; end if;
  select * into m from crm_modelos where id = p_modelo and org_id = o.org_id;
  if m.id is null then raise exception 'Modelo de contrato não encontrado'; end if;
  if coalesce(trim(p_texto), '') = '' then raise exception 'O texto do contrato está vazio'; end if;
  if p_valores is null or jsonb_typeof(p_valores) <> 'object' then raise exception 'Preencha os valores do contrato'; end if;
  begin
    v_hon := nullif(p_valores ->> 'honorario_mensal', '')::numeric;
  exception when others then
    raise exception 'Honorário mensal inválido';
  end;

  select * into u from crm_contratos where oportunidade_id = o.id order by criado_em desc limit 1;
  if u.id is not null and u.status = 'rascunho' then
    update crm_contratos
       set valores = p_valores, texto = replace(p_texto, '{{numero}}', coalesce(u.numero, '')),
           modelo_id = m.id, modelo_versao = m.versao
     where id = u.id
    returning * into c;
  else
    v_ano := to_char(app.hoje(o.org_id), 'YYYY');
    perform pg_advisory_xact_lock(hashtext('crm_contrato_numero:' || o.org_id::text || ':' || v_ano));
    select coalesce(max(nullif(split_part(numero, '/', 2), '')::int), 0) + 1 into v_seq
      from crm_contratos where org_id = o.org_id and numero ~ ('^' || v_ano || '/[0-9]+$');
    v_numero := v_ano || '/' || lpad(v_seq::text, 3, '0');
    insert into crm_contratos (org_id, oportunidade_id, modelo_id, modelo_versao, numero, valores, texto, criado_por)
    values (o.org_id, o.id, m.id, m.versao, v_numero, p_valores, replace(p_texto, '{{numero}}', v_numero), auth.uid())
    returning * into c;
    insert into crm_atividades (org_id, oportunidade_id, tipo, texto, concluida, autor_id)
    values (o.org_id, o.id, 'contrato', 'Contrato ' || v_numero || ' criado (' || app.crm_brl(v_hon) || '/mês)', true, auth.uid());
  end if;

  update crm_oportunidades set valor_mensal = nullif(v_hon, 0) where id = o.id;
  return to_jsonb(c);
end $$;
revoke all on function public.crm_salvar_contrato(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.crm_salvar_contrato(uuid, uuid, jsonb, text) to authenticated;
comment on function public.crm_salvar_contrato(uuid, uuid, jsonb, text) is
  'Salva o contrato da oportunidade (rascunho atualiza; senão numera AAAA/NNN sem repetir e cria), valor do funil e histórico numa transação.';

create or replace function public.crm_marcar_contrato(p_contrato uuid, p_status text, p_converter boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare c crm_contratos; o crm_oportunidades; v_nome text;
begin
  select * into c from crm_contratos where id = p_contrato for update;
  if c.id is null then raise exception 'Contrato não encontrado'; end if;
  if not app.hub_pode(c.org_id, 'comercial', 'operar') then raise exception 'Sem permissão para mudar contratos'; end if;
  if p_status not in ('enviado', 'assinado', 'cancelado') then raise exception 'Situação de contrato inválida'; end if;
  if c.status = 'cancelado' then raise exception 'Este contrato está cancelado; crie um novo'; end if;
  if c.status = p_status then raise exception 'O contrato já está nesta situação'; end if;
  if p_converter and p_status <> 'assinado' then raise exception 'Só é possível cadastrar o cliente ao marcar como assinado'; end if;
  select * into o from crm_oportunidades where id = c.oportunidade_id for update;

  update crm_contratos
     set status = p_status,
         enviado_em = case when p_status = 'enviado' then now() else enviado_em end,
         assinado_em = case when p_status = 'assinado' then now() else assinado_em end
   where id = c.id;
  v_nome := case p_status when 'enviado' then 'enviado' when 'assinado' then 'assinado' else 'cancelado' end;
  insert into crm_atividades (org_id, oportunidade_id, tipo, texto, concluida, autor_id)
  values (c.org_id, c.oportunidade_id, 'contrato', 'Contrato ' || coalesce(c.numero, '') || ': ' || v_nome, true, auth.uid());
  if p_status = 'enviado' and o.etapa::text in ('novo', 'contato', 'reuniao') then
    update crm_oportunidades set etapa = 'proposta' where id = o.id;
  end if;
  if p_converter then
    perform public.crm_converter_cliente(o.id);
  end if;
end $$;
revoke all on function public.crm_marcar_contrato(uuid, text, boolean) from public, anon;
grant execute on function public.crm_marcar_contrato(uuid, text, boolean) to authenticated;
comment on function public.crm_marcar_contrato(uuid, text, boolean) is
  'Marca o contrato como enviado, assinado ou cancelado, com histórico e etapa do funil; ao assinar pode cadastrar o cliente. Tudo ou nada.';

create or replace function public.crm_registrar_atividade(p_op uuid, p_tipo text, p_texto text, p_quando date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare o crm_oportunidades; v_id uuid; v_fuso text;
begin
  select * into o from crm_oportunidades where id = p_op for update;
  if o.id is null then raise exception 'Oportunidade não encontrada'; end if;
  if not app.hub_pode(o.org_id, 'comercial', 'operar') then raise exception 'Sem permissão para registrar no histórico'; end if;
  if p_tipo not in ('nota', 'ligacao', 'reuniao', 'email', 'whatsapp', 'tarefa') then raise exception 'Tipo de registro inválido'; end if;
  if coalesce(trim(p_texto), '') = '' then raise exception 'Escreva o que aconteceu'; end if;
  if p_tipo = 'tarefa' and p_quando is null then raise exception 'Informe a data do próximo passo'; end if;
  select coalesce(fuso, 'America/Sao_Paulo') into v_fuso from organizacoes where id = o.org_id;

  insert into crm_atividades (org_id, oportunidade_id, tipo, texto, quando, concluida, autor_id)
  values (o.org_id, o.id, p_tipo, trim(p_texto),
          case when p_quando is not null then (p_quando + time '09:00') at time zone v_fuso end,
          p_tipo <> 'tarefa', auth.uid())
  returning id into v_id;

  update crm_oportunidades
     set proximo_contato = case when p_tipo = 'tarefa' then p_quando else proximo_contato end,
         atualizado_em = now(),
         etapa = case when o.etapa::text = 'novo' and p_tipo in ('ligacao', 'whatsapp', 'email') then 'contato'
                      when o.etapa::text = 'novo' and p_tipo = 'reuniao' then 'reuniao'
                      else etapa end
   where id = o.id;
  return v_id;
end $$;
revoke all on function public.crm_registrar_atividade(uuid, text, text, date) from public, anon;
grant execute on function public.crm_registrar_atividade(uuid, text, text, date) to authenticated;
comment on function public.crm_registrar_atividade(uuid, text, text, date) is
  'Registra conversa ou próximo passo no histórico da oportunidade e atualiza o funil numa transação.';
