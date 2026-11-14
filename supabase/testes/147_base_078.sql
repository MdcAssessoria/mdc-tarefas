-- Base simulada para a 078 (segurança do MDC · Pessoal): ex-clientes, responsável da tarefa, convite da equipe pendente
-- e um usuário do cadastro aberto (app_metadata.origem = pessoal).
create table if not exists app.ex_clientes (email text primary key);
alter table public.tarefas add column if not exists responsavel_id uuid;
alter table public.portal_convites add column if not exists cancelado_em timestamptz;
alter table public.portal_convites add column if not exists permissoes text[];
insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000078e1', 'aberto@exemplo.com', '{"origem":"pessoal"}');
