-- =====================================================================
--  011 · Vencimentos
--  Certificados digitais, procurações, alvarás, licenças, AVCB, CETESB,
--  contratos. Aviso no sino aos 60, 30 e 7 dias e no dia; aos 30 dias
--  nasce a tarefa de renovação no MDC Tarefas.
-- =====================================================================

create table if not exists public.venc_itens (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id      uuid references public.clientes(id) on delete cascade,     -- nulo = da própria MDC
  tipo            text not null check (tipo in ('certificado_a1','certificado_a3','procuracao_ecac','procuracao_outra',
                                                'alvara','avcb','cetesb','vigilancia','licenca_outra','contrato','outro')),
  descricao       text,
  vence_em        date not null,
  responsavel_id  uuid references auth.users(id) on delete set null,
  status          text not null default 'ativo' check (status in ('ativo','renovado','encerrado')),
  avisos          int[] not null default '{}',     -- marcos já avisados (60, 30, 7, 0)
  tarefa_id       uuid references public.tarefas(id) on delete set null,
  substituido_por uuid references public.venc_itens(id) on delete set null,
  visivel_cliente boolean not null default true,
  observacao      text,
  criado_por      uuid references auth.users(id) on delete set null,
  criado_em       timestamptz not null default now()
);
create index if not exists venc_itens_org on public.venc_itens (org_id, status, vence_em);

alter table public.venc_itens enable row level security;
create policy venc_select on public.venc_itens for select to authenticated
  using (app.hub_pode(org_id, 'vencimentos', 'ver')
         or (visivel_cliente and cliente_id is not null and app.portal_pode(cliente_id, 'documentos')));
create policy venc_insert on public.venc_itens for insert to authenticated
  with check (app.hub_pode(org_id, 'vencimentos', 'operar'));
create policy venc_update on public.venc_itens for update to authenticated
  using (app.hub_pode(org_id, 'vencimentos', 'operar')) with check (app.hub_pode(org_id, 'vencimentos', 'operar'));
create policy venc_delete on public.venc_itens for delete to authenticated
  using (app.hub_pode(org_id, 'vencimentos', 'gerir'));

create or replace function app.venc_nome_tipo(p text)
returns text language sql immutable set search_path = '' as $$
  select case p
    when 'certificado_a1' then 'Certificado digital A1' when 'certificado_a3' then 'Certificado digital A3'
    when 'procuracao_ecac' then 'Procuração e-CAC' when 'procuracao_outra' then 'Procuração'
    when 'alvara' then 'Alvará de funcionamento' when 'avcb' then 'AVCB (Bombeiros)' when 'cetesb' then 'Licença CETESB'
    when 'vigilancia' then 'Licença da Vigilância Sanitária' when 'licenca_outra' then 'Licença'
    when 'contrato' then 'Contrato' else 'Vencimento' end
$$;

-- rotina diária: avisos e tarefa de renovação
create or replace function app.venc_avisar()
returns int language plpgsql security definer set search_path = public as $$
declare v record; v_marcos int[]; d int; n int := 0; v_setor uuid; v_dest uuid; v_tarefa uuid; v_cli text; v_titulo text;
begin
  for v in select i.*, app.hoje(i.org_id) as hoje from venc_itens i where i.status = 'ativo' loop
    d := v.vence_em - v.hoje;
    select coalesce(nome_fantasia, razao_social) into v_cli from clientes where id = v.cliente_id;
    v_titulo := app.venc_nome_tipo(v.tipo) || coalesce(' · ' || v_cli, ' · MDC');
    -- marcos alcançados e ainda não avisados: um aviso só, mesmo que o item tenha sido cadastrado em cima da hora
    select array_agg(x) into v_marcos from unnest(array[60, 30, 7, 0]) x where d <= x and not (x = any (v.avisos));
    if v_marcos is not null then
      v_dest := coalesce(v.responsavel_id,
                         (select user_id from membros where org_id = v.org_id and ativo and papel = 'admin' order by criado_em limit 1));
      perform app.notificar(v.org_id, v_dest, 'vencimentos',
        case when d < 0 then v_titulo || ' venceu' when d = 0 then v_titulo || ' vence hoje'
             else v_titulo || ' vence em ' || d || ' dias' end,
        coalesce(v.descricao || ' ', '') || '(' || to_char(v.vence_em, 'DD/MM/YYYY') || ')', '/vencimentos');
      update venc_itens set avisos = avisos || v_marcos where id = v.id;
      n := n + 1;
      if d <= 30 and v.tarefa_id is null then
        select id into v_setor from setores where org_id = v.org_id and nome ilike 'fiscal%' limit 1;
        insert into tarefas (org_id, titulo, descricao, cliente_id, setor_id, responsavel_id, criado_por, status, prioridade, prazo, visivel_cliente)
        values (v.org_id, 'Renovar ' || app.venc_nome_tipo(v.tipo), coalesce(v.descricao || ' — ', '') || 'vence em ' || to_char(v.vence_em, 'DD/MM/YYYY'),
                v.cliente_id, v_setor, v_dest, coalesce(v.criado_por, v_dest), 'a_fazer', 'alta',
                greatest(v.hoje, v.vence_em - 5), false)
        returning id into v_tarefa;
        update venc_itens set tarefa_id = v_tarefa where id = v.id;
      end if;
    end if;
  end loop;
  return n;
end $$;

-- renovação: encerra o item atual, cria o próximo e fecha a tarefa
create or replace function public.venc_renovar(p_item uuid, p_nova_data date, p_obs text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v venc_itens; v_novo uuid;
begin
  select * into v from venc_itens where id = p_item;
  if v.id is null then raise exception 'Item não encontrado'; end if;
  if not app.hub_pode(v.org_id, 'vencimentos', 'operar') then raise exception 'Sem permissão'; end if;
  if p_nova_data <= v.vence_em then raise exception 'A nova data precisa ser depois do vencimento atual'; end if;
  insert into venc_itens (org_id, cliente_id, tipo, descricao, vence_em, responsavel_id, visivel_cliente, observacao, criado_por)
  values (v.org_id, v.cliente_id, v.tipo, v.descricao, p_nova_data, v.responsavel_id, v.visivel_cliente, coalesce(p_obs, v.observacao), auth.uid())
  returning id into v_novo;
  update venc_itens set status = 'renovado', substituido_por = v_novo where id = p_item;
  if v.tarefa_id is not null then
    update tarefas set status = 'concluida' where id = v.tarefa_id and status not in ('concluida', 'cancelada');
  end if;
  return v_novo;
end $$;

-- cliente inativado: vencimentos dele deixam de avisar
create or replace function app.tg_cliente_inativo_venc()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.ativo = false and old.ativo then
    update venc_itens set status = 'encerrado' where cliente_id = new.id and status = 'ativo';
  end if;
  return new;
end $$;
drop trigger if exists clientes_inativo_venc on public.clientes;
create trigger clientes_inativo_venc after update of ativo on public.clientes
  for each row execute function app.tg_cliente_inativo_venc();

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('avisar-vencimentos', '15 9 * * *', 'select app.venc_avisar()');   -- 06:15 Brasília
  end if;
end $$;

grant execute on all functions in schema app to authenticated;

-- funções do Hub só para usuários logados
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname ~ '^(hub_|soc_|portal_|venc_)' loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
