-- =====================================================================================================
--  039 · Controle de acesso por módulo no cadastro da equipe (só administrador)
--
--  Pedido do Edvaldo (02/11/2026): ao cadastrar uma pessoa da equipe, o administrador escolhe o que ela vê, módulo a
--  módulo (ver / operar / gerir), além do caminho por perfil pronto que já existia (015).
--
--  hub_convidar        ganha p_apps (jsonb {"modulo":"nível"}): sem perfil, a pessoa recebe exatamente esses módulos.
--                      Pessoa da equipe (não administradora) sem perfil e sem módulo é recusada.
--  hub_definir_acessos troca de uma vez todos os módulos de uma pessoa (desvincula do perfil; "personalizado").
--  hub_editar_membro   aceita os módulos escolhidos (p_apps) no lugar do perfil, numa transação só.
--  aplicar_convites    convite com módulos escolhidos não ganha o Tarefas padrão se ele não foi marcado.
--
--  E fecha dois buracos do controle por módulo (o banco é a regra, não a tela):
--  tarefas             passa a exigir o módulo Tarefas (ver para ler, operar para criar e mudar), além das regras
--                      de papel que já existiam. Hoje toda a equipe tem Tarefas, então ninguém perde acesso.
--  hub_arquivos        o anexo da equipe só aparece para quem tem o módulo dele (Tarefas, Societário, Atendimento…).
-- =====================================================================================================

