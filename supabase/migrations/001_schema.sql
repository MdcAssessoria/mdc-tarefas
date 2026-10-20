-- =====================================================================
--  MDC Tarefas — schema multiempresa (Supabase / Postgres 15+)
--  Cada organização (tenant) é isolada por RLS. A MDC é a primeira.
-- =====================================================================

create schema if not exists app;
grant usage on schema app to authenticated, anon;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type public.papel_membro    as enum ('admin', 'gestor', 'analista', 'tv');
create type public.status_tarefa   as enum ('a_fazer', 'em_andamento', 'aguardando', 'concluida', 'cancelada');
create type public.prioridade      as enum ('baixa', 'media', 'alta', 'urgente');
create type public.ajuste_vencimento as enum ('antecipa', 'posterga', 'nenhum');

-- ---------------------------------------------------------------------
-- Organizações (tenants)
-- ---------------------------------------------------------------------
create table public.organizacoes (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  slug          text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  cnpj          text,
  logo_url      text,
  cor_primaria  text not null default '#0B2820',
  cor_destaque  text not null default '#E2C17E',
  fuso          text not null default 'America/Sao_Paulo',
  plano         text not null default 'interno',
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now()
);

create table public.setores (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references public.organizacoes(id) on delete cascade,
  nome      text not null,
  cor       text not null default '#E2C17E',
  ordem     int  not null default 0,
  ativo     boolean not null default true,
  unique (org_id, id),
  unique (org_id, nome)
);

create table public.membros (
  org_id    uuid not null references public.organizacoes(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  nome      text not null,
  email     text,
  papel     public.papel_membro not null default 'analista',
  setor_id  uuid,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now(),
  primary key (org_id, user_id),
  foreign key (org_id, setor_id) references public.setores(org_id, id)
);
create index on public.membros (user_id);

create table public.clientes (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizacoes(id) on delete cascade,
  razao_social  text not null,
  nome_fantasia text,
  cnpj          text,
  regime        text check (regime in ('simples', 'presumido', 'real', 'mei', 'imune_isenta', 'pf', 'outro')),
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  unique (org_id, id)
);
create unique index clientes_org_cnpj_uk on public.clientes (org_id, cnpj) where cnpj is not null;

-- Responsável por cliente em cada setor (ex.: Fiscal = Ana, DP = João)
create table public.cliente_responsaveis (
  org_id     uuid not null,
  cliente_id uuid not null,
  setor_id   uuid not null,
  user_id    uuid not null,
  primary key (cliente_id, setor_id),
  foreign key (org_id, cliente_id) references public.clientes(org_id, id) on delete cascade,
  foreign key (org_id, setor_id)   references public.setores(org_id, id)  on delete cascade,
  foreign key (org_id, user_id)    references public.membros(org_id, user_id) on delete cascade
);

-- Feriados (org_id nulo = nacional, vale para todas)
create table public.feriados (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid references public.organizacoes(id) on delete cascade,
  data      date not null,
  descricao text not null
);
create unique index feriados_uk on public.feriados (coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid), data);

-- Obrigações / rotinas recorrentes que geram tarefas automaticamente
create table public.modelos_recorrentes (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizacoes(id) on delete cascade,
  titulo            text not null,
  descricao         text,
  setor_id          uuid,
  prioridade        public.prioridade not null default 'media',
  por_cliente       boolean not null default true,            -- uma tarefa por cliente ou uma só para a org
  regimes           text[],                                   -- nulo = todos os regimes
  meses             int[],                                    -- meses de competência; nulo = todo mês
  dia_vencimento    int not null check (dia_vencimento between 1 and 31),
  meses_apos_competencia int not null default 1 check (meses_apos_competencia between 0 and 12),
  ajuste            public.ajuste_vencimento not null default 'antecipa',
  ativo             boolean not null default true,
  criado_em         timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, setor_id) references public.setores(org_id, id)
);

