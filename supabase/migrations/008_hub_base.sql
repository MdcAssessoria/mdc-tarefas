-- =====================================================================
--  008 · Base do HUB-MDC
--  Catálogo de micro sistemas, liberação por pessoa × ferramenta × papel,
--  perfis prontos, notificações (sino), auditoria e arquivos (Storage).
--  Tabelas com prefixo hub_ no esquema public (o Data API do Supabase
--  só expõe public; o prefixo cumpre o papel do esquema "hub" do desenho).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Catálogo de micro sistemas (global, igual para todas as organizações)
-- ---------------------------------------------------------------------
create table if not exists public.hub_apps (
  slug        text primary key check (slug ~ '^[a-z0-9-]{2,30}$'),
  nome        text not null,
  descricao   text not null default '',
  icone       text not null default 'grade',
  rota        text not null,
  status      text not null default 'ativo' check (status in ('ativo', 'beta', 'em_breve', 'desligado')),
  externo     boolean not null default false,
  ordem       int not null default 100
);
alter table public.hub_apps enable row level security;
create policy hub_apps_select on public.hub_apps for select to authenticated using (true);

insert into public.hub_apps (slug, nome, descricao, icone, rota, status, externo, ordem) values
  ('tarefas',      'Tarefas',             'Obrigações recorrentes e tarefas da equipe, com painel para a TV', 'check', '/tarefas', 'ativo', false, 10),
  ('societario',   'Societário',          'Aberturas, alterações contratuais e baixas, fase a fase', 'pasta', '/societario', 'beta', false, 20),
  ('demonstrativos','Demonstrativos',     'Balancete do Domínio, DRE, índices, fragilidades e parecer técnico', 'grafico', '/demonstrativos', 'beta', false, 30),
  ('atendimento',  'Atendimento',         'Caixa de entrada do chat do Portal do Cliente', 'chat', '/atendimento', 'beta', false, 40),
  ('vencimentos',  'Vencimentos',         'Certificados, procurações, alvarás e licenças com aviso 60/30/7 dias', 'relogio', '/vencimentos', 'beta', false, 50),
  ('leads',        'Leads do Simulador',  'Contatos captados pelo Simulador de Regime 2027', 'funil', 'https://mdcassessoria.github.io/mdc-simulador/painel-leads.html', 'ativo', true, 60),
  ('situacao-fiscal','Situação Fiscal',   'CNDs e pendências por cliente (e-CAC, PGFN, SEFAZ, prefeituras)', 'escudo', '/situacao-fiscal', 'em_breve', false, 70),
  ('comercial',    'Comercial',           'Lead → reunião → proposta → contrato → abertura', 'alvo', '/comercial', 'em_breve', false, 80),
  ('creditos',     'Recuperação de Créditos', 'Teses por cliente, valores estimados, retificadoras e compensações', 'moeda', '/creditos', 'em_breve', false, 90)
on conflict (slug) do update set nome = excluded.nome, descricao = excluded.descricao, icone = excluded.icone,
  rota = excluded.rota, status = excluded.status, externo = excluded.externo, ordem = excluded.ordem;

