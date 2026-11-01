-- =====================================================================================================
--  026 · Financeiro — etapa 1: plano de contas do Domínio, contas bancárias e extratos
--
--  Desenho: docs/futuro/hub-gestao-desenho.md. Piloto: a própria MDC (depois Greencore).
--  Princípio: um único cadastro de contas = o plano do Domínio do cliente. A conta bancária aponta para a conta
--  contábil do banco; nas próximas etapas, cada categoria aponta para uma conta analítica, então conciliar = contabilizar.
--
--  fin_plano_contas       plano do Domínio por cliente (importado do Excel; reimportar atualiza, nunca apaga)
--  fin_plano_importacoes  histórico das importações do plano
--  fin_contas_bancarias   contas do cliente, cada uma ligada à conta contábil analítica do banco
--  fin_extrato_lotes      cada arquivo de extrato importado (OFX ou planilha)
--  fin_extrato_linhas     lançamentos do extrato; a chave (FITID do banco ou data+valor+descrição) impede duplicidade
--
--  Acesso da equipe pela ferramenta "financeiro" (ver / operar / gerir). Acesso do cliente no Portal: etapa seguinte.
--  Gravações com regra (plano, extrato) só pelas funções fin_importar_plano e fin_importar_extrato (tudo ou nada).
-- =====================================================================================================

insert into public.hub_apps (slug, nome, descricao, icone, rota, status, externo, ordem)
values ('financeiro', 'Financeiro', 'Contas bancárias, extratos e conciliação ligados ao plano de contas do Domínio', 'moeda', '/financeiro', 'ativo', false, 35)
on conflict (slug) do nothing;

-- ------------------------------------------------------------------------------------- plano de contas
create table if not exists public.fin_plano_contas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  codigo text,
  classificacao text not null check (classificacao ~ '^\d+(\.\d+)*$'),
  descricao text not null,
  analitica boolean not null default true,
  nivel integer not null default 1,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now(),
  unique (cliente_id, classificacao)
);
create index if not exists fin_plano_contas_cliente on public.fin_plano_contas (cliente_id, classificacao);
comment on table public.fin_plano_contas is 'Plano de contas do Domínio por cliente (importado do Excel). Reimportar atualiza e inativa o que saiu; nunca apaga.';

create table if not exists public.fin_plano_importacoes (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  arquivo text not null,
  total integer not null,
  novas integer not null,
  inativadas integer not null,
  por uuid,
  em timestamptz not null default now()
);
comment on table public.fin_plano_importacoes is 'Histórico das importações do plano de contas do Domínio.';

-- ------------------------------------------------------------------------------------- contas bancárias
create table if not exists public.fin_contas_bancarias (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  nome text not null,
  banco text,
  agencia text,
  numero text,
  conta_contabil_id uuid references public.fin_plano_contas(id) on delete restrict,
  saldo_inicial numeric(15, 2) not null default 0,
  saldo_inicial_em date,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create index if not exists fin_contas_bancarias_cliente on public.fin_contas_bancarias (cliente_id);
comment on table public.fin_contas_bancarias is 'Contas bancárias do cliente; cada uma ligada à conta contábil analítica do banco no plano do Domínio.';

/** Conta bancária: mesma organização do cliente; conta contábil do mesmo cliente, analítica e ativa. */
create or replace function app.tg_fin_conta_bancaria()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from clientes c where c.id = new.cliente_id and c.org_id = new.org_id) then
    raise exception 'Cliente não pertence a esta organização';
  end if;
  if new.conta_contabil_id is not null and not exists (
    select 1 from fin_plano_contas p where p.id = new.conta_contabil_id and p.cliente_id = new.cliente_id and p.analitica and p.ativo) then
    raise exception 'A conta contábil precisa ser uma conta analítica ativa do plano deste cliente';
  end if;
  if tg_op = 'UPDATE' and (new.cliente_id is distinct from old.cliente_id or new.org_id is distinct from old.org_id) then
    raise exception 'A conta bancária não muda de cliente';
  end if;
  return new;
end $$;
revoke all on function app.tg_fin_conta_bancaria() from public, anon, authenticated;
drop trigger if exists fin_conta_bancaria_valida on public.fin_contas_bancarias;
create trigger fin_conta_bancaria_valida before insert or update on public.fin_contas_bancarias
  for each row execute function app.tg_fin_conta_bancaria();

-- ------------------------------------------------------------------------------------- extratos
create table if not exists public.fin_extrato_lotes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  conta_id uuid not null references public.fin_contas_bancarias(id) on delete restrict,
  arquivo text not null,
  formato text not null check (formato in ('ofx', 'planilha')),
  inicio date,
  fim date,
  saldo_final numeric(15, 2),
  recebidas integer not null default 0,
  novas integer not null default 0,
  repetidas integer not null default 0,
  por uuid,
  em timestamptz not null default now()
);
comment on table public.fin_extrato_lotes is 'Cada arquivo de extrato importado (OFX ou planilha), com quantas linhas eram novas e quantas já existiam.';

