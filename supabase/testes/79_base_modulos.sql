\set ON_ERROR_STOP 1
-- Base para testar a 035 (roda por último): app.papel lido de teste.membro; acessos reais em hub_acessos.
create or replace function app.papel(p_org uuid) returns text language sql stable as $$ select nullif(current_setting('teste.membro', true), '') $$;
alter table hub_acessos add column if not exists expira_em date;
grant select on hub_acessos to authenticated;
insert into hub_acessos (org_id, user_id, app, papel) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e7', 'estoque', 'operar'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e8', 'tarefas', 'gerir');
