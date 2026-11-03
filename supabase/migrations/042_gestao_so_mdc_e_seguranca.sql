-- 042 — Gestão só da MDC e correções de segurança da auditoria de 03/11/2026 (docs/auditoria/2026-11-03-parecer.md).
--
-- Decisão do Edvaldo (02–03/11/2026): o HUB não vende mais módulos de gestão aos clientes; Financeiro, Entradas,
-- Saídas, Estoque, Centros de custo, Plano de contas, Relatórios e Contratos cuidam SÓ das rotinas da MDC.
--
--  1. organizacoes.gestao_cliente_id: a empresa da própria organização (MDC = CNPJ 48.140.121/0001-65).
--     app.empresa_gestao(cliente) e app.gestao_pode exigem essa empresa; o caminho do Portal para a gestão sai.
--     Gatilho em todas as tabelas fin_/fis_/est_ com cliente_id recusa gravar outra empresa (trava de banco).
--  2. S-01/B-02: 'contratos' sai de app.modulos_gestao() (quem só tinha Contratos lia todo o Financeiro, notas e
--     estoque). Contratos ganha leitura própria só dos cadastros que usa e das contas que ele mesmo gerou.
--  3. S-03: Storage hub-arquivos com controle por módulo (ler = existe o registro em hub_arquivos visível pela RLS;
--     enviar = módulo da pasta no nível operar; apagar = administrador ou quem enviou um arquivo ainda sem registro).
--  4. S-04: registro de anexo pela equipe só na pasta certa (organização/módulo/cliente) e de arquivo enviado pela
--     própria pessoa; enviado_por = quem está logado; módulo e referência do anexo não mudam depois.
--  5. B-01: valores "NaN"/infinito recusados (app.numero_campo e travas nas colunas de valor).
--  6. Desempenho (aviso do Supabase): políticas de tarefas avaliam auth.uid() uma vez só.
-- Nada se apaga: nenhuma linha é removida; dados de outras empresas (não há em produção) continuam no banco.

-- ===================================================================================================== 1 empresa da gestão
alter table public.organizacoes add column if not exists gestao_cliente_id uuid references public.clientes (id);
comment on column public.organizacoes.gestao_cliente_id is
  'Empresa (cadastro em clientes) que é a própria organização: a única cuja gestão (Financeiro, notas, estoque, contratos) o HUB controla (042).';

update public.organizacoes o
   set gestao_cliente_id = (select c.id from public.clientes c
                             where c.org_id = o.id and regexp_replace(coalesce(c.cnpj, ''), '\D', '', 'g') = '48140121000165'
                             limit 1)
 where o.gestao_cliente_id is null;

