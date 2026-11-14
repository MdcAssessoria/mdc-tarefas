-- Base simulada mínima para os testes da 080 (PIN): só o que a migração usa.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;
create schema if not exists auth;
create schema if not exists app;
create schema if not exists extensions;
create extension if not exists pgcrypto schema extensions;
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table auth.users (id uuid primary key, email text, last_sign_in_at timestamptz);
create table public.organizacoes (id uuid primary key, nome text not null);
create table public.membros (org_id uuid not null, user_id uuid not null, papel text not null, ativo boolean not null default true,
  primary key (org_id, user_id));
create table public.hub_acessos (org_id uuid not null, user_id uuid not null, app text not null, papel text not null,
  primary key (org_id, user_id, app));
create table app.convites (org_id uuid not null, email text not null);
create table public.pessoal_convites (id uuid primary key default gen_random_uuid(), org_id uuid not null, nome text);
create table public.hub_auditoria (id bigserial, org_id uuid, user_id uuid, app text, acao text, alvo text, antes jsonb, depois jsonb);
create or replace function app.papel(p_org uuid) returns text language sql stable security definer set search_path = public as
  $$ select papel from public.membros where org_id = p_org and user_id = auth.uid() and ativo $$;
create or replace function app.registrar(p_org uuid, p_app text, p_acao text, p_alvo text, p_antes jsonb, p_depois jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.hub_auditoria (org_id, user_id, app, acao, alvo, antes, depois)
  values (p_org, auth.uid(), p_app, p_acao, p_alvo, p_antes, p_depois) $$;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@exemplo.com'), ('00000000-0000-0000-0000-0000000000a2', 'analista@exemplo.com'),
  ('00000000-0000-0000-0000-0000000000a3', 'outro@exemplo.com'), ('00000000-0000-0000-0000-0000000000a4', 'sistema@exemplo.com');
insert into public.organizacoes values ('00000000-0000-0000-0000-00000000000b', 'Financeiro pessoal (teste)'),
  ('00000000-0000-0000-0000-00000000000e', 'Escritório (teste)');
insert into public.membros values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000a1', 'admin', true),
  ('00000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-0000000000a1', 'admin', true);
