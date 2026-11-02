\set ON_ERROR_STOP 1
-- Base simulada para aplicar a 036 no Postgres local: objetos de produção que a 036 altera e que a base dos testes não
-- tinha (tarefas, feriados, perfis, CRM, convites do Portal, contas do Auth). Só o mínimo de colunas que a 036 usa,
-- com as mesmas políticas que as migrações antigas criaram (a 036 as troca).
create type public.ajuste_vencimento as enum ('antecipa', 'posterga', 'nenhum');
create type public.status_tarefa as enum ('a_fazer', 'em_andamento', 'aguardando', 'concluida', 'cancelada');
alter table organizacoes add column if not exists criado_em timestamptz not null default now();
create or replace function app.eh_gestor(p_org uuid) returns boolean language sql stable as $$ select app.papel(p_org) in ('admin', 'gestor') $$;
create or replace function app.meu_setor(p_org uuid) returns uuid language sql stable as $$ select null::uuid $$;
create or replace function app.minhas_orgs() returns setof uuid language sql stable as $$ select id from organizacoes where app.papel(id) is not null $$;

create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, last_sign_in_at timestamptz,
  invited_at timestamptz, raw_user_meta_data jsonb);
create table app.convites (org_id uuid, email text, perfil_id uuid, apps jsonb);
create table app.convite_envios (user_id uuid, email text, em timestamptz default now());
alter table membros add column if not exists email text, add column if not exists perfil_id uuid;
alter table portal_usuarios add column if not exists nome text, add column if not exists email text;
create unique index if not exists portal_usuarios_pk on portal_usuarios (user_id, cliente_id);

create table public.portal_convites (org_id uuid, email text, cliente_id uuid, nome text,
  permissoes text[] not null default array['demonstrativos'], criado_em timestamptz default now(), primary key (email, cliente_id));
alter table public.portal_convites enable row level security;
create policy portal_convites_all on public.portal_convites for all to authenticated
  using (app.eh_gestor(org_id) or app.hub_pode(org_id, 'atendimento', 'gerir')) with check (app.eh_gestor(org_id) or app.hub_pode(org_id, 'atendimento', 'gerir'));

create table public.tarefas (id uuid primary key default gen_random_uuid(), org_id uuid, titulo text, status public.status_tarefa not null default 'a_fazer',
  responsavel_id uuid, criado_por uuid, setor_id uuid);
alter table public.tarefas enable row level security;
create policy tarefas_select on public.tarefas for select to authenticated using (true);
create policy tarefas_update on public.tarefas for update to authenticated using (true) with check (true);
create policy tarefas_delete on public.tarefas for delete to authenticated using (app.eh_gestor(org_id));

create table public.feriados (id uuid primary key default gen_random_uuid(), org_id uuid, data date not null, descricao text not null);
create unique index feriados_uk on public.feriados (coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid), data);
alter table public.feriados enable row level security;
create policy feriados_select on public.feriados for select to authenticated using (true);
create policy feriados_write on public.feriados for all to authenticated
  using (org_id is not null and app.eh_gestor(org_id)) with check (org_id is not null and app.eh_gestor(org_id));

create table public.hub_perfis (id uuid primary key default gen_random_uuid(), org_id uuid, nome text, apps jsonb not null default '{}', unique (org_id, nome));
alter table public.hub_perfis enable row level security;
create policy hub_perfis_select on public.hub_perfis for select to authenticated using (true);
create policy hub_perfis_admin on public.hub_perfis for all to authenticated using (app.papel(org_id) = 'admin') with check (app.papel(org_id) = 'admin');

create table public.crm_oportunidades (id uuid primary key default gen_random_uuid(), org_id uuid, empresa text, razao_social text, cnpj text,
  contato_nome text, email text, whatsapp text, cidade text, uf text, atividade text, regime_atual text, faturamento numeric,
  origem text not null default 'outro', origem_ref text, dados_origem jsonb, cliente_id uuid, criado_em timestamptz not null default now(),
  unique (org_id, origem, origem_ref));
create table public.crm_atividades (id uuid primary key default gen_random_uuid(), org_id uuid,
  oportunidade_id uuid references public.crm_oportunidades(id) on delete cascade, texto text);
create table public.crm_contratos (id uuid primary key default gen_random_uuid(), org_id uuid,
  oportunidade_id uuid references public.crm_oportunidades(id) on delete cascade, status text default 'rascunho');
alter table public.crm_oportunidades enable row level security;
alter table public.crm_atividades enable row level security;
alter table public.crm_contratos enable row level security;
create policy crm_op_select on public.crm_oportunidades for select to authenticated using (app.hub_pode(org_id, 'comercial', 'ver'));
create policy crm_op_delete on public.crm_oportunidades for delete to authenticated using (app.hub_pode(org_id, 'comercial', 'gerir'));
create policy crm_at_write on public.crm_atividades for all to authenticated
  using (app.hub_pode(org_id, 'comercial', 'operar')) with check (app.hub_pode(org_id, 'comercial', 'operar'));
create policy crm_ct_write on public.crm_contratos for all to authenticated
  using (app.hub_pode(org_id, 'comercial', 'operar')) with check (app.hub_pode(org_id, 'comercial', 'operar'));

create policy venc_delete on public.venc_itens for delete to authenticated using (app.hub_pode(org_id, 'vencimentos', 'gerir'));
create policy clientes_write on public.clientes for all to authenticated using (app.eh_gestor(org_id)) with check (app.eh_gestor(org_id));
grant select, insert, update, delete on all tables in schema public to authenticated;
