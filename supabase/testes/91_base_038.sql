-- Base para a 038 (contrato do CRM pelo banco): completa as tabelas do CRM simuladas em 89_base_036.sql com as
-- colunas reais (014) e simula organizacoes.fuso e crm_converter_cliente (a real cadastra o cliente; aqui só marca).
alter table public.organizacoes add column if not exists fuso text;
alter table public.crm_oportunidades
  add column if not exists etapa text not null default 'novo',
  add column if not exists valor_mensal numeric,
  add column if not exists proximo_contato date,
  add column if not exists atualizado_em timestamptz not null default now();
alter table public.crm_atividades
  add column if not exists tipo text not null default 'nota',
  add column if not exists quando timestamptz,
  add column if not exists concluida boolean not null default false,
  add column if not exists autor_id uuid,
  add column if not exists criado_em timestamptz not null default now();
alter table public.crm_contratos
  add column if not exists modelo_id uuid,
  add column if not exists modelo_versao int,
  add column if not exists numero text,
  add column if not exists valores jsonb not null default '{}'::jsonb,
  add column if not exists texto text not null default '',
  add column if not exists criado_por uuid,
  add column if not exists criado_em timestamptz not null default now(),
  add column if not exists enviado_em timestamptz,
  add column if not exists assinado_em timestamptz;
create table if not exists public.crm_modelos (id uuid primary key default gen_random_uuid(), org_id uuid, nome text, texto text,
  versao int not null default 1);
alter table public.crm_modelos enable row level security;
create policy crm_mod_select on public.crm_modelos for select to authenticated using (app.hub_pode(org_id, 'comercial', 'ver'));
grant select, insert, update on public.crm_modelos to authenticated;

create or replace function public.crm_converter_cliente(p_op uuid)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if not app.hub_pode((select org_id from crm_oportunidades where id = p_op), 'comercial', 'operar') then
    raise exception 'Sem permissão';
  end if;
  update crm_oportunidades set etapa = 'ganho' where id = p_op;
  return p_op;
end $$;
grant execute on function public.crm_converter_cliente(uuid) to authenticated;
-- leitura como na 014 (a base simulada da 036 não tinha a política de ver contratos e histórico)
create policy crm_at_select on public.crm_atividades for select to authenticated using (app.hub_pode(org_id, 'comercial', 'ver'));
create policy crm_ct_select on public.crm_contratos for select to authenticated using (app.hub_pode(org_id, 'comercial', 'ver'));