create table if not exists public.fin_extrato_linhas (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  conta_id uuid not null references public.fin_contas_bancarias(id) on delete restrict,
  lote_id uuid not null references public.fin_extrato_lotes(id) on delete restrict,
  data date not null,
  valor numeric(15, 2) not null check (valor <> 0),
  descricao text not null,
  documento text,
  fitid text,
  chave text not null,
  situacao text not null default 'pendente' check (situacao in ('pendente', 'conciliado', 'ignorado')),
  criado_em timestamptz not null default now(),
  unique (conta_id, chave)
);
create index if not exists fin_extrato_linhas_conta_data on public.fin_extrato_linhas (conta_id, data);
comment on table public.fin_extrato_linhas is 'Lançamentos do extrato (positivo = entrou, negativo = saiu). A chave impede importar o mesmo lançamento duas vezes.';

-- ------------------------------------------------------------------------------------- acesso (equipe)
alter table public.fin_plano_contas enable row level security;
alter table public.fin_plano_importacoes enable row level security;
alter table public.fin_contas_bancarias enable row level security;
alter table public.fin_extrato_lotes enable row level security;
alter table public.fin_extrato_linhas enable row level security;

drop policy if exists fin_plano_ver on public.fin_plano_contas;
create policy fin_plano_ver on public.fin_plano_contas for select to authenticated using (app.hub_pode(org_id, 'financeiro', 'ver'));
drop policy if exists fin_plano_imp_ver on public.fin_plano_importacoes;
create policy fin_plano_imp_ver on public.fin_plano_importacoes for select to authenticated using (app.hub_pode(org_id, 'financeiro', 'ver'));
drop policy if exists fin_contas_ver on public.fin_contas_bancarias;
create policy fin_contas_ver on public.fin_contas_bancarias for select to authenticated using (app.hub_pode(org_id, 'financeiro', 'ver'));
drop policy if exists fin_contas_incluir on public.fin_contas_bancarias;
create policy fin_contas_incluir on public.fin_contas_bancarias for insert to authenticated with check (app.hub_pode(org_id, 'financeiro', 'operar'));
drop policy if exists fin_contas_alterar on public.fin_contas_bancarias;
create policy fin_contas_alterar on public.fin_contas_bancarias for update to authenticated
  using (app.hub_pode(org_id, 'financeiro', 'operar')) with check (app.hub_pode(org_id, 'financeiro', 'operar'));
drop policy if exists fin_lotes_ver on public.fin_extrato_lotes;
create policy fin_lotes_ver on public.fin_extrato_lotes for select to authenticated using (app.hub_pode(org_id, 'financeiro', 'ver'));
drop policy if exists fin_linhas_ver on public.fin_extrato_linhas;
create policy fin_linhas_ver on public.fin_extrato_linhas for select to authenticated using (app.hub_pode(org_id, 'financeiro', 'ver'));
-- sem insert/update/delete diretos em plano, lotes e linhas: só pelas funções abaixo

