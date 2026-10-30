-- =====================================================================
--  016 · Correções da auditoria de segurança (30/10/2026)
--  A1  criar organização deixa de ser livre para qualquer conta
--  A2  cliente_id sempre da mesma organização do registro; portal_pode confere a organização
--  A3  publicar/despublicar só pelas funções de publicação (quem gere); excluir só quem gere
--  C1  convite do portal não aceita e-mail que já tem conta
--  M3  arquivo enviado pelo cliente só no caminho do próprio cliente
--  M4  mensagem "sistema" no chat só nasce dentro das funções do banco
--  B1  funções internas do esquema app sem execução direta
-- =====================================================================

-- ---------------------------------------------------------------- A1
revoke execute on function public.criar_organizacao(text, text, text) from authenticated;

-- ---------------------------------------------------------------- A2
create or replace function app.tg_cliente_mesma_org()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.cliente_id is not null
     and not exists (select 1 from clientes where id = new.cliente_id and org_id = new.org_id) then
    raise exception 'Cliente não pertence a esta organização';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['portal_usuarios', 'portal_convites', 'portal_conversas', 'portal_balancetes', 'portal_pareceres',
                           'portal_mapa_contas', 'portal_mapa_dfc', 'venc_itens', 'hub_arquivos', 'soc_processos', 'crm_oportunidades']
  loop
    execute format('drop trigger if exists cliente_mesma_org on public.%I', t);
    execute format('create trigger cliente_mesma_org before insert or update of cliente_id, org_id on public.%I
                    for each row execute function app.tg_cliente_mesma_org()', t);
  end loop;
end $$;

create or replace function app.portal_pode(p_cliente uuid, p_perm text default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from portal_usuarios u join clientes c on c.id = u.cliente_id and c.org_id = u.org_id
     where u.user_id = auth.uid() and u.cliente_id = p_cliente and u.ativo
       and (p_perm is null or p_perm = any (u.permissoes))
       and (c.ativo or (c.inativo_em is not null and c.inativo_em >= date_trunc('month', app.hoje(c.org_id))::date)))
$$;

-- ---------------------------------------------------------------- A3
drop policy if exists bal_equipe_write on public.portal_balancetes;
create policy bal_equipe_insert on public.portal_balancetes for insert to authenticated
  with check (app.hub_pode(org_id, 'demonstrativos', 'operar'));
create policy bal_equipe_update on public.portal_balancetes for update to authenticated
  using (app.hub_pode(org_id, 'demonstrativos', 'operar')) with check (app.hub_pode(org_id, 'demonstrativos', 'operar'));
create policy bal_equipe_delete on public.portal_balancetes for delete to authenticated
  using (app.hub_pode(org_id, 'demonstrativos', 'gerir'));

drop policy if exists bal_linhas_equipe on public.portal_balancete_linhas;
create policy bal_linhas_equipe_select on public.portal_balancete_linhas for select to authenticated
  using (app.hub_pode(org_id, 'demonstrativos', 'ver'));
create policy bal_linhas_equipe_write on public.portal_balancete_linhas for all to authenticated
  using (app.hub_pode(org_id, 'demonstrativos', 'operar')) with check (app.hub_pode(org_id, 'demonstrativos', 'operar'));

drop policy if exists parecer_equipe on public.portal_pareceres;
create policy parecer_equipe_select on public.portal_pareceres for select to authenticated
  using (app.hub_pode(org_id, 'demonstrativos', 'ver'));
create policy parecer_equipe_insert on public.portal_pareceres for insert to authenticated
  with check (app.hub_pode(org_id, 'demonstrativos', 'operar'));
create policy parecer_equipe_update on public.portal_pareceres for update to authenticated
  using (app.hub_pode(org_id, 'demonstrativos', 'operar')) with check (app.hub_pode(org_id, 'demonstrativos', 'operar'));
create policy parecer_equipe_delete on public.portal_pareceres for delete to authenticated
  using (app.hub_pode(org_id, 'demonstrativos', 'gerir'));

-- status e dados de publicação só mudam dentro das funções de publicação;
-- documento publicado só é alterado por quem gere Demonstrativos
create or replace function app.tg_publicacao_protegida()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('app.publicando', true), '') = '1' or auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'rascunho';
    new.publicado_em := null;
    if tg_table_name = 'portal_balancetes' then new.publicado_por := null; end if;
    return new;
  end if;
  if new.status is distinct from old.status or new.publicado_em is distinct from old.publicado_em then
    raise exception 'Publicar ou despublicar só pelo botão Publicar (quem gere Demonstrativos)';
  end if;
  if old.status = 'publicado' and not app.hub_pode(old.org_id, 'demonstrativos', 'gerir') then
    raise exception 'Documento já publicado: só quem gere Demonstrativos pode alterá-lo';
  end if;
  return new;
