-- =====================================================================
--  015 · Acesso por perfil + convite por e-mail
--  - Cada pessoa da equipe fica vinculada a um perfil (membros.perfil_id);
--    o perfil define quais ferramentas e em que nível (ver/operar/gerir).
--    Mudou o perfil → os acessos de todos os vinculados são refeitos.
--  - hub_meus_apps devolve só as ferramentas liberadas (admin vê todas).
--  - Convites guardam o perfil; o convite por e-mail é enviado pela
--    Edge Function "convite", que só aceita e-mails convidados por
--    quem tem permissão (hub_pode_enviar_convite).
-- =====================================================================

alter table public.membros add column if not exists perfil_id uuid references public.hub_perfis(id) on delete set null;
alter table app.convites add column if not exists perfil_id uuid references public.hub_perfis(id) on delete set null;
create index if not exists membros_perfil on public.membros (perfil_id) where perfil_id is not null;

-- perfis válidos: só apps do catálogo e níveis conhecidos
create or replace function app.tg_perfil_validar()
returns trigger language plpgsql set search_path = public as $$
declare k text; v text;
begin
  new.nome := trim(new.nome);
  if new.nome = '' then raise exception 'Dê um nome ao perfil'; end if;
  for k, v in select * from jsonb_each_text(coalesce(new.apps, '{}'::jsonb)) loop
    if not exists (select 1 from hub_apps where slug = k) then raise exception 'Ferramenta desconhecida: %', k; end if;
    if v not in ('ver', 'operar', 'gerir') then raise exception 'Nível inválido para %: %', k, v; end if;
  end loop;
  return new;
end $$;
drop trigger if exists hub_perfis_validar on public.hub_perfis;
create trigger hub_perfis_validar before insert or update on public.hub_perfis
  for each row execute function app.tg_perfil_validar();

