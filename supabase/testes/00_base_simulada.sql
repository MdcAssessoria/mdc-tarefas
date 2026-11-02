-- Teste local das migrações 028/029 (Postgres 16 com stubs de auth/app/organizações). Como rodar: docs/07, seção Testes SQL.
create role authenticated; create role anon;
create extension if not exists pgcrypto;
create schema auth; create schema app; grant usage on schema app to authenticated, anon;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('teste.uid', true), '')::uuid $$;
create table organizacoes (id uuid primary key default gen_random_uuid(), nome text);
create table clientes (id uuid primary key default gen_random_uuid(), org_id uuid references organizacoes, nome text, ativo boolean default true, inativo_em date);
create table hub_apps (slug text primary key, nome text, descricao text, icone text, rota text, status text, externo boolean, ordem int);
create table hub_auditoria (id bigserial primary key, org_id uuid, user_id uuid, app text, acao text, alvo text, antes jsonb, depois jsonb, em timestamptz default now());
create table portal_usuarios (user_id uuid, cliente_id uuid, org_id uuid, ativo boolean default true, permissoes text[]);
create function app.hub_peso(p text) returns int language sql immutable as $$ select case p when 'ver' then 1 when 'operar' then 2 when 'gerir' then 3 else 0 end $$;
create function app.hub_pode(p_org uuid, p_app text, p_min text default 'ver') returns boolean language sql stable as $$
  select app.hub_peso(coalesce(current_setting('teste.papel', true), '')) >= app.hub_peso(p_min) $$;
create function app.hoje(p uuid) returns date language sql stable as $$ select current_date $$;
create function app.portal_pode(p_cliente uuid, p_perm text default null) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from portal_usuarios u where u.user_id = auth.uid() and u.cliente_id = p_cliente and u.ativo and (p_perm is null or p_perm = any(u.permissoes))) $$;
create function app.registrar(p_org uuid, p_app text, p_acao text, p_alvo text, p_antes jsonb, p_depois jsonb) returns void language sql security definer set search_path = public as $$
  insert into public.hub_auditoria (org_id, user_id, app, acao, alvo, antes, depois) values (p_org, auth.uid(), p_app, p_acao, p_alvo, p_antes, p_depois) $$;
create or replace function app.tg_cliente_mesma_org() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.cliente_id is not null and not exists (select 1 from clientes where id = new.cliente_id and org_id = new.org_id) then
    raise exception 'Cliente não pertence a esta organização'; end if;
  return new; end $$;
-- stubs usados pela 031 (licenças): equipe, acessos e sino
create table if not exists membros (org_id uuid, user_id uuid, nome text, papel text, ativo boolean default true);
create table if not exists hub_acessos (org_id uuid, user_id uuid, app text, papel text);
create table if not exists hub_notificacoes (id bigserial primary key, org_id uuid, user_id uuid, app text, titulo text, texto text, link text, criado_em timestamptz default now());
create or replace function app.notificar(p_org uuid, p_user uuid, p_app text, p_titulo text, p_texto text, p_link text) returns void
  language sql security definer set search_path = public as $$
  insert into public.hub_notificacoes (org_id, user_id, app, titulo, texto, link) select p_org, p_user, p_app, p_titulo, p_texto, p_link where p_user is not null $$;
grant select, insert, update, delete on all tables in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
