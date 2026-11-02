\set ON_ERROR_STOP 1
-- Base para a 039 (acesso por módulo; roda por último): o papel da pessoa vira o tipo real (papel_membro), e entram os
-- pedaços de produção que a 039 usa: convite da equipe (adicionar_membro simulado), Tarefas padrão do membro novo,
-- criação de conta pelo Auth (gatilho aplicar_convites) e a tabela de anexos.
create type public.papel_membro as enum ('admin', 'gestor', 'analista', 'tv');
-- app.papel passa a devolver papel_membro, como em produção (as políticas antigas que dependiam dele saem junto)
drop function app.papel(uuid) cascade;
create function app.papel(p_org uuid) returns public.papel_membro language sql stable as $$
  select nullif(current_setting('teste.membro', true), '')::public.papel_membro $$;

alter table hub_acessos add column if not exists liberado_por uuid, add column if not exists liberado_em timestamptz default now();
delete from hub_acessos a using hub_acessos b where a.ctid < b.ctid and a.org_id = b.org_id and a.user_id = b.user_id and a.app = b.app;
create unique index if not exists hub_acessos_uk on hub_acessos (org_id, user_id, app);
alter table membros add column if not exists setor_id uuid;
delete from membros a using membros b where a.ctid < b.ctid and a.org_id = b.org_id and a.user_id = b.user_id;
create unique index if not exists membros_uk on membros (org_id, user_id);
alter table app.convites add column if not exists nome text, add column if not exists papel public.papel_membro,
  add column if not exists setor_id uuid;
alter table app.convites alter column apps set default '{"tarefas":"operar"}'::jsonb;
create unique index if not exists convites_uk on app.convites (org_id, email);
insert into hub_apps (slug, nome, status) values ('tarefas', 'Tarefas', 'ativo'), ('societario', 'Societário', 'ativo'),
  ('atendimento', 'Atendimento', 'ativo'), ('desligada', 'Desligada', 'desligado')
on conflict (slug) do update set status = excluded.status;

-- adicionar_membro simulado (o real está em 027): sem conta grava convite; com conta vira membro
create or replace function public.adicionar_membro(p_org uuid, p_email text, p_nome text, p_papel public.papel_membro, p_setor uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_email text := lower(trim(p_email));
begin
  select id into v_user from auth.users where lower(email) = v_email;
  if v_user is null then
    insert into app.convites (org_id, email, nome, papel, setor_id) values (p_org, v_email, p_nome, p_papel, p_setor)
    on conflict (org_id, email) do update set nome = excluded.nome, papel = excluded.papel;
    return null;
  end if;
  insert into membros (org_id, user_id, nome, email, papel, setor_id) values (p_org, v_user, p_nome, v_email, p_papel::text, p_setor)
  on conflict (org_id, user_id) do update set papel = excluded.papel, ativo = true;
  return v_user;
end $$;

-- membro novo sem perfil ganha Tarefas (015)
create or replace function app.tg_membro_acesso_padrao() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.perfil_id is null then
    insert into hub_acessos (org_id, user_id, app, papel) values (new.org_id, new.user_id, 'tarefas', 'operar') on conflict do nothing;
  end if;
  return new;
end $$;
create trigger membros_acesso_padrao after insert on membros for each row execute function app.tg_membro_acesso_padrao();

create table public.hub_arquivos (id uuid primary key default gen_random_uuid(), org_id uuid, app text, nome text, enviado_por uuid);
alter table public.hub_arquivos enable row level security;
grant select, insert, update on public.hub_arquivos to authenticated;
grant select, insert, update on public.tarefas to authenticated;
insert into hub_arquivos (org_id, app, nome) values ('00000000-0000-0000-0000-0000000000a1', 'societario', 'contrato.pdf'),
  ('00000000-0000-0000-0000-0000000000a1', 'tarefas', 'guia.pdf');
create table if not exists public.setores (id uuid primary key default gen_random_uuid(), org_id uuid, nome text);