-- refaz os acessos de uma pessoa a partir do perfil (substitui, não soma)
create or replace function app.sincronizar_perfil(p_org uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_apps jsonb;
begin
  select p.apps into v_apps
    from membros m join hub_perfis p on p.id = m.perfil_id
   where m.org_id = p_org and m.user_id = p_user;
  if v_apps is null then return; end if;  -- sem perfil: mantém os acessos manuais
  delete from hub_acessos a
   where a.org_id = p_org and a.user_id = p_user and not (v_apps ? a.app);
  insert into hub_acessos (org_id, user_id, app, papel, liberado_por)
  select p_org, p_user, j.key, j.value, auth.uid()
    from jsonb_each_text(v_apps) j
  on conflict (org_id, user_id, app) do update
    set papel = excluded.papel, liberado_por = excluded.liberado_por, liberado_em = now(), expira_em = null
    where hub_acessos.papel is distinct from excluded.papel or hub_acessos.expira_em is not null;
end $$;
revoke all on function app.sincronizar_perfil(uuid, uuid) from public, anon, authenticated;

create or replace function app.tg_membro_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.perfil_id is not null and (tg_op = 'INSERT' or new.perfil_id is distinct from old.perfil_id) then
    perform app.sincronizar_perfil(new.org_id, new.user_id);
  end if;
  return new;
end $$;
drop trigger if exists membros_perfil on public.membros;
create trigger membros_perfil after insert or update of perfil_id on public.membros
  for each row execute function app.tg_membro_perfil();

create or replace function app.tg_perfil_propagar()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.apps is distinct from old.apps then
    for r in select user_id from membros where org_id = new.org_id and perfil_id = new.id loop
      perform app.sincronizar_perfil(new.org_id, r.user_id);
    end loop;
    perform app.registrar(new.org_id, 'hub', 'perfil', new.nome, old.apps, new.apps);
  end if;
  return new;
end $$;
drop trigger if exists hub_perfis_propagar on public.hub_perfis;
create trigger hub_perfis_propagar after update on public.hub_perfis
  for each row execute function app.tg_perfil_propagar();

-- membro novo sem perfil continua ganhando Tarefas; com perfil, o perfil manda
create or replace function app.tg_membro_acesso_padrao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.perfil_id is null then
    insert into hub_acessos (org_id, user_id, app, papel)
    values (new.org_id, new.user_id, 'tarefas',
            case new.papel when 'gestor' then 'gerir' when 'tv' then 'ver' else 'operar' end)
    on conflict do nothing;
  end if;
  return new;
end $$;

-- vincular uma pessoa a um perfil (null = desvincula e mantém os acessos atuais como manuais)
create or replace function public.hub_definir_perfil(p_org uuid, p_user uuid, p_perfil uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_antes uuid;
begin
  if app.papel(p_org) is distinct from 'admin' then
    raise exception 'Apenas administradores definem perfis';
  end if;
  if p_perfil is not null and not exists (select 1 from hub_perfis where id = p_perfil and org_id = p_org) then
    raise exception 'Perfil não encontrado';
  end if;
  select perfil_id into v_antes from membros where org_id = p_org and user_id = p_user;
  if not found then raise exception 'Pessoa não pertence à organização'; end if;
  update membros set perfil_id = p_perfil where org_id = p_org and user_id = p_user;
  perform app.registrar(p_org, 'hub', 'vincular_perfil', p_user::text, to_jsonb(v_antes), to_jsonb(p_perfil));
end $$;
revoke all on function public.hub_definir_perfil(uuid, uuid, uuid) from public, anon;
grant execute on function public.hub_definir_perfil(uuid, uuid, uuid) to authenticated;

-- acesso manual não pode contrariar o perfil
create or replace function public.hub_definir_acesso(p_org uuid, p_user uuid, p_app text, p_papel text, p_expira date default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_antes text;
begin
  if app.papel(p_org) is distinct from 'admin' then
    raise exception 'Apenas administradores liberam ferramentas';
  end if;
  if not exists (select 1 from membros where org_id = p_org and user_id = p_user) then
    raise exception 'Pessoa não pertence à organização';
  end if;
  if exists (select 1 from membros where org_id = p_org and user_id = p_user and perfil_id is not null) then
    raise exception 'Esta pessoa segue um perfil; altere o perfil ou desvincule-a antes';
  end if;
  if p_papel is not null and p_papel not in ('ver', 'operar', 'gerir') then
    raise exception 'Nível inválido';
  end if;
  select papel into v_antes from hub_acessos where org_id = p_org and user_id = p_user and app = p_app;
  if p_papel is null then
    delete from hub_acessos where org_id = p_org and user_id = p_user and app = p_app;
  else
    insert into hub_acessos (org_id, user_id, app, papel, liberado_por, expira_em)
    values (p_org, p_user, p_app, p_papel, auth.uid(), p_expira)
    on conflict (org_id, user_id, app) do update
      set papel = excluded.papel, liberado_por = excluded.liberado_por, liberado_em = now(), expira_em = excluded.expira_em;
  end if;
  perform app.registrar(p_org, 'hub', 'acesso', p_app || ':' || p_user::text, to_jsonb(v_antes), to_jsonb(p_papel));
end $$;

-- "aplicar perfil" agora vincula (mantido pelo nome antigo para compatibilidade)
create or replace function public.hub_aplicar_perfil(p_org uuid, p_user uuid, p_perfil uuid)
returns int language plpgsql security definer set search_path = public as $$
begin
  perform public.hub_definir_perfil(p_org, p_user, p_perfil);
  return (select count(*)::int from hub_acessos where org_id = p_org and user_id = p_user);
end $$;

-- convite: guarda o perfil; quem já tem conta é vinculado na hora
drop function if exists public.hub_convidar(uuid, text, text, public.papel_membro, uuid, jsonb);
create or replace function public.hub_convidar(p_org uuid, p_email text, p_nome text, p_papel public.papel_membro,
                                               p_setor uuid, p_perfil uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_email text := lower(trim(p_email)); v_apps jsonb;
begin
  if app.papel(p_org) is distinct from 'admin' then
    raise exception 'Apenas administradores convidam pessoas';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'E-mail inválido: %', p_email; end if;
  if p_perfil is not null then
    select apps into v_apps from hub_perfis where id = p_perfil and org_id = p_org;
    if v_apps is null then raise exception 'Perfil não encontrado'; end if;
  end if;
  v_user := public.adicionar_membro(p_org, v_email, p_nome, p_papel, p_setor);
  if v_user is null then
    update app.convites set perfil_id = p_perfil, apps = coalesce(v_apps, apps)
     where org_id = p_org and email = v_email;
    perform app.registrar(p_org, 'hub', 'convite', v_email, null, to_jsonb(p_perfil));
    return 'convite';
  end if;
  if p_perfil is not null then
    update membros set perfil_id = p_perfil where org_id = p_org and user_id = v_user;
  end if;
  return 'liberado';
end $$;
revoke all on function public.hub_convidar(uuid, text, text, public.papel_membro, uuid, uuid) from public, anon;
grant execute on function public.hub_convidar(uuid, text, text, public.papel_membro, uuid, uuid) to authenticated;

-- ao criar a conta (convite por e-mail cria o usuário na hora): vira membro com o perfil
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

    -- convites antigos (sem perfil) seguem com a lista de ferramentas gravada
    insert into public.hub_acessos (org_id, user_id, app, papel)
    select c.org_id, new.id, j.key, j.value
      from app.convites c, jsonb_each_text(c.apps) j
     where c.email = lower(new.email) and c.perfil_id is null
       and exists (select 1 from public.hub_apps a where a.slug = j.key)
    on conflict do nothing;

    delete from app.convites where email = lower(new.email);
  exception when others then
    raise warning 'aplicar_convites: %', sqlerrm;
  end;
  return new;
end $$;

-- só envia e-mail de convite quem convidou: equipe (admin) ou portal (gestor / atendimento gerir)
create or replace function public.hub_pode_enviar_convite(p_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from app.convites c
                  where c.email = lower(trim(p_email)) and app.papel(c.org_id) = 'admin')
      or exists (select 1 from portal_convites c
                  where c.email = lower(trim(p_email))
                    and (app.eh_gestor(c.org_id) or app.hub_pode(c.org_id, 'atendimento', 'gerir')))
      -- reenvio: conta já criada pelo convite e nunca acessada
      or exists (select 1 from auth.users u join membros m on m.user_id = u.id
                  where lower(u.email) = lower(trim(p_email)) and u.last_sign_in_at is null
                    and app.papel(m.org_id) = 'admin')
      or exists (select 1 from auth.users u join portal_usuarios p on p.user_id = u.id
                  where lower(u.email) = lower(trim(p_email)) and u.last_sign_in_at is null
                    and (app.eh_gestor(p.org_id) or app.hub_pode(p.org_id, 'atendimento', 'gerir')))
$$;
revoke all on function public.hub_pode_enviar_convite(text) from public, anon;
grant execute on function public.hub_pode_enviar_convite(text) to authenticated;

-- situação das contas da equipe (só admin): convite aceito? último acesso?
create or replace function public.hub_situacao_contas(p_org uuid)
returns table (user_id uuid, confirmado boolean, ultimo_acesso timestamptz)
language sql stable security definer set search_path = public as $$
  select m.user_id, u.last_sign_in_at is not null, u.last_sign_in_at
    from membros m join auth.users u on u.id = m.user_id
   where m.org_id = p_org and app.papel(p_org) = 'admin'
$$;
revoke all on function public.hub_situacao_contas(uuid) from public, anon;
grant execute on function public.hub_situacao_contas(uuid) to authenticated;

-- a pessoa só enxerga as ferramentas liberadas para ela (admin vê o catálogo inteiro)
create or replace function public.hub_meus_apps(p_org uuid)
returns table (slug text, nome text, descricao text, icone text, rota text, status text, externo boolean, ordem int, papel text)
language sql stable security definer set search_path = public as $$
  select a.slug, a.nome, a.descricao, a.icone, a.rota, a.status, a.externo, a.ordem,
         case when app.papel(p_org) = 'admin' then 'gerir' else x.papel end
    from public.hub_apps a
    left join public.hub_acessos x
      on x.org_id = p_org and x.user_id = auth.uid() and x.app = a.slug
     and (x.expira_em is null or x.expira_em >= app.hoje(p_org))
   where a.status <> 'desligado'
     and app.papel(p_org) is not null
     and (app.papel(p_org) = 'admin' or (x.papel is not null and a.status <> 'em_breve'))
   order by a.ordem
$$;

-- perfis atuais ganham o CRM onde fizer sentido
update public.hub_perfis set apps = apps || '{"comercial":"operar"}'::jsonb
 where nome = 'Comercial' and not apps ? 'comercial';
update public.hub_perfis set apps = apps || '{"comercial":"gerir"}'::jsonb
 where nome = 'Gestor' and not apps ? 'comercial';
