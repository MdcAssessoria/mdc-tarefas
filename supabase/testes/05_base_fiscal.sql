-- Simulação mínima do que a migração 032 usa e o Postgres local não tem: colunas do cadastro de clientes, Vault,
-- Storage, pg_cron, Vencimentos e funções auxiliares do HUB. Só para os testes locais (supabase/testes/rodar.sh).
alter table clientes add column if not exists cnpj text, add column if not exists regime text, add column if not exists uf text,
  add column if not exists razao_social text, add column if not exists nome_fantasia text;
create role service_role bypassrls; -- como no Supabase
create schema if not exists extensions;
create function extensions.gen_random_bytes(int) returns bytea language sql as $$ select public.gen_random_bytes($1) $$;
create function app.uuid_ou_nulo(t text) returns uuid language plpgsql immutable as $$
begin return t::uuid; exception when others then return null; end $$;

create schema vault;
create table vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, secret text, description text);
create view vault.decrypted_secrets as select id, name, secret as decrypted_secret from vault.secrets;
create function vault.create_secret(s text, n text, d text) returns uuid language sql as $$
  insert into vault.secrets (name, secret, description) values (n, s, d) returning id $$;
create function vault.update_secret(i uuid, s text) returns void language sql as $$ update vault.secrets set secret = s where id = i $$;

create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;

create schema cron;
create table cron.job (jobid serial primary key, jobname text, schedule text, command text);
create function cron.schedule(n text, s text, c text) returns int language sql as $$ insert into cron.job (jobname, schedule, command) values (n, s, c) returning jobid $$;
create function cron.unschedule(n text) returns boolean language sql as $$ delete from cron.job where jobname = n returning true $$;
create table venc_itens (id uuid primary key default gen_random_uuid(), org_id uuid, cliente_id uuid, tipo text, descricao text,
  vence_em date, responsavel_id uuid, status text default 'ativo', visivel_cliente boolean, criado_por uuid);