-- ------------------------------------------------------------------------------------- importar plano
create or replace function public.fin_importar_plano(p_cliente uuid, p_arquivo text, p_contas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_total int; v_novas int; v_inativadas int;
begin
  select org_id into v_org from clientes where id = p_cliente;
  if v_org is null then raise exception 'Cliente não encontrado'; end if;
  if not app.hub_pode(v_org, 'financeiro', 'operar') then raise exception 'Sem permissão para importar o plano de contas'; end if;
  if jsonb_typeof(p_contas) is distinct from 'array' or jsonb_array_length(p_contas) = 0 then raise exception 'O plano veio sem contas'; end if;

  create temporary table _plano on commit drop as
    select distinct on (c.classificacao) trim(c.classificacao) as classificacao, nullif(trim(c.codigo), '') as codigo,
           coalesce(nullif(trim(c.descricao), ''), '(sem nome)') as descricao, coalesce(c.analitica, true) as analitica,
           coalesce(c.nivel, array_length(string_to_array(trim(c.classificacao), '.'), 1)) as nivel
      from jsonb_to_recordset(p_contas) as c(classificacao text, codigo text, descricao text, analitica boolean, nivel int)
     where trim(c.classificacao) ~ '^\d+(\.\d+)*$';
  select count(*) into v_total from _plano;
  if v_total = 0 then raise exception 'Nenhuma conta com classificação válida'; end if;

  select count(*) into v_novas from _plano n where not exists (select 1 from fin_plano_contas p where p.cliente_id = p_cliente and p.classificacao = n.classificacao);
  insert into fin_plano_contas (org_id, cliente_id, codigo, classificacao, descricao, analitica, nivel, ativo, atualizado_em)
  select v_org, p_cliente, n.codigo, n.classificacao, n.descricao, n.analitica, n.nivel, true, now() from _plano n
  on conflict (cliente_id, classificacao) do update
     set codigo = excluded.codigo, descricao = excluded.descricao, analitica = excluded.analitica, nivel = excluded.nivel,
         ativo = true, atualizado_em = now();
  -- conta que saiu do plano do Domínio fica inativa (pode estar ligada a banco ou lançamento)
  update fin_plano_contas p set ativo = false, atualizado_em = now()
   where p.cliente_id = p_cliente and p.ativo and not exists (select 1 from _plano n where n.classificacao = p.classificacao);
  get diagnostics v_inativadas = row_count;

  insert into fin_plano_importacoes (org_id, cliente_id, arquivo, total, novas, inativadas, por)
  values (v_org, p_cliente, p_arquivo, v_total, v_novas, v_inativadas, auth.uid());
  perform app.registrar(v_org, 'financeiro', 'importar_plano', p_cliente::text, null,
    jsonb_build_object('arquivo', p_arquivo, 'total', v_total, 'novas', v_novas, 'inativadas', v_inativadas));
  return jsonb_build_object('total', v_total, 'novas', v_novas, 'inativadas', v_inativadas);
end $$;
revoke all on function public.fin_importar_plano(uuid, text, jsonb) from public, anon;
grant execute on function public.fin_importar_plano(uuid, text, jsonb) to authenticated;
comment on function public.fin_importar_plano(uuid, text, jsonb) is
  'Importa o plano de contas do Domínio do cliente numa transação: cria as novas, atualiza as existentes e inativa as que saíram.';

-- ------------------------------------------------------------------------------------- importar extrato
create or replace function public.fin_importar_extrato(
  p_conta uuid, p_arquivo text, p_formato text, p_inicio date, p_fim date, p_saldo_final numeric, p_linhas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c fin_contas_bancarias; v_lote uuid; v_recebidas int; v_novas int;
begin
  select * into c from fin_contas_bancarias where id = p_conta;
  if c.id is null or not c.ativo then raise exception 'Conta bancária não encontrada ou inativa'; end if;
  if not app.hub_pode(c.org_id, 'financeiro', 'operar') then raise exception 'Sem permissão para importar extratos'; end if;
  if p_formato not in ('ofx', 'planilha') then raise exception 'Formato inválido'; end if;
  if jsonb_typeof(p_linhas) is distinct from 'array' or jsonb_array_length(p_linhas) = 0 then raise exception 'O extrato veio sem lançamentos'; end if;

  insert into fin_extrato_lotes (org_id, cliente_id, conta_id, arquivo, formato, inicio, fim, saldo_final, por)
  values (c.org_id, c.cliente_id, c.id, p_arquivo, p_formato, p_inicio, p_fim, p_saldo_final, auth.uid())
  returning id into v_lote;

  v_recebidas := jsonb_array_length(p_linhas);
  insert into fin_extrato_linhas (org_id, cliente_id, conta_id, lote_id, data, valor, descricao, documento, fitid, chave)
  select c.org_id, c.cliente_id, c.id, v_lote, l.data, round(l.valor, 2), coalesce(nullif(trim(l.descricao), ''), '(sem descrição)'),
         nullif(trim(l.documento), ''), nullif(trim(l.fitid), ''), l.chave
    from jsonb_to_recordset(p_linhas) as l(data date, valor numeric, descricao text, documento text, fitid text, chave text)
   where l.data is not null and l.valor is not null and round(l.valor, 2) <> 0 and coalesce(l.chave, '') <> ''
  on conflict (conta_id, chave) do nothing;
  get diagnostics v_novas = row_count;

  update fin_extrato_lotes set recebidas = v_recebidas, novas = v_novas, repetidas = v_recebidas - v_novas where id = v_lote;
  return jsonb_build_object('lote_id', v_lote, 'recebidas', v_recebidas, 'novas', v_novas, 'repetidas', v_recebidas - v_novas);
end $$;
revoke all on function public.fin_importar_extrato(uuid, text, text, date, date, numeric, jsonb) from public, anon;
grant execute on function public.fin_importar_extrato(uuid, text, text, date, date, numeric, jsonb) to authenticated;
comment on function public.fin_importar_extrato(uuid, text, text, date, date, numeric, jsonb) is
  'Importa um extrato (OFX ou planilha) numa transação: registra o lote e grava só os lançamentos que ainda não existem na conta.';
