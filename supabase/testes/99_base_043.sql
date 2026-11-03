\set ON_ERROR_STOP 1
-- Base para a 043 (Ledgra Link na Cobrança Ledgra): o papel service_role existe no Supabase de verdade (é o que as
-- Funções Edge usam); aqui ele é criado com os mesmos poderes (lê e grava tudo, passa por cima do RLS).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;
grant usage on schema public, app to service_role;
grant all on all tables in schema public to service_role;
grant usage on all sequences in schema public to service_role;
-- como no Supabase: tabelas criadas depois também ficam acessíveis ao service_role
alter default privileges in schema public grant all on tables to service_role;
-- e46: analista sem a ferramenta Licenças
insert into membros (org_id, user_id, nome, papel, ativo) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000e46', 'Sem cobrança', 'analista', true) on conflict do nothing;
