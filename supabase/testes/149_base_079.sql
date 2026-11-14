-- Base dos testes da 079: a base simulada não tem RLS em membros; aqui entram as duas políticas de produção (001)
-- para provar que as restritivas da 079 barram a família e deixam a empresa como estava.
grant usage on schema auth to authenticated; -- como em produção (auth.uid() nas regras)
alter table membros enable row level security;
drop policy if exists membros_select on membros;
create policy membros_select on membros for select to authenticated using (true);
drop policy if exists membros_admin on membros;
create policy membros_admin on membros for all to authenticated
  using (app.papel(org_id)::text = 'admin') with check (app.papel(org_id)::text = 'admin');
grant select, insert, update, delete on membros to authenticated;
