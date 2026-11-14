-- Base dos testes da 075 (MDC - Pessoal): colunas reais que a base simulada não tem e duas contas sem organização.
-- O isolamento entre famílias é o mesmo das organizações do HUB (RLS por membros, 001), já coberto no banco real.
alter table organizacoes add column if not exists slug text unique;
alter table organizacoes add column if not exists plano text not null default 'interno';
alter table organizacoes add column if not exists ativo boolean not null default true;
alter table organizacoes add column if not exists gestao_cliente_id uuid;
alter table clientes add column if not exists razao_social text;
alter table clientes add column if not exists regime text;
alter table membros add column if not exists email text;
alter table auth.users add column if not exists raw_user_meta_data jsonb;
do $$ begin
  alter table membros add constraint membros_org_user_un unique (org_id, user_id);
exception when others then null; end $$;
do $$ begin
  alter table hub_acessos add constraint hub_acessos_org_user_app_un unique (org_id, user_id, app);
exception when others then null; end $$;
insert into hub_apps (slug, nome) values ('tarefas', 'Tarefas'), ('financeiro', 'Financeiro') on conflict do nothing;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000075e1', 'familia.um@exemplo.com', '{"nome":"Ana Família"}'),
  ('00000000-0000-0000-0000-0000000075e2', 'familia.dois@exemplo.com', '{}')
on conflict (id) do nothing;

-- Na base simulada o papel vinha de "teste.membro"; para os testes da família ele passa a ler a tabela membros
-- (como em produção), e só usa "teste.membro" quando a pessoa não é membro da organização.
create or replace function app.papel(p_org uuid) returns public.papel_membro language sql stable as $$
  select coalesce(
    (select m.papel::public.papel_membro from public.membros m
      where m.org_id = p_org and m.user_id = auth.uid() and coalesce(m.ativo, true) limit 1),
    nullif(current_setting('teste.membro', true), '')::public.papel_membro) $$;