/** Lista de módulos escolhida na tela: só módulos do catálogo (não desligados) e níveis válidos; vazio sai como {}. */
create or replace function app.validar_apps_equipe(p_apps jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare k text; v text; r jsonb := '{}'::jsonb;
begin
  if p_apps is null then return '{}'::jsonb; end if;
  if jsonb_typeof(p_apps) <> 'object' then raise exception 'Lista de módulos inválida'; end if;
  for k, v in select * from jsonb_each_text(p_apps) loop
    continue when coalesce(v, '') = '';
    if not exists (select 1 from hub_apps where slug = k and status <> 'desligado') then
      raise exception 'Módulo desconhecido ou desligado: %', k;
    end if;
    if v not in ('ver', 'operar', 'gerir') then raise exception 'Nível inválido para %: %', k, v; end if;
    r := r || jsonb_build_object(k, v);
  end loop;
  return r;
end $$;
revoke all on function app.validar_apps_equipe(jsonb) from public, anon, authenticated;

/** Troca de uma vez os módulos de uma pessoa da equipe (acesso personalizado: sai do perfil). Só administrador. */
create or replace function public.hub_definir_acessos(p_org uuid, p_user uuid, p_apps jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v_apps jsonb; v_antes jsonb; n int;
begin
  if app.papel(p_org) is distinct from 'admin' then raise exception 'Apenas administradores liberam módulos'; end if;
  perform 1 from membros where org_id = p_org and user_id = p_user for update;
  if not found then raise exception 'Pessoa não pertence à organização'; end if;
  v_apps := app.validar_apps_equipe(p_apps);
  if v_apps = '{}'::jsonb then raise exception 'Marque ao menos um módulo (ou inative a pessoa)'; end if;
  select coalesce(jsonb_object_agg(app, papel), '{}'::jsonb) into v_antes from hub_acessos where org_id = p_org and user_id = p_user;

  update membros set perfil_id = null where org_id = p_org and user_id = p_user and perfil_id is not null;
  delete from hub_acessos where org_id = p_org and user_id = p_user and not (v_apps ? app);
  insert into hub_acessos (org_id, user_id, app, papel, liberado_por)
  select p_org, p_user, j.key, j.value, auth.uid() from jsonb_each_text(v_apps) j
  on conflict (org_id, user_id, app) do update
    set papel = excluded.papel, liberado_por = excluded.liberado_por, liberado_em = now(), expira_em = null
    where hub_acessos.papel is distinct from excluded.papel or hub_acessos.expira_em is not null;
  get diagnostics n = row_count;
  perform app.registrar(p_org, 'hub', 'acessos', p_user::text, v_antes, v_apps);
  return (select count(*)::int from hub_acessos where org_id = p_org and user_id = p_user);
end $$;
revoke all on function public.hub_definir_acessos(uuid, uuid, jsonb) from public, anon;
grant execute on function public.hub_definir_acessos(uuid, uuid, jsonb) to authenticated;
comment on function public.hub_definir_acessos(uuid, uuid, jsonb) is
  'Administrador define de uma vez os módulos (ver/operar/gerir) de uma pessoa da equipe; desvincula do perfil.';

-- convite: perfil pronto OU módulos escolhidos
drop function if exists public.hub_convidar(uuid, text, text, public.papel_membro, uuid, uuid);
create or replace function public.hub_convidar(p_org uuid, p_email text, p_nome text, p_papel public.papel_membro,
                                               p_setor uuid, p_perfil uuid, p_apps jsonb default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_email text := lower(trim(p_email)); v_apps jsonb; v_escolhidos jsonb;
begin
  if app.papel(p_org) is distinct from 'admin' then
    raise exception 'Apenas administradores convidam pessoas';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'E-mail inválido: %', p_email; end if;
  if p_perfil is not null then
    select apps into v_apps from hub_perfis where id = p_perfil and org_id = p_org and ativo;
    if v_apps is null then raise exception 'Perfil não encontrado ou inativo'; end if;
  else
    v_escolhidos := app.validar_apps_equipe(p_apps);
    if p_papel <> 'admin' and v_escolhidos = '{}'::jsonb then
      raise exception 'Escolha um perfil de acesso ou marque ao menos um módulo';
    end if;
  end if;

  v_user := public.adicionar_membro(p_org, v_email, p_nome, p_papel, p_setor);
  if v_user is null then
    update app.convites set perfil_id = p_perfil, apps = coalesce(v_apps, v_escolhidos)
     where org_id = p_org and email = v_email;
    perform app.registrar(p_org, 'hub', 'convite', v_email, null,
      jsonb_build_object('perfil', p_perfil, 'modulos', coalesce(v_apps, v_escolhidos)));
    return 'convite';
  end if;
  if p_perfil is not null then
    update membros set perfil_id = p_perfil where org_id = p_org and user_id = v_user;
  elsif p_papel <> 'admin' then
    perform public.hub_definir_acessos(p_org, v_user, v_escolhidos);
  end if;
  return 'liberado';
end $$;
revoke all on function public.hub_convidar(uuid, text, text, public.papel_membro, uuid, uuid, jsonb) from public, anon;
grant execute on function public.hub_convidar(uuid, text, text, public.papel_membro, uuid, uuid, jsonb) to authenticated;

-- ao criar a conta: convite com módulos escolhidos recebe exatamente esses módulos (sem o Tarefas padrão)
create or replace function app.aplicar_convites()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    insert into public.membros (org_id, user_id, nome, email, papel, setor_id, perfil_id)
    select c.org_id, new.id,
           coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), c.nome, split_part(c.email, '@', 1)),
           c.email, c.papel, c.setor_id, c.perfil_id
      from app.convites c
     where c.email = lower(new.email)
    on conflict (org_id, user_id) do nothing;

    -- sem perfil: os módulos gravados no convite
    insert into public.hub_acessos (org_id, user_id, app, papel)
    select c.org_id, new.id, j.key, j.value
      from app.convites c, jsonb_each_text(c.apps) j
     where c.email = lower(new.email) and c.perfil_id is null
       and exists (select 1 from public.hub_apps a where a.slug = j.key)
    on conflict (org_id, user_id, app) do update set papel = excluded.papel;
    delete from public.hub_acessos a
     using app.convites c
     where c.email = lower(new.email) and c.perfil_id is null and c.apps <> '{}'::jsonb
       and a.org_id = c.org_id and a.user_id = new.id and not (c.apps ? a.app);

    delete from app.convites where email = lower(new.email);
  exception when others then
    raise warning 'aplicar_convites: %', sqlerrm;
  end;
  return new;
end $$;

-- editar a pessoa: além do perfil, aceita os módulos escolhidos (acesso personalizado), tudo numa transação
drop function if exists public.hub_editar_membro(uuid, uuid, text, public.papel_membro, uuid, uuid, boolean);
create or replace function public.hub_editar_membro(p_org uuid, p_user uuid, p_nome text, p_papel public.papel_membro,
                                                    p_setor uuid, p_perfil uuid, p_ativo boolean, p_apps jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_antes membros;
begin
  if app.papel(p_org) is distinct from 'admin' then
    raise exception 'Apenas administradores editam pessoas';
  end if;
  select * into v_antes from membros where org_id = p_org and user_id = p_user;
  if v_antes.user_id is null then raise exception 'Pessoa não pertence à organização'; end if;
  if p_user = auth.uid() and (p_papel is distinct from 'admin' or not p_ativo) then
    raise exception 'Você não pode tirar o seu próprio acesso de administrador nem se inativar';
  end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'Informe o nome'; end if;
  if p_papel <> 'admin' and p_perfil is null and p_ativo and p_apps is null then
    raise exception 'Escolha o perfil de acesso ou os módulos (ou marque como Administrador)';
  end if;
  if p_perfil is not null and not exists (select 1 from hub_perfis where id = p_perfil and org_id = p_org and ativo) then
    raise exception 'Perfil não encontrado ou inativo';
  end if;
  if p_setor is not null and not exists (select 1 from setores where id = p_setor and org_id = p_org) then
    raise exception 'Setor não encontrado';
  end if;

  update membros
     set nome = trim(p_nome), papel = p_papel, setor_id = p_setor, ativo = p_ativo,
         perfil_id = case when p_papel = 'admin' or p_apps is not null then null else p_perfil end
   where org_id = p_org and user_id = p_user;
  if p_papel <> 'admin' and p_apps is not null then
    perform public.hub_definir_acessos(p_org, p_user, p_apps);
  end if;

  perform app.registrar(p_org, 'hub',
    case when v_antes.ativo and not p_ativo then 'inativar' when not v_antes.ativo and p_ativo then 'reativar' else 'editar_pessoa' end,
    p_user::text,
    jsonb_build_object('nome', v_antes.nome, 'papel', v_antes.papel, 'setor', v_antes.setor_id, 'perfil', v_antes.perfil_id, 'ativo', v_antes.ativo),
    jsonb_build_object('nome', trim(p_nome), 'papel', p_papel, 'setor', p_setor, 'perfil', p_perfil, 'ativo', p_ativo, 'modulos', p_apps));
end $$;
revoke all on function public.hub_editar_membro(uuid, uuid, text, public.papel_membro, uuid, uuid, boolean, jsonb) from public, anon;
grant execute on function public.hub_editar_membro(uuid, uuid, text, public.papel_membro, uuid, uuid, boolean, jsonb) to authenticated;

-- ------------------------------------------------------------------ Tarefas passa a exigir o módulo Tarefas
drop policy if exists tarefas_select on public.tarefas;
create policy tarefas_select on public.tarefas for select to authenticated
  using ((org_id in (select app.minhas_orgs())) and app.hub_pode(org_id, 'tarefas', 'ver')
         and ((app.papel(org_id) = any (array['admin'::papel_membro, 'gestor'::papel_membro, 'tv'::papel_membro]))
              or responsavel_id = auth.uid() or criado_por = auth.uid()
              or (setor_id is not null and setor_id = app.meu_setor(org_id))));
drop policy if exists tarefas_insert on public.tarefas;
create policy tarefas_insert on public.tarefas for insert to authenticated
  with check ((app.papel(org_id) = any (array['admin'::papel_membro, 'gestor'::papel_membro, 'analista'::papel_membro]))
              and criado_por = auth.uid() and app.hub_pode(org_id, 'tarefas', 'operar'));
drop policy if exists tarefas_update on public.tarefas;
create policy tarefas_update on public.tarefas for update to authenticated
  using (app.hub_pode(org_id, 'tarefas', 'operar')
         and (app.eh_gestor(org_id)
              or ((app.papel(org_id) = 'analista'::papel_membro)
                  and (responsavel_id = auth.uid() or criado_por = auth.uid()
                       or (setor_id is not null and setor_id = app.meu_setor(org_id))))))
  with check ((app.papel(org_id) = any (array['admin'::papel_membro, 'gestor'::papel_membro, 'analista'::papel_membro]))
              and app.hub_pode(org_id, 'tarefas', 'operar'));

-- ------------------------------------------------------------------ anexos da equipe: só com o módulo do anexo
/** O anexo (hub_arquivos.app) pertence a qual módulo da equipe: quem não tem o módulo não vê o anexo. */
create or replace function app.arquivo_pode(p_org uuid, p_app text, p_min text default 'ver')
returns boolean language sql stable security definer set search_path = public as $$
  select app.papel(p_org) is not null and app.papel(p_org) <> 'tv' and case p_app
    when 'chat' then app.hub_pode(p_org, 'atendimento', p_min)
    when 'portal' then app.hub_pode(p_org, 'atendimento', p_min) or app.hub_pode(p_org, 'tarefas', p_min)
    else app.hub_pode(p_org, p_app, p_min)
  end
$$;
revoke all on function app.arquivo_pode(uuid, text, text) from public, anon;
grant execute on function app.arquivo_pode(uuid, text, text) to authenticated;

drop policy if exists hub_arquivos_equipe_select on public.hub_arquivos;
create policy hub_arquivos_equipe_select on public.hub_arquivos for select to authenticated
  using ((org_id in (select app.minhas_orgs())) and app.arquivo_pode(org_id, app, 'ver'));
drop policy if exists hub_arquivos_equipe_insert on public.hub_arquivos;
create policy hub_arquivos_equipe_insert on public.hub_arquivos for insert to authenticated
  with check ((org_id in (select app.minhas_orgs())) and app.arquivo_pode(org_id, app, 'operar'));
drop policy if exists hub_arquivos_equipe_update on public.hub_arquivos;
create policy hub_arquivos_equipe_update on public.hub_arquivos for update to authenticated
  using ((org_id in (select app.minhas_orgs())) and app.arquivo_pode(org_id, app, 'operar'))
  with check ((org_id in (select app.minhas_orgs())) and app.arquivo_pode(org_id, app, 'operar'));
