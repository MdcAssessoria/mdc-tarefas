-- =====================================================================
--  019 · CRM: dar baixa (arquivar) e excluir oportunidades
--  Arquivar tira do funil sem perder o histórico (lead que não avançou,
--  perdido antigo). Excluir apaga de vez e é só para quem gere o CRM;
--  oportunidade que virou cliente ou tem contrato assinado não pode ser
--  excluída (arquive).
-- =====================================================================

alter table public.crm_oportunidades add column if not exists arquivado_em timestamptz;
alter table public.crm_oportunidades add column if not exists arquivado_por uuid references auth.users(id) on delete set null;
alter table public.crm_oportunidades add column if not exists motivo_arquivo text;
create index if not exists crm_op_ativas on public.crm_oportunidades (org_id, etapa) where arquivado_em is null;

drop policy if exists crm_op_write on public.crm_oportunidades;
create policy crm_op_insert on public.crm_oportunidades for insert to authenticated
  with check (app.hub_pode(org_id, 'comercial', 'operar'));
create policy crm_op_update on public.crm_oportunidades for update to authenticated
  using (app.hub_pode(org_id, 'comercial', 'operar')) with check (app.hub_pode(org_id, 'comercial', 'operar'));
create policy crm_op_delete on public.crm_oportunidades for delete to authenticated
  using (app.hub_pode(org_id, 'comercial', 'gerir'));

create or replace function app.tg_crm_op_excluir()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.cliente_id is not null or exists (select 1 from crm_contratos where oportunidade_id = old.id and status = 'assinado') then
    raise exception '% virou cliente ou tem contrato assinado: arquive em vez de excluir', old.empresa;
  end if;
  perform app.registrar(old.org_id, 'comercial', 'excluir_oportunidade', old.id::text, to_jsonb(old.empresa), null);
  return old;
end $$;
drop trigger if exists crm_op_excluir on public.crm_oportunidades;
create trigger crm_op_excluir before delete on public.crm_oportunidades
  for each row execute function app.tg_crm_op_excluir();

-- arquiva (ou restaura) várias de uma vez
create or replace function public.crm_arquivar(p_ids uuid[], p_motivo text, p_arquivar boolean default true)
returns int language plpgsql security definer set search_path = public as $$
declare v_org uuid; n int;
begin
  select distinct org_id into v_org from crm_oportunidades where id = any (p_ids) limit 1;
  if v_org is null then return 0; end if;
  if exists (select 1 from crm_oportunidades where id = any (p_ids) and org_id <> v_org) then
    raise exception 'Oportunidades de organizações diferentes';
  end if;
  if not app.hub_pode(v_org, 'comercial', 'operar') then raise exception 'Sem permissão no CRM'; end if;
  update crm_oportunidades
     set arquivado_em = case when p_arquivar then now() end,
         arquivado_por = case when p_arquivar then auth.uid() end,
         motivo_arquivo = case when p_arquivar then nullif(trim(p_motivo), '') end
   where id = any (p_ids) and org_id = v_org;
  get diagnostics n = row_count;
  perform app.registrar(v_org, 'comercial', case when p_arquivar then 'arquivar' else 'restaurar' end, n::text || ' oportunidade(s)', null, to_jsonb(p_motivo));
  return n;
end $$;
revoke all on function public.crm_arquivar(uuid[], text, boolean) from public, anon;
grant execute on function public.crm_arquivar(uuid[], text, boolean) to authenticated;