end $$;

drop trigger if exists publicacao_protegida on public.portal_balancetes;
create trigger publicacao_protegida before insert or update on public.portal_balancetes
  for each row execute function app.tg_publicacao_protegida();
drop trigger if exists publicacao_protegida on public.portal_pareceres;
create trigger publicacao_protegida before insert or update on public.portal_pareceres
  for each row execute function app.tg_publicacao_protegida();

create or replace function public.portal_publicar_balancete(p_balancete uuid, p_publicar boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare b portal_balancetes; u record; v_mes text;
begin
  select * into b from portal_balancetes where id = p_balancete;
  if b.id is null then raise exception 'Balancete não encontrado'; end if;
  if not app.hub_pode(b.org_id, 'demonstrativos', 'gerir') then
    raise exception 'Apenas quem gere Demonstrativos pode publicar para o cliente';
  end if;
  perform set_config('app.publicando', '1', true);
  update portal_balancetes
     set status = case when p_publicar then 'publicado' else 'rascunho' end,
         publicado_por = case when p_publicar then auth.uid() end,
         publicado_em = case when p_publicar then now() end
   where id = p_balancete;
  perform set_config('app.publicando', '', true);
  perform app.registrar(b.org_id, 'demonstrativos', case when p_publicar then 'publicar' else 'despublicar' end,
                        p_balancete::text, null, null);
  if p_publicar then
    v_mes := to_char(b.competencia, 'MM/YYYY');
    for u in select user_id from portal_usuarios where cliente_id = b.cliente_id and ativo and 'demonstrativos' = any (permissoes) loop
      perform app.notificar(b.org_id, u.user_id, 'portal', 'Fechamento de ' || v_mes || ' publicado',
                            'Os demonstrativos do mês já estão no portal.', '/portal');
    end loop;
  end if;
end $$;

create or replace function public.portal_publicar_parecer(p_parecer uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p portal_pareceres;
begin
  select * into p from portal_pareceres where id = p_parecer;
  if p.id is null then raise exception 'Parecer não encontrado'; end if;
  if not app.hub_pode(p.org_id, 'demonstrativos', 'gerir') then
    raise exception 'Apenas quem gere Demonstrativos pode publicar o parecer';
  end if;
  if coalesce(trim(p.contador_nome), '') = '' or coalesce(trim(p.contador_crc), '') = '' then
    raise exception 'Informe o contador responsável e o CRC antes de publicar';
  end if;
  perform set_config('app.publicando', '1', true);
  update portal_pareceres set status = 'publicado', publicado_em = now() where id = p_parecer;
  perform set_config('app.publicando', '', true);
  perform app.registrar(p.org_id, 'demonstrativos', 'publicar_parecer', p_parecer::text, null, to_jsonb(p.versao));
end $$;

-- ---------------------------------------------------------------- C1 (portal)
create or replace function app.tg_portal_convite_sem_conta()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.email := lower(trim(new.email));
  if exists (select 1 from auth.users where lower(email) = new.email) then
    raise exception 'Este e-mail já tem conta; libere o acesso pela tela de acessos do portal';
  end if;
  return new;
end $$;
drop trigger if exists portal_convite_sem_conta on public.portal_convites;
create trigger portal_convite_sem_conta before insert or update of email on public.portal_convites
  for each row execute function app.tg_portal_convite_sem_conta();

-- ---------------------------------------------------------------- M3
drop policy if exists hub_arquivos_cliente_insert on public.hub_arquivos;
create policy hub_arquivos_cliente_insert on public.hub_arquivos for insert to authenticated
  with check (app = 'portal' and visivel_cliente and cliente_id is not null
              and caminho like org_id::text || '/portal/' || cliente_id::text || '/%'
              and (app.portal_pode(cliente_id, 'documentos') or app.portal_pode(cliente_id, 'chat')));

-- ---------------------------------------------------------------- M4
create or replace function app.tg_mensagem()
returns trigger language plpgsql security definer set search_path = public as $$
declare c portal_conversas; v_equipe boolean; v_nome text; u record; v_cli text;
begin
  select * into c from portal_conversas where id = new.conversa_id;
  new.org_id := c.org_id;
  -- "sistema" só quando a própria função do banco marcou (app.msg_sistema); o resto vem do login
  if not (new.autor_tipo = 'sistema' and coalesce(current_setting('app.msg_sistema', true), '') = '1') then
    new.autor_id := auth.uid();
    v_equipe := exists (select 1 from membros where org_id = c.org_id and user_id = auth.uid() and ativo);
    new.autor_tipo := case when v_equipe then 'equipe' else 'cliente' end;
    if not v_equipe then new.interna := false; end if;
    select coalesce((select nome from membros where org_id = c.org_id and user_id = auth.uid()),
                    (select nome from portal_usuarios where user_id = auth.uid() and cliente_id = c.cliente_id))
      into v_nome;
    new.autor_nome := v_nome;
  end if;
  new.criado_em := now();
  select coalesce(nome_fantasia, razao_social) into v_cli from clientes where id = c.cliente_id;

  if new.autor_tipo = 'cliente' then
    update portal_conversas set atualizado_em = now(),
           status = case when status in ('resolvido', 'aguardando_cliente') then 'em_atendimento' else status end
     where id = c.id;
    if c.responsavel_id is not null then
      perform app.notificar(c.org_id, c.responsavel_id, 'atendimento', 'Nova mensagem de ' || v_cli,
                            left(new.texto, 140), '/atendimento?c=' || c.id);
    else
      for u in select user_id from membros where org_id = c.org_id and ativo and papel in ('admin', 'gestor') loop
        perform app.notificar(c.org_id, u.user_id, 'atendimento', 'Nova mensagem de ' || v_cli,
                              left(new.texto, 140), '/atendimento?c=' || c.id);
      end loop;
    end if;
  elsif new.autor_tipo = 'equipe' and not new.interna then
    update portal_conversas set atualizado_em = now(), respondida_em = coalesce(respondida_em, now()),
           status = case when status = 'novo' then 'em_atendimento' else status end
     where id = c.id;
  end if;
  return new;
end $$;

create or replace function public.portal_conversa_para_tarefa(p_conversa uuid, p_prazo date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare c portal_conversas; v_tarefa uuid; v_texto text;
begin
  select * into c from portal_conversas where id = p_conversa;
  if c.id is null or not app.hub_pode(c.org_id, 'atendimento', 'operar') then raise exception 'Sem permissão'; end if;
  if c.tarefa_id is not null then return c.tarefa_id; end if;
  select string_agg(coalesce(autor_nome, autor_tipo) || ': ' || texto, E'\n' order by criado_em) into v_texto
    from portal_mensagens where conversa_id = p_conversa and not interna;
  insert into tarefas (org_id, titulo, descricao, cliente_id, setor_id, responsavel_id, criado_por, status, prioridade, prazo, visivel_cliente)
  values (c.org_id, 'Atendimento: ' || c.titulo, v_texto, c.cliente_id, c.setor_id, coalesce(c.responsavel_id, auth.uid()),
          auth.uid(), 'a_fazer', 'media', coalesce(p_prazo, app.hoje(c.org_id) + 2), true)
  returning id into v_tarefa;
  update portal_conversas set tarefa_id = v_tarefa, status = 'em_atendimento' where id = p_conversa;
  perform set_config('app.msg_sistema', '1', true);
  insert into portal_mensagens (conversa_id, org_id, autor_tipo, autor_nome, texto)
  values (p_conversa, c.org_id, 'sistema', 'MDC', 'Seu pedido virou uma tarefa da equipe e já está em andamento.');
  perform set_config('app.msg_sistema', '', true);
  return v_tarefa;
end $$;

-- ---------------------------------------------------------------- B1
-- predicados usados pelas políticas continuam liberados; rotinas internas não
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app'
              and p.proname in ('gerar_tarefas_recorrentes', 'aplicar_inativacao', 'notificar', 'registrar', 'sincronizar_perfil',
                                'aplicar_convites', 'aplicar_convites_portal', 'semear_perfis')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;