/** O cliente é a empresa da própria organização (a única com gestão no HUB)? */
create or replace function app.empresa_gestao(p_cliente uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_cliente is not null and exists (
    select 1 from clientes c join organizacoes o on o.id = c.org_id
     where c.id = p_cliente and o.gestao_cliente_id = c.id)
$$;
revoke all on function app.empresa_gestao(uuid) from public, anon;
grant execute on function app.empresa_gestao(uuid) to authenticated;
comment on function app.empresa_gestao(uuid) is 'Verdadeiro só para a empresa da própria organização (organizacoes.gestao_cliente_id) (042).';

/** Módulos de gestão (dados compartilhados da empresa): Contratos sai (tem leitura própria, item 2). */
create or replace function app.modulos_gestao()
returns text[] language sql immutable set search_path = '' as $$
  select array['financeiro', 'entradas', 'saidas', 'estoque', 'centros_custo', 'plano_contas', 'relatorios']
$$;
comment on function app.modulos_gestao() is
  'Ferramentas de gestão da própria empresa (dados compartilhados entre elas). Contratos tem leitura própria (042).';

/** Gestão: só a empresa da organização e só a equipe com algum dos módulos no nível (042: o Portal não entra mais). */
create or replace function app.gestao_pode(p_cliente uuid, p_min text, p_modulos text[])
returns boolean language sql stable security definer set search_path = public as $$
  select app.empresa_gestao(p_cliente)
     and exists (select 1 from clientes c where c.id = p_cliente and app.hub_pode_algum(c.org_id, p_modulos, p_min))
$$;
comment on function app.gestao_pode(uuid, text, text[]) is
  'Empresa da própria organização e equipe com algum dos módulos no nível pedido (042).';

create or replace function app.contratos_pode(p_cliente uuid, p_min text default 'ver')
returns boolean language sql stable security definer set search_path = public as $$
  select app.empresa_gestao(p_cliente)
     and exists (select 1 from clientes c where c.id = p_cliente and app.hub_pode(c.org_id, 'contratos', p_min))
$$;
comment on function app.contratos_pode(uuid, text) is 'Empresa da própria organização e equipe com o módulo Contratos no nível (042).';

create or replace function app.fis_org_visivel(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select app.hub_pode_algum(p_org, app.modulos_gestao(), 'ver')
$$;

create or replace function public.fis_pode_certificado(p_cliente uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select app.empresa_gestao(p_cliente)
     and exists (select 1 from clientes c where c.id = p_cliente and app.hub_pode(c.org_id, 'financeiro', 'gerir'))
$$;

-- plano e bancos: leitura por organização passa a exigir a empresa da gestão; as leituras pelo Portal saem
drop policy if exists fin_plano_ver on public.fin_plano_contas;
create policy fin_plano_ver on public.fin_plano_contas for select to authenticated
  using (app.hub_pode_algum(org_id, app.modulos_gestao(), 'ver') and app.empresa_gestao(cliente_id));
drop policy if exists fin_plano_ver_portal on public.fin_plano_contas;
drop policy if exists fin_contas_ver on public.fin_contas_bancarias;
create policy fin_contas_ver on public.fin_contas_bancarias for select to authenticated
  using (app.hub_pode_algum(org_id, app.modulos_gestao(), 'ver') and app.empresa_gestao(cliente_id));
drop policy if exists fin_contas_ver_portal on public.fin_contas_bancarias;

/** Trava: tabelas de gestão só aceitam a empresa da própria organização. */
create or replace function app.tg_gestao_so_empresa()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.cliente_id is not null and not app.empresa_gestao(new.cliente_id) then
    raise exception 'A gestão do HUB é só da empresa da MDC: não dá para lançar em outra empresa';
  end if;
  return new;
end $$;
revoke all on function app.tg_gestao_so_empresa() from public, anon, authenticated;

do $$
declare t text;
begin
  for t in
    select c.table_name from information_schema.columns c
      join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name and x.table_type = 'BASE TABLE'
     where c.table_schema = 'public' and c.column_name = 'cliente_id'
       and (c.table_name like 'fin\_%' or c.table_name like 'fis\_%' or c.table_name like 'est\_%')
  loop
    execute format('drop trigger if exists gestao_so_empresa on public.%I', t);
    execute format('create trigger gestao_so_empresa before insert or update of cliente_id on public.%I
                      for each row execute function app.tg_gestao_so_empresa()', t);
  end loop;
end $$;

-- ===================================================================================================== 2 leitura própria do Contratos
-- cadastros que o contrato usa (fornecedor/cliente, categoria, centro, banco) e as contas que o próprio contrato gerou
do $$
declare t text;
begin
  foreach t in array array['fin_pessoas', 'fin_categorias', 'fin_centros_custo', 'fin_contas_bancarias'] loop
    execute format('drop policy if exists contratos_ver on public.%I', t);
    execute format('create policy contratos_ver on public.%I for select to authenticated using (app.contratos_pode(cliente_id, ''ver''))', t);
  end loop;
end $$;
drop policy if exists contratos_ver on public.fin_titulos;
create policy contratos_ver on public.fin_titulos for select to authenticated
  using (recorrente_id is not null and app.contratos_pode(cliente_id, 'ver'));

-- ===================================================================================================== 3 Storage por módulo
drop policy if exists hub_storage_equipe_select on storage.objects;
create policy hub_storage_equipe_select on storage.objects for select to authenticated
  using (bucket_id = 'hub-arquivos'
         and app.uuid_ou_nulo((storage.foldername(name))[1]) in (select app.minhas_orgs())
         and ((storage.foldername(name))[2] = 'marca'
              or owner_id = (select auth.uid())::text   -- o próprio envio (o Storage relê o que acabou de gravar)
              or exists (select 1 from public.hub_arquivos a where a.caminho = objects.name)));

drop policy if exists hub_storage_equipe_insert on storage.objects;
create policy hub_storage_equipe_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'hub-arquivos'
              and app.uuid_ou_nulo((storage.foldername(name))[1]) in (select app.minhas_orgs())
              and case (storage.foldername(name))[2]
                    when 'marca' then app.eh_gestor(app.uuid_ou_nulo((storage.foldername(name))[1]))
                    else app.arquivo_pode(app.uuid_ou_nulo((storage.foldername(name))[1]), (storage.foldername(name))[2], 'operar')
                  end);

drop policy if exists hub_storage_equipe_delete on storage.objects;
create policy hub_storage_equipe_delete on storage.objects for delete to authenticated
  using (bucket_id = 'hub-arquivos'
         and app.uuid_ou_nulo((storage.foldername(name))[1]) in (select app.minhas_orgs())
         and (app.papel(app.uuid_ou_nulo((storage.foldername(name))[1])) = 'admin'
              -- quem enviou desfaz o envio que falhou antes de virar registro (armazenamento.ts)
              or (owner_id = (select auth.uid())::text
                  and not exists (select 1 from public.hub_arquivos a where a.caminho = objects.name))));

-- ===================================================================================================== 4 registro do anexo
create or replace function app.tg_arquivo_equipe()
returns trigger language plpgsql security definer set search_path = public as $$
declare p text[] := storage.foldername(new.caminho);
begin
  if auth.uid() is null or not exists (select 1 from membros where org_id = new.org_id and user_id = auth.uid()) then
    return new;   -- serviço interno ou envio do cliente (tg_arquivo_cliente)
  end if;
  new.enviado_por := auth.uid();
  if p[1] is distinct from new.org_id::text or p[2] is distinct from new.app then
    raise exception 'Anexo fora da pasta do módulo: envie o arquivo de novo pela tela';
  end if;
  if new.cliente_id is not null and not app.cliente_da_org(new.cliente_id, new.org_id) then
    raise exception 'Cliente não encontrado nesta organização';
  end if;
  if new.app = 'portal' and (new.cliente_id is null or p[3] is distinct from new.cliente_id::text) then
    raise exception 'Anexo do Portal precisa estar na pasta do próprio cliente';
  end if;
  if not exists (select 1 from storage.objects o
                  where o.bucket_id = 'hub-arquivos' and o.name = new.caminho and o.owner_id = auth.uid()::text) then
    raise exception 'Arquivo não encontrado entre os enviados por você: envie de novo pela tela';
  end if;
  return new;
end $$;
revoke all on function app.tg_arquivo_equipe() from public, anon, authenticated;
drop trigger if exists hub_arquivos_equipe on public.hub_arquivos;
create trigger hub_arquivos_equipe before insert on public.hub_arquivos
  for each row execute function app.tg_arquivo_equipe();

create or replace function app.tg_arquivo_imutavel()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.caminho is distinct from old.caminho or new.org_id is distinct from old.org_id
     or new.cliente_id is distinct from old.cliente_id or new.enviado_por is distinct from old.enviado_por
     or new.app is distinct from old.app or new.ref_id is distinct from old.ref_id then
    raise exception 'Arquivo já enviado: caminho, módulo, organização, cliente e quem enviou não mudam (envie de novo)';
  end if;
  return new;
end $$;

-- ===================================================================================================== 5 NaN e infinito
create or replace function app.numero_campo(p_txt text, p_campo text)
returns numeric language plpgsql immutable set search_path = '' as $$
declare v numeric;
begin
  if nullif(trim(p_txt), '') is null then return null; end if;
  v := trim(p_txt)::numeric;
  if v = 'NaN'::numeric or v = 'Infinity'::numeric or v = '-Infinity'::numeric then raise exception 'nan'; end if;
  return v;
exception when others then
  raise exception 'Valor inválido em "%": use só números', p_campo;
end $$;
revoke all on function app.numero_campo(text, text) from public, anon, authenticated;

do $$
declare r record; n text;
begin
  for r in
    select c.table_name, c.column_name from information_schema.columns c
     where c.table_schema = 'public' and c.data_type = 'numeric'
       and (c.table_name like 'fin\_%' or c.table_name like 'est\_%' or c.table_name like 'fis\_%'
            or c.table_name like 'lic\_%' or c.table_name like 'crm\_%')
       and exists (select 1 from information_schema.tables x where x.table_schema = 'public'
                    and x.table_name = c.table_name and x.table_type = 'BASE TABLE')
  loop
    n := left(r.table_name || '_' || r.column_name, 50) || '_numero_valido';
    if not exists (select 1 from pg_constraint where conname = n) then
      execute format('alter table public.%I add constraint %I check (%I is null or %I not in (''NaN''::numeric, ''Infinity''::numeric, ''-Infinity''::numeric))',
                     r.table_name, n, r.column_name, r.column_name);
    end if;
  end loop;
end $$;

-- ===================================================================================================== 6 tarefas: auth.uid() uma vez só
drop policy if exists tarefas_select on public.tarefas;
create policy tarefas_select on public.tarefas for select to authenticated
  using ((org_id in (select app.minhas_orgs())) and app.hub_pode(org_id, 'tarefas', 'ver')
         and ((app.papel(org_id) = any (array['admin'::papel_membro, 'gestor'::papel_membro, 'tv'::papel_membro]))
              or responsavel_id = (select auth.uid()) or criado_por = (select auth.uid())
              or (setor_id is not null and setor_id = app.meu_setor(org_id))));
drop policy if exists tarefas_insert on public.tarefas;
create policy tarefas_insert on public.tarefas for insert to authenticated
  with check ((app.papel(org_id) = any (array['admin'::papel_membro, 'gestor'::papel_membro, 'analista'::papel_membro]))
              and criado_por = (select auth.uid()) and app.hub_pode(org_id, 'tarefas', 'operar'));
drop policy if exists tarefas_update on public.tarefas;
create policy tarefas_update on public.tarefas for update to authenticated
  using (app.hub_pode(org_id, 'tarefas', 'operar')
         and (app.eh_gestor(org_id)
              or ((app.papel(org_id) = 'analista'::papel_membro)
                  and (responsavel_id = (select auth.uid()) or criado_por = (select auth.uid())
                       or (setor_id is not null and setor_id = app.meu_setor(org_id))))))
  with check ((app.papel(org_id) = any (array['admin'::papel_membro, 'gestor'::papel_membro, 'analista'::papel_membro]))
              and app.hub_pode(org_id, 'tarefas', 'operar'));
