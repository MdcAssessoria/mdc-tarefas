\set ON_ERROR_STOP 1
-- Base para a 047 (correções da reauditoria de 03/11/2026): o mínimo das tabelas reais que a 047 usa e que a base
-- simulada não tinha — tarefa e conversa do Portal com cliente, linhas do balancete do Portal e taxas do Societário.
alter table public.tarefas add column if not exists cliente_id uuid;
create table if not exists public.portal_conversas (id uuid primary key default gen_random_uuid(), org_id uuid, cliente_id uuid, titulo text);
create table if not exists public.portal_balancete_linhas (id uuid primary key default gen_random_uuid(), balancete_id uuid,
  saldo_anterior numeric(16,2) not null default 0, debitos numeric(16,2) not null default 0,
  creditos numeric(16,2) not null default 0, saldo_atual numeric(16,2) not null default 0);
create table if not exists public.soc_taxas (id uuid primary key default gen_random_uuid(), processo_id uuid, descricao text, valor numeric(14,2));
grant select, insert, update on public.portal_conversas, public.portal_balancete_linhas, public.soc_taxas to authenticated;
-- rotina (tarefa) do cliente c1 e do cliente c3; conversa do cliente c1
insert into public.tarefas (id, org_id, titulo, cliente_id) values
  ('00000000-0000-0000-0000-0000000047a1', '00000000-0000-0000-0000-0000000000a1', 'Guia do DAS c1', '00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000047a3', '00000000-0000-0000-0000-0000000000a1', 'Guia do DAS c3', '00000000-0000-0000-0000-0000000000c3')
on conflict do nothing;
insert into public.portal_conversas (id, org_id, cliente_id, titulo) values
  ('00000000-0000-0000-0000-0000000047b1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', 'Dúvida')
on conflict do nothing;
-- usuário do Portal do cliente c1 (envia documentos e conversa)
insert into portal_usuarios (user_id, cliente_id, org_id, ativo, permissoes) values
  ('00000000-0000-0000-0000-0000000047c1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', true,
   array['documentos', 'chat']);
-- o gatilho real de anexo imutável (020) não existia na base simulada
drop trigger if exists hub_arquivos_imutavel on public.hub_arquivos;
create trigger hub_arquivos_imutavel before update on public.hub_arquivos for each row execute function app.tg_arquivo_imutavel();
grant execute on function app.minhas_orgs() to authenticated;
