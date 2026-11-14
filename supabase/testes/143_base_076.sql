-- Base simulada para a 076 (resumo diário do MDC · Pessoal): fuso da organização e a extensão net do agendador.
alter table organizacoes add column if not exists fuso text default 'America/Sao_Paulo';
create schema if not exists net;
create or replace function net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds int) returns bigint
  language sql as $$ select 1::bigint $$;