-- ---------------------------------------------------------------------
-- Tarefas
-- ---------------------------------------------------------------------
create table public.tarefas (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizacoes(id) on delete cascade,
  titulo          text not null check (length(titulo) between 1 and 200),
  descricao       text,
  cliente_id      uuid,
  setor_id        uuid,
  responsavel_id  uuid,
  criado_por      uuid default auth.uid(),
  status          public.status_tarefa not null default 'a_fazer',
  prioridade      public.prioridade not null default 'media',
  prazo           date,
  competencia     date,                       -- sempre o dia 1 do mês de competência
  modelo_id       uuid,
  concluida_em    timestamptz,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  foreign key (org_id, cliente_id)     references public.clientes(org_id, id),
  foreign key (org_id, setor_id)       references public.setores(org_id, id),
  foreign key (org_id, responsavel_id) references public.membros(org_id, user_id),
  foreign key (org_id, modelo_id)      references public.modelos_recorrentes(org_id, id) on delete set null (modelo_id),
  check (competencia is null or extract(day from competencia) = 1)
);
create index tarefas_org_status_prazo on public.tarefas (org_id, status, prazo);
create index tarefas_responsavel      on public.tarefas (org_id, responsavel_id) where status not in ('concluida', 'cancelada');
create unique index tarefas_recorrencia_uk on public.tarefas (modelo_id, cliente_id, competencia) nulls not distinct
  where modelo_id is not null;

create table public.comentarios (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizacoes(id) on delete cascade,
  tarefa_id  uuid not null references public.tarefas(id) on delete cascade,
  autor_id   uuid not null default auth.uid(),
  texto      text not null check (length(texto) between 1 and 4000),
  criado_em  timestamptz not null default now()
);
create index on public.comentarios (tarefa_id, criado_em);

create table public.historico (
  id         bigserial primary key,
  org_id     uuid not null references public.organizacoes(id) on delete cascade,
  tarefa_id  uuid not null references public.tarefas(id) on delete cascade,
  user_id    uuid,
  acao       text not null,
  detalhe    jsonb,
  em         timestamptz not null default now()
);
create index on public.historico (tarefa_id, em);

-- ---------------------------------------------------------------------
-- Funções auxiliares de permissão (security definer = sem recursão de RLS)
-- ---------------------------------------------------------------------
create or replace function app.minhas_orgs()
returns setof uuid language sql stable security definer set search_path = public as $$
  select org_id from public.membros where user_id = auth.uid() and ativo
$$;

create or replace function app.papel(p_org uuid)
returns public.papel_membro language sql stable security definer set search_path = public as $$
  select papel from public.membros where org_id = p_org and user_id = auth.uid() and ativo
$$;

