\set ON_ERROR_STOP 1
-- Base para a 042 (gestão só da MDC e segurança de 03/11/2026): a empresa própria c41 ganha o CNPJ da MDC (a migração
-- a acha por ele); Storage com dono do arquivo; anexos com caminho/cliente; e45 só com Tarefas (operar).
alter table clientes add column if not exists cnpj text;
update clientes set cnpj = '48.140.121/0001-65' where id = '00000000-0000-0000-0000-000000000c41';
alter table storage.objects add column if not exists owner_id text;
insert into storage.buckets (id, name, public) values ('hub-arquivos', 'hub-arquivos', false) on conflict do nothing;
alter table hub_arquivos add column if not exists caminho text, add column if not exists cliente_id uuid,
  add column if not exists visivel_cliente boolean not null default false;
insert into membros (org_id, user_id, nome, papel, ativo) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000e45', 'Só tarefas', 'analista', true) on conflict do nothing;
insert into hub_acessos (org_id, user_id, app, papel) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000e45', 'tarefas', 'operar') on conflict do nothing;
-- um anexo de contrato e um do Portal de outro cliente, enviados pelo administrador
insert into storage.objects (bucket_id, name, owner_id) values
  ('hub-arquivos', '00000000-0000-0000-0000-0000000000a1/contratos/k1/contrato-aluguel.pdf', '00000000-0000-0000-0000-0000000000e1'),
  ('hub-arquivos', '00000000-0000-0000-0000-0000000000a1/portal/00000000-0000-0000-0000-0000000000c1/balancete.pdf', '00000000-0000-0000-0000-0000000000e1');
insert into hub_arquivos (org_id, app, nome, caminho, cliente_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'contratos', 'contrato-aluguel.pdf', '00000000-0000-0000-0000-0000000000a1/contratos/k1/contrato-aluguel.pdf', null),
  ('00000000-0000-0000-0000-0000000000a1', 'portal', 'balancete.pdf', '00000000-0000-0000-0000-0000000000a1/portal/00000000-0000-0000-0000-0000000000c1/balancete.pdf', '00000000-0000-0000-0000-0000000000c1');