-- ---------------------------------------------------------------------
-- Liberação: pessoa × ferramenta × papel na ferramenta
-- ---------------------------------------------------------------------
create table if not exists public.hub_acessos (
  org_id        uuid not null references public.organizacoes(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  app           text not null references public.hub_apps(slug) on delete cascade,
  papel         text not null check (papel in ('ver', 'operar', 'gerir')),
  liberado_por  uuid references auth.users(id) on delete set null,
  liberado_em   timestamptz not null default now(),
  expira_em     date,
  primary key (org_id, user_id, app)
);
alter table public.hub_acessos enable row level security;

create table if not exists public.hub_perfis (
  id      uuid primary key default gen_random_uuid(),
  org_id  uuid not null references public.organizacoes(id) on delete cascade,
  nome    text not null,
  apps    jsonb not null default '{}'::jsonb,   -- {"tarefas":"operar","societario":"gerir"}
  unique (org_id, nome)
);
alter table public.hub_perfis enable row level security;

create table if not exists public.hub_auditoria (
  id       bigint generated always as identity primary key,
  org_id   uuid not null references public.organizacoes(id) on delete cascade,
  user_id  uuid,
  app      text,
  acao     text not null,
  alvo     text,
  antes    jsonb,
  depois   jsonb,
  em       timestamptz not null default now()
);
create index if not exists hub_auditoria_org_em on public.hub_auditoria (org_id, em desc);
alter table public.hub_auditoria enable row level security;

create table if not exists public.hub_notificacoes (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizacoes(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  app        text,
  titulo     text not null,
  texto      text,
  link       text,
  lida_em    timestamptz,
  criado_em  timestamptz not null default now()
);
create index if not exists hub_notif_user on public.hub_notificacoes (user_id, lida_em, criado_em desc);
alter table public.hub_notificacoes enable row level security;

-- pré-liberação de ferramentas no convite
alter table app.convites add column if not exists apps jsonb not null default '{"tarefas":"operar"}'::jsonb;

-- ---------------------------------------------------------------------
-- Regra única: app.hub_pode(org, app, papel mínimo)
-- ---------------------------------------------------------------------
create or replace function app.hub_peso(p text)
returns int language sql immutable set search_path = '' as $$
  select case p when 'ver' then 1 when 'operar' then 2 when 'gerir' then 3 else 0 end
$$;

create or replace function app.hub_pode(p_org uuid, p_app text, p_min text default 'ver')
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when app.papel(p_org) is null then false
    when app.papel(p_org) = 'admin' then true
    else exists (
      select 1 from public.hub_acessos a
       where a.org_id = p_org and a.user_id = auth.uid() and a.app = p_app
         and (a.expira_em is null or a.expira_em >= app.hoje(p_org))
         and app.hub_peso(a.papel) >= app.hub_peso(p_min))
  end
$$;

-- lista das ferramentas do usuário logado, com o papel efetivo
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
   order by a.ordem
$$;

-- políticas
create policy hub_acessos_select on public.hub_acessos for select to authenticated
  using (user_id = auth.uid() or app.papel(org_id) = 'admin');
create policy hub_perfis_select on public.hub_perfis for select to authenticated
  using (org_id in (select app.minhas_orgs()));
create policy hub_perfis_admin on public.hub_perfis for all to authenticated
  using (app.papel(org_id) = 'admin') with check (app.papel(org_id) = 'admin');
create policy hub_auditoria_select on public.hub_auditoria for select to authenticated
  using (app.papel(org_id) = 'admin');
create policy hub_notif_select on public.hub_notificacoes for select to authenticated
  using (user_id = auth.uid());
create policy hub_notif_update on public.hub_notificacoes for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy hub_notif_delete on public.hub_notificacoes for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- RPCs do administrador
-- ---------------------------------------------------------------------
create or replace function app.registrar(p_org uuid, p_app text, p_acao text, p_alvo text, p_antes jsonb, p_depois jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.hub_auditoria (org_id, user_id, app, acao, alvo, antes, depois)
  values (p_org, auth.uid(), p_app, p_acao, p_alvo, p_antes, p_depois)
$$;

-- p_papel null = retirar o acesso
create or replace function public.hub_definir_acesso(p_org uuid, p_user uuid, p_app text, p_papel text, p_expira date default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_antes text;
begin
  if app.papel(p_org) is distinct from 'admin' then
    raise exception 'Apenas administradores podem liberar ferramentas';
  end if;
  if not exists (select 1 from membros where org_id = p_org and user_id = p_user) then
    raise exception 'Pessoa não pertence à organização';
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
  perform app.registrar(p_org, 'hub', 'acesso', p_app || ':' || p_user::text,
                        to_jsonb(v_antes), to_jsonb(p_papel));
end $$;

create or replace function public.hub_aplicar_perfil(p_org uuid, p_user uuid, p_perfil uuid)
returns int language plpgsql security definer set search_path = public as $$
declare k text; v text; n int := 0; v_apps jsonb;
begin
  if app.papel(p_org) is distinct from 'admin' then
    raise exception 'Apenas administradores podem aplicar perfis';
  end if;
  select apps into v_apps from hub_perfis where id = p_perfil and org_id = p_org;
  if v_apps is null then raise exception 'Perfil não encontrado'; end if;
  for k, v in select * from jsonb_each_text(v_apps) loop
    perform public.hub_definir_acesso(p_org, p_user, k, v, null);
    n := n + 1;
  end loop;
  return n;
end $$;

-- convite com ferramentas já marcadas: quem tem conta ganha na hora; quem não tem, ao se cadastrar
create or replace function public.hub_convidar(p_org uuid, p_email text, p_nome text, p_papel papel_membro,
                                               p_setor uuid, p_apps jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare v_user uuid; k text; v text;
begin
  v_user := public.adicionar_membro(p_org, p_email, p_nome, p_papel, p_setor);
  if v_user is null then
    update app.convites set apps = coalesce(p_apps, apps) where org_id = p_org and email = lower(trim(p_email));
    return 'convite';
  end if;
  for k, v in select * from jsonb_each_text(coalesce(p_apps, '{}'::jsonb)) loop
    perform public.hub_definir_acesso(p_org, v_user, k, v, null);
  end loop;
  return 'liberado';
end $$;

-- notificação (usada pelos módulos)
create or replace function app.notificar(p_org uuid, p_user uuid, p_app text, p_titulo text, p_texto text, p_link text)
returns void language sql security definer set search_path = public as $$
  insert into public.hub_notificacoes (org_id, user_id, app, titulo, texto, link)
  select p_org, p_user, p_app, p_titulo, p_texto, p_link where p_user is not null
$$;

-- ---------------------------------------------------------------------
-- Membros novos recebem as ferramentas do convite (padrão: Tarefas)
-- ---------------------------------------------------------------------
create or replace function app.aplicar_convites()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    insert into public.membros (org_id, user_id, nome, email, papel, setor_id)
    select c.org_id, new.id,
           coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), c.nome, split_part(c.email, '@', 1)),
           c.email, c.papel, c.setor_id
      from app.convites c
     where c.email = lower(new.email)
    on conflict (org_id, user_id) do nothing;

    insert into public.hub_acessos (org_id, user_id, app, papel)
    select c.org_id, new.id, j.key, j.value
      from app.convites c, jsonb_each_text(c.apps) j
     where c.email = lower(new.email)
       and exists (select 1 from public.hub_apps a where a.slug = j.key)
    on conflict do nothing;

    delete from app.convites where email = lower(new.email);
  exception when others then
    raise warning 'aplicar_convites: %', sqlerrm;
  end;
  return new;
end $$;

-- membro adicionado direto (já tinha conta) ganha Tarefas conforme o papel
create or replace function app.tg_membro_acesso_padrao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into hub_acessos (org_id, user_id, app, papel)
  values (new.org_id, new.user_id, 'tarefas',
          case new.papel when 'gestor' then 'gerir' when 'tv' then 'ver' else 'operar' end)
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists membros_acesso_padrao on public.membros;
create trigger membros_acesso_padrao after insert on public.membros
  for each row execute function app.tg_membro_acesso_padrao();

-- membros atuais: Tarefas liberado conforme o papel
insert into public.hub_acessos (org_id, user_id, app, papel)
select org_id, user_id, 'tarefas', case papel when 'gestor' then 'gerir' when 'tv' then 'ver' else 'operar' end
  from public.membros
on conflict do nothing;

-- perfis prontos (organizações atuais e novas)
create or replace function app.semear_perfis(p_org uuid)
returns void language sql security definer set search_path = public as $$
  insert into hub_perfis (org_id, nome, apps)
  select p_org, p.nome, p.apps::jsonb
    from (values ('Fiscal',      '{"tarefas":"operar","vencimentos":"operar","atendimento":"operar"}'),
                 ('Contábil',    '{"tarefas":"operar","demonstrativos":"gerir","atendimento":"operar","vencimentos":"ver"}'),
                 ('Departamento Pessoal', '{"tarefas":"operar","atendimento":"operar"}'),
                 ('Societário',  '{"tarefas":"operar","societario":"gerir","atendimento":"operar","vencimentos":"operar"}'),
                 ('Comercial',   '{"leads":"operar","tarefas":"ver"}'),
                 ('Gestor',      '{"tarefas":"gerir","societario":"gerir","demonstrativos":"gerir","atendimento":"gerir","vencimentos":"gerir","leads":"ver"}'),
                 ('TV',          '{"tarefas":"ver"}')) as p(nome, apps)
  on conflict (org_id, nome) do nothing
$$;
select app.semear_perfis(id) from public.organizacoes;

create or replace function app.tg_org_semear()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform app.semear_perfis(new.id);
  if to_regproc('app.semear_societario') is not null then
    execute 'select app.semear_societario($1)' using new.id;
  end if;
  return new;
end $$;
drop trigger if exists organizacoes_semear on public.organizacoes;
create trigger organizacoes_semear after insert on public.organizacoes
  for each row execute function app.tg_org_semear();

-- ---------------------------------------------------------------------
-- Arquivos (Supabase Storage, bucket privado hub-arquivos)
-- caminho: <org_id>/<app>/<referência>/<arquivo>
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('hub-arquivos', 'hub-arquivos', false, 52428800)
on conflict (id) do nothing;

create table if not exists public.hub_arquivos (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizacoes(id) on delete cascade,
  app             text not null,
  ref_id          uuid,                       -- processo, tarefa, conversa, vencimento…
  cliente_id      uuid references public.clientes(id) on delete set null,
  nome            text not null,
  caminho         text not null unique,
  tamanho         bigint,
  tipo            text,
  visivel_cliente boolean not null default false,
  enviado_por     uuid references auth.users(id) on delete set null,
  enviado_em      timestamptz not null default now()
);
create index if not exists hub_arquivos_ref on public.hub_arquivos (ref_id);
alter table public.hub_arquivos enable row level security;
create policy hub_arquivos_equipe on public.hub_arquivos for all to authenticated
  using (org_id in (select app.minhas_orgs())) with check (org_id in (select app.minhas_orgs()));

-- conversão que nunca falha (texto que não é UUID vira nulo)
create or replace function app.uuid_ou_nulo(t text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  return t::uuid;
exception when others then
  return null;
end $$;

-- equipe: lê e grava arquivos da própria organização
create policy hub_storage_equipe_select on storage.objects for select to authenticated
  using (bucket_id = 'hub-arquivos' and app.uuid_ou_nulo((storage.foldername(name))[1]) in (select app.minhas_orgs()));
create policy hub_storage_equipe_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'hub-arquivos' and app.uuid_ou_nulo((storage.foldername(name))[1]) in (select app.minhas_orgs()));
create policy hub_storage_equipe_delete on storage.objects for delete to authenticated
  using (bucket_id = 'hub-arquivos' and app.uuid_ou_nulo((storage.foldername(name))[1]) in (select app.minhas_orgs()));

-- tempo real para o sino
alter publication supabase_realtime add table public.hub_notificacoes;

grant execute on all functions in schema app to authenticated;