create or replace function app.meu_setor(p_org uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select setor_id from public.membros where org_id = p_org and user_id = auth.uid() and ativo
$$;

create or replace function app.eh_gestor(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(app.papel(p_org) in ('admin', 'gestor'), false)
$$;

create or replace function app.hoje(p_org uuid)
returns date language sql stable security definer set search_path = public as $$
  select (now() at time zone coalesce((select fuso from public.organizacoes where id = p_org), 'America/Sao_Paulo'))::date
$$;

grant execute on all functions in schema app to authenticated;

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
create or replace function app.tg_tarefa_antes()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  if new.status = 'concluida' and (tg_op = 'INSERT' or old.status is distinct from 'concluida') then
    new.concluida_em := now();
  elsif new.status <> 'concluida' then
    new.concluida_em := null;
  end if;
  if tg_op = 'UPDATE' then
    new.org_id := old.org_id;          -- tarefa nunca muda de organização
    new.criado_por := old.criado_por;
  end if;
  return new;
end $$;

create trigger tarefas_antes before insert or update on public.tarefas
  for each row execute function app.tg_tarefa_antes();

create or replace function app.tg_tarefa_historico()
returns trigger language plpgsql security definer set search_path = public as $$
declare d jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.historico (org_id, tarefa_id, user_id, acao, detalhe)
    values (new.org_id, new.id, auth.uid(), 'criada', jsonb_build_object('status', new.status));
    return new;
  end if;
  if new.status is distinct from old.status then
    d := d || jsonb_build_object('status', jsonb_build_array(old.status, new.status));
  end if;
  if new.responsavel_id is distinct from old.responsavel_id then
    d := d || jsonb_build_object('responsavel', jsonb_build_array(old.responsavel_id, new.responsavel_id));
  end if;
  if new.prazo is distinct from old.prazo then
    d := d || jsonb_build_object('prazo', jsonb_build_array(old.prazo, new.prazo));
  end if;
  if new.prioridade is distinct from old.prioridade then
    d := d || jsonb_build_object('prioridade', jsonb_build_array(old.prioridade, new.prioridade));
  end if;
  if d <> '{}'::jsonb then
    insert into public.historico (org_id, tarefa_id, user_id, acao, detalhe)
    values (new.org_id, new.id, auth.uid(), 'alterada', d);
  end if;
  return new;
end $$;

create trigger tarefas_historico after insert or update on public.tarefas
  for each row execute function app.tg_tarefa_historico();

-- Membro não pode rebaixar/remover o último admin da organização
create or replace function app.tg_membro_ultimo_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.papel = 'admin' and old.ativo
     and (tg_op = 'DELETE' or new.papel <> 'admin' or not new.ativo)
     and (select count(*) from public.membros
          where org_id = old.org_id and papel = 'admin' and ativo and user_id <> old.user_id) = 0 then
    raise exception 'A organização precisa de pelo menos um administrador ativo';
  end if;
  return coalesce(new, old);
end $$;

create trigger membros_ultimo_admin before update or delete on public.membros
  for each row execute function app.tg_membro_ultimo_admin();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.organizacoes         enable row level security;
alter table public.membros              enable row level security;
alter table public.setores              enable row level security;
alter table public.clientes             enable row level security;
alter table public.cliente_responsaveis enable row level security;
alter table public.feriados             enable row level security;
alter table public.modelos_recorrentes  enable row level security;
alter table public.tarefas              enable row level security;
alter table public.comentarios          enable row level security;
alter table public.historico            enable row level security;

-- organizações
create policy org_select on public.organizacoes for select to authenticated
  using (id in (select app.minhas_orgs()));
create policy org_update on public.organizacoes for update to authenticated
  using (app.papel(id) = 'admin') with check (app.papel(id) = 'admin');

-- membros
create policy membros_select on public.membros for select to authenticated
  using (org_id in (select app.minhas_orgs()));
create policy membros_admin on public.membros for all to authenticated
  using (app.papel(org_id) = 'admin') with check (app.papel(org_id) = 'admin');

-- cadastros (setores, clientes, responsáveis, modelos): leitura p/ membros, escrita p/ gestor+
create policy setores_select on public.setores for select to authenticated
  using (org_id in (select app.minhas_orgs()));
create policy setores_write on public.setores for all to authenticated
  using (app.eh_gestor(org_id)) with check (app.eh_gestor(org_id));

create policy clientes_select on public.clientes for select to authenticated
  using (org_id in (select app.minhas_orgs()));
create policy clientes_write on public.clientes for all to authenticated
  using (app.eh_gestor(org_id)) with check (app.eh_gestor(org_id));

create policy cresp_select on public.cliente_responsaveis for select to authenticated
  using (org_id in (select app.minhas_orgs()));
create policy cresp_write on public.cliente_responsaveis for all to authenticated
  using (app.eh_gestor(org_id)) with check (app.eh_gestor(org_id));

create policy modelos_select on public.modelos_recorrentes for select to authenticated
  using (org_id in (select app.minhas_orgs()));
create policy modelos_write on public.modelos_recorrentes for all to authenticated
  using (app.eh_gestor(org_id)) with check (app.eh_gestor(org_id));

create policy feriados_select on public.feriados for select to authenticated
  using (org_id is null or org_id in (select app.minhas_orgs()));
create policy feriados_write on public.feriados for all to authenticated
  using (org_id is not null and app.eh_gestor(org_id))
  with check (org_id is not null and app.eh_gestor(org_id));

-- tarefas: gestor/admin/tv veem tudo da org; analista vê as suas, as do seu setor e as que criou
create policy tarefas_select on public.tarefas for select to authenticated
  using (
    org_id in (select app.minhas_orgs())
    and (
      app.papel(org_id) in ('admin', 'gestor', 'tv')
      or responsavel_id = auth.uid()
      or criado_por = auth.uid()
      or (setor_id is not null and setor_id = app.meu_setor(org_id))
    )
  );
create policy tarefas_insert on public.tarefas for insert to authenticated
  with check (app.papel(org_id) in ('admin', 'gestor', 'analista') and criado_por = auth.uid());
create policy tarefas_update on public.tarefas for update to authenticated
  using (
    app.eh_gestor(org_id)
    or (app.papel(org_id) = 'analista'
        and (responsavel_id = auth.uid() or criado_por = auth.uid()
             or (setor_id is not null and setor_id = app.meu_setor(org_id))))
  )
  with check (app.papel(org_id) in ('admin', 'gestor', 'analista'));
create policy tarefas_delete on public.tarefas for delete to authenticated
  using (app.eh_gestor(org_id));

-- comentários e histórico seguem a visibilidade da tarefa
create policy coment_select on public.comentarios for select to authenticated
  using (exists (select 1 from public.tarefas t where t.id = tarefa_id));
create policy coment_insert on public.comentarios for insert to authenticated
  with check (autor_id = auth.uid()
              and app.papel(org_id) in ('admin', 'gestor', 'analista')
              and exists (select 1 from public.tarefas t where t.id = tarefa_id and t.org_id = comentarios.org_id));
create policy coment_delete on public.comentarios for delete to authenticated
  using (autor_id = auth.uid() or app.eh_gestor(org_id));

create policy hist_select on public.historico for select to authenticated
  using (exists (select 1 from public.tarefas t where t.id = tarefa_id));

-- ---------------------------------------------------------------------
-- Views do painel (security_invoker = respeitam o RLS de quem consulta)
-- ---------------------------------------------------------------------
create or replace view public.vw_painel_kpis with (security_invoker = true) as
select
  t.org_id,
  count(*) filter (where t.status not in ('concluida', 'cancelada'))                                       as abertas,
  count(*) filter (where t.status not in ('concluida', 'cancelada') and t.prazo = app.hoje(t.org_id))      as vencem_hoje,
  count(*) filter (where t.status not in ('concluida', 'cancelada') and t.prazo < app.hoje(t.org_id))      as atrasadas,
  count(*) filter (where t.status not in ('concluida', 'cancelada')
                     and t.prazo > app.hoje(t.org_id) and t.prazo <= app.hoje(t.org_id) + 7)               as proximos_7_dias,
  count(*) filter (where t.status = 'em_andamento')                                                        as em_andamento,
  count(*) filter (where t.status = 'concluida'
                     and (t.concluida_em at time zone 'America/Sao_Paulo')::date = app.hoje(t.org_id))     as concluidas_hoje,
  count(*) filter (where t.status = 'concluida'
                     and date_trunc('month', t.concluida_em at time zone 'America/Sao_Paulo')
                         = date_trunc('month', app.hoje(t.org_id)::timestamp))                             as concluidas_mes,
  round(100.0 * count(*) filter (where t.status = 'concluida'
                     and date_trunc('month', t.concluida_em at time zone 'America/Sao_Paulo')
                         = date_trunc('month', app.hoje(t.org_id)::timestamp)
                     and (t.prazo is null or (t.concluida_em at time zone 'America/Sao_Paulo')::date <= t.prazo))
        / nullif(count(*) filter (where t.status = 'concluida'
                     and date_trunc('month', t.concluida_em at time zone 'America/Sao_Paulo')
                         = date_trunc('month', app.hoje(t.org_id)::timestamp)), 0), 1)                     as pct_no_prazo_mes
from public.tarefas t
group by t.org_id;

create or replace view public.vw_painel_setores with (security_invoker = true) as
select
  s.org_id, s.id as setor_id, s.nome, s.cor, s.ordem,
  count(t.id) filter (where t.status not in ('concluida', 'cancelada'))                                  as abertas,
  count(t.id) filter (where t.status not in ('concluida', 'cancelada') and t.prazo < app.hoje(s.org_id)) as atrasadas,
  count(t.id) filter (where t.status = 'concluida'
                        and date_trunc('month', t.concluida_em at time zone 'America/Sao_Paulo')
                            = date_trunc('month', app.hoje(s.org_id)::timestamp))                        as concluidas_mes
from public.setores s
left join public.tarefas t on t.setor_id = s.id
where s.ativo
group by s.org_id, s.id, s.nome, s.cor, s.ordem;

create or replace view public.vw_painel_responsaveis with (security_invoker = true) as
select
  m.org_id, m.user_id, m.nome,
  count(t.id) filter (where t.status not in ('concluida', 'cancelada'))                                  as abertas,
  count(t.id) filter (where t.status not in ('concluida', 'cancelada') and t.prazo < app.hoje(m.org_id)) as atrasadas,
  count(t.id) filter (where t.status = 'concluida'
                        and date_trunc('month', t.concluida_em at time zone 'America/Sao_Paulo')
                            = date_trunc('month', app.hoje(m.org_id)::timestamp))                        as concluidas_mes
from public.membros m
left join public.tarefas t on t.responsavel_id = m.user_id and t.org_id = m.org_id
where m.ativo and m.papel <> 'tv'
group by m.org_id, m.user_id, m.nome;

create or replace view public.vw_painel_vencimentos with (security_invoker = true) as
select
  t.org_id, t.id, t.titulo, t.status, t.prioridade, t.prazo,
  t.prazo - app.hoje(t.org_id) as dias,
  c.razao_social as cliente, coalesce(c.nome_fantasia, c.razao_social) as cliente_curto,
  s.nome as setor, s.cor as setor_cor,
  m.nome as responsavel
from public.tarefas t
left join public.clientes c on c.id = t.cliente_id
left join public.setores  s on s.id = t.setor_id
left join public.membros  m on m.user_id = t.responsavel_id and m.org_id = t.org_id
where t.status not in ('concluida', 'cancelada')
  and t.prazo is not null
  and t.prazo <= app.hoje(t.org_id) + 3;

grant select on public.vw_painel_kpis, public.vw_painel_setores,
                public.vw_painel_responsaveis, public.vw_painel_vencimentos to authenticated;

-- ---------------------------------------------------------------------
-- Recorrência: cálculo de vencimento e geração de tarefas
-- ---------------------------------------------------------------------
create or replace function app.dia_util(p_org uuid, p_data date, p_ajuste public.ajuste_vencimento)
returns date language plpgsql stable set search_path = public as $$
declare d date := p_data; passo int;
begin
  if p_ajuste = 'nenhum' then return d; end if;
  passo := case when p_ajuste = 'antecipa' then -1 else 1 end;
  while extract(isodow from d) in (6, 7)
     or exists (select 1 from public.feriados f where f.data = d and (f.org_id is null or f.org_id = p_org)) loop
    d := d + passo;
  end loop;
  return d;
end $$;

create or replace function app.vencimento(p_modelo public.modelos_recorrentes, p_competencia date)
returns date language sql stable set search_path = public as $$
  with mes as (select (p_competencia + make_interval(months => p_modelo.meses_apos_competencia))::date as m)
  select app.dia_util(
           p_modelo.org_id,
           make_date(extract(year from m)::int, extract(month from m)::int,
                     least(p_modelo.dia_vencimento,
                           extract(day from (date_trunc('month', m) + interval '1 month - 1 day'))::int)),
           p_modelo.ajuste)
  from mes
$$;

-- Gera (idempotente) as tarefas de uma competência. p_org nulo = todas as organizações.
create or replace function app.gerar_tarefas_recorrentes(p_competencia date default null, p_org uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_comp date;
  v_qtd  int := 0;
  n      int;
  mo     public.modelos_recorrentes;
begin
  for mo in
    select m.* from public.modelos_recorrentes m
    join public.organizacoes o on o.id = m.org_id and o.ativo
    where m.ativo and (p_org is null or m.org_id = p_org)
  loop
    v_comp := date_trunc('month', coalesce(p_competencia,
                (app.hoje(mo.org_id) - interval '1 month')::date))::date;
    if mo.meses is not null and not (extract(month from v_comp)::int = any (mo.meses)) then
      continue;
    end if;

    if mo.por_cliente then
      insert into public.tarefas (org_id, titulo, descricao, cliente_id, setor_id, responsavel_id,
                                  criado_por, prioridade, prazo, competencia, modelo_id)
      select mo.org_id,
             mo.titulo || ' — ' || to_char(v_comp, 'MM/YYYY'),
             mo.descricao, c.id, mo.setor_id, cr.user_id, null, mo.prioridade,
             app.vencimento(mo, v_comp), v_comp, mo.id
      from public.clientes c
      left join public.cliente_responsaveis cr on cr.cliente_id = c.id and cr.setor_id = mo.setor_id
      where c.org_id = mo.org_id and c.ativo
        and (mo.regimes is null or c.regime = any (mo.regimes))
      on conflict do nothing;
    else
      insert into public.tarefas (org_id, titulo, descricao, setor_id, criado_por, prioridade,
                                  prazo, competencia, modelo_id)
      values (mo.org_id, mo.titulo || ' — ' || to_char(v_comp, 'MM/YYYY'), mo.descricao, mo.setor_id,
              null, mo.prioridade, app.vencimento(mo, v_comp), v_comp, mo.id)
      on conflict do nothing;
    end if;
    get diagnostics n = row_count;
    v_qtd := v_qtd + n;
  end loop;
  return v_qtd;
end $$;

revoke execute on function app.gerar_tarefas_recorrentes(date, uuid) from public, authenticated;

-- RPC para gestores gerarem manualmente uma competência da própria organização
create or replace function public.gerar_competencia(p_org uuid, p_competencia date)
returns int language plpgsql security definer set search_path = public as $$
begin
  if not app.eh_gestor(p_org) then
    raise exception 'Apenas gestores podem gerar tarefas recorrentes';
  end if;
  return app.gerar_tarefas_recorrentes(date_trunc('month', p_competencia)::date, p_org);
end $$;
grant execute on function public.gerar_competencia(uuid, date) to authenticated;

-- ---------------------------------------------------------------------
-- Onboarding de nova organização (quem cria vira admin)
-- ---------------------------------------------------------------------
create or replace function public.criar_organizacao(p_nome text, p_slug text, p_nome_usuario text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  insert into public.organizacoes (nome, slug) values (p_nome, lower(p_slug)) returning id into v_org;
  insert into public.membros (org_id, user_id, nome, email, papel)
  values (v_org, auth.uid(), p_nome_usuario, (select email from auth.users where id = auth.uid()), 'admin');
  insert into public.setores (org_id, nome, cor, ordem) values
    (v_org, 'Fiscal', '#E2C17E', 1), (v_org, 'Contábil', '#7FB3A0', 2),
    (v_org, 'Departamento Pessoal', '#9DB4E0', 3), (v_org, 'Societário', '#D9A6A6', 4);
  return v_org;
end $$;
grant execute on function public.criar_organizacao(text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- Realtime (o painel da TV escuta mudanças em tarefas)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.tarefas;
  end if;
end $$;
alter table public.tarefas replica identity full;

-- ---------------------------------------------------------------------
-- Agendamento diário (pg_cron): gera tarefas da competência anterior às 06:05
-- Idempotente — clientes novos entram automaticamente na próxima execução.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('gerar-tarefas-recorrentes', '5 9 * * *',   -- 09:05 UTC = 06:05 Brasília
                          'select app.gerar_tarefas_recorrentes()');
  else
    raise notice 'pg_cron indisponível: habilite em Database > Extensions e rode o cron.schedule manualmente';
  end if;
end $$;
