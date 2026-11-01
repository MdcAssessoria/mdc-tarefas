-- =====================================================================================================
--  029 · Itens e estoque
--
--  Pedido do Edvaldo (01/11/2026): cadastro de item com regra de controle de estoque (campo "controla estoque"),
--  cadastro de estoques (locais) e baixa do estoque na saída do produto. Mesmo acesso do Financeiro (equipe e Portal).
--
--  est_itens       produtos e serviços da empresa; serviço nunca controla estoque
--  est_locais      estoques/locais (ex.: Depósito principal, Loja); um é o padrão
--  est_parametros  regra da empresa: permite ou não estoque negativo (padrão: não permite)
--  est_movimentos  entradas, saídas, ajustes de inventário e transferências (quantidade com sinal: + entra, - sai)
--  est_saldos      visão do saldo por item e local (soma dos movimentos não estornados)
--
--  Movimento só pelas funções (est_movimentar, est_estornar_movimento); a saída confere o saldo com o item travado,
--  então duas saídas ao mesmo tempo não deixam o estoque negativo. Os pedidos de venda (próxima fase) usarão
--  app.est_saida para dar baixa automática.
-- =====================================================================================================

create table if not exists public.est_itens (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  codigo text,
  nome text not null check (length(trim(nome)) > 0),
  tipo text not null default 'produto' check (tipo in ('produto', 'servico')),
  unidade text not null default 'UN' check (length(trim(unidade)) between 1 and 6),
  controla_estoque boolean not null default true,
  estoque_minimo numeric(15, 4) not null default 0 check (estoque_minimo >= 0),
  preco_venda numeric(15, 2) check (preco_venda is null or preco_venda >= 0),
  custo numeric(15, 4) check (custo is null or custo >= 0),
  ncm text check (ncm is null or ncm ~ '^\d{8}$'),
  codigo_barras text,
  categoria_receita_id uuid references public.fin_categorias(id) on delete restrict,
  categoria_despesa_id uuid references public.fin_categorias(id) on delete restrict,
  observacao text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint est_itens_servico_sem_estoque check (tipo = 'produto' or not controla_estoque)
);
create unique index if not exists est_itens_codigo on public.est_itens (cliente_id, codigo) where codigo is not null;
create index if not exists est_itens_cliente on public.est_itens (cliente_id, nome);
comment on table public.est_itens is 'Produtos e serviços da empresa. controla_estoque = o item entra e sai do estoque (serviço nunca controla).';

create table if not exists public.est_locais (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  nome text not null check (length(trim(nome)) > 0),
  padrao boolean not null default false,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (cliente_id, nome)
);
create unique index if not exists est_locais_padrao on public.est_locais (cliente_id) where padrao;
comment on table public.est_locais is 'Estoques (locais) da empresa. Um deles é o padrão, usado quando o lançamento não escolhe local.';

create table if not exists public.est_parametros (
  cliente_id uuid primary key references public.clientes(id) on delete restrict,
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  permite_negativo boolean not null default false,
  atualizado_em timestamptz not null default now()
);
comment on table public.est_parametros is 'Regras de estoque por empresa. Sem linha = não permite estoque negativo.';

create table if not exists public.est_movimentos (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  item_id uuid not null references public.est_itens(id) on delete restrict,
  local_id uuid not null references public.est_locais(id) on delete restrict,
  data date not null,
  tipo text not null check (tipo in ('entrada', 'saida', 'ajuste', 'transferencia')),
  quantidade numeric(15, 4) not null check (quantidade <> 0),
  custo_unitario numeric(15, 4) check (custo_unitario is null or custo_unitario >= 0),
  origem text not null default 'manual' check (origem in ('manual', 'pedido_compra', 'pedido_venda', 'nota_entrada', 'nota_saida')),
  origem_id text,
  grupo uuid,
  observacao text,
  estornado boolean not null default false,
  estornado_em timestamptz,
  estorno_motivo text,
  por uuid,
  em timestamptz not null default now()
);
create index if not exists est_movimentos_item on public.est_movimentos (item_id, local_id) where not estornado;
create index if not exists est_movimentos_cliente_data on public.est_movimentos (cliente_id, data);
comment on table public.est_movimentos is 'Entradas (+), saídas (-), ajustes de inventário e transferências do estoque. Estorno marca, não apaga.';

create or replace view public.est_saldos with (security_invoker = true) as
  select m.cliente_id, m.item_id, m.local_id, sum(m.quantidade) as saldo, max(m.data) as ultimo_movimento
    from public.est_movimentos m
   where not m.estornado
   group by m.cliente_id, m.item_id, m.local_id;
comment on view public.est_saldos is 'Saldo de cada item em cada local (movimentos não estornados). Respeita o acesso de quem consulta.';

/** Item: categorias da mesma empresa e do tipo certo; item que já movimentou estoque não deixa de controlar estoque. */
create or replace function app.tg_est_item()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (new.cliente_id is distinct from old.cliente_id or new.org_id is distinct from old.org_id) then
    raise exception 'O item não muda de empresa';
  end if;
  if new.categoria_receita_id is not null and not exists (
    select 1 from fin_categorias where id = new.categoria_receita_id and cliente_id = new.cliente_id and tipo = 'receita') then
    raise exception 'A categoria de venda precisa ser uma receita desta empresa';
  end if;
  if new.categoria_despesa_id is not null and not exists (
    select 1 from fin_categorias where id = new.categoria_despesa_id and cliente_id = new.cliente_id and tipo = 'despesa') then
    raise exception 'A categoria de compra precisa ser uma despesa desta empresa';
  end if;
  if tg_op = 'UPDATE' and old.controla_estoque and not new.controla_estoque
     and exists (select 1 from est_saldos s where s.item_id = new.id and s.saldo <> 0) then
    raise exception 'Este item ainda tem saldo em estoque; zere o saldo (ajuste) antes de deixar de controlar estoque';
  end if;
  return new;
end $$;
revoke all on function app.tg_est_item() from public, anon, authenticated;
drop trigger if exists est_item_valida on public.est_itens;
create trigger est_item_valida before insert or update on public.est_itens for each row execute function app.tg_est_item();

-- mesma organização, auditoria e acesso (mesmas regras do Financeiro)
do $$
declare t text;
begin
  foreach t in array array['est_itens', 'est_locais', 'est_parametros', 'est_movimentos'] loop
    execute format('drop trigger if exists cliente_mesma_org on public.%I', t);
    execute format('create trigger cliente_mesma_org before insert or update of cliente_id, org_id on public.%I
                    for each row execute function app.tg_cliente_mesma_org()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists est_ver on public.%I', t);
    execute format('create policy est_ver on public.%I for select to authenticated using (app.fin_pode(cliente_id, ''ver''))', t);
  end loop;
  foreach t in array array['est_itens', 'est_locais'] loop
    execute format('drop trigger if exists fin_auditar on public.%I', t);
    execute format('create trigger fin_auditar after insert or update on public.%I
                    for each row execute function app.tg_fin_auditar()', t);
    execute format('drop policy if exists est_incluir on public.%I', t);
    execute format('create policy est_incluir on public.%I for insert to authenticated with check (app.fin_pode(cliente_id, ''operar''))', t);
    execute format('drop policy if exists est_alterar on public.%I', t);
    execute format('create policy est_alterar on public.%I for update to authenticated
                    using (app.fin_pode(cliente_id, ''operar'')) with check (app.fin_pode(cliente_id, ''operar''))', t);
  end loop;
end $$;
-- est_parametros: só a equipe com "gerir" muda a regra de estoque negativo (função abaixo); movimentos só pelas funções.

/** Liga/desliga estoque negativo da empresa (equipe com gerir no Financeiro). */
create or replace function public.est_definir_negativo(p_cliente uuid, p_permite boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from clientes where id = p_cliente;
  if v_org is null then raise exception 'Empresa não encontrada'; end if;
  if not app.hub_pode(v_org, 'financeiro', 'gerir') then raise exception 'Só a equipe MDC (gerir) muda a regra de estoque negativo'; end if;
  insert into est_parametros (cliente_id, org_id, permite_negativo) values (p_cliente, v_org, coalesce(p_permite, false))
  on conflict (cliente_id) do update set permite_negativo = excluded.permite_negativo, atualizado_em = now();
  perform app.registrar(v_org, 'financeiro', 'estoque_negativo', p_cliente::text, null, jsonb_build_object('permite', p_permite));
end $$;
revoke all on function public.est_definir_negativo(uuid, boolean) from public, anon;
grant execute on function public.est_definir_negativo(uuid, boolean) to authenticated;

/**
 * Grava um movimento já conferido (uso interno das funções). Trava o item, confere que controla estoque e, nas
 * saídas, que o saldo do local não fica negativo (salvo se a empresa permitir).
 */
create or replace function app.est_gravar(
  p_item uuid, p_local uuid, p_data date, p_tipo text, p_qtd numeric, p_custo numeric,
  p_origem text, p_origem_id text, p_grupo uuid, p_obs text)
returns bigint language plpgsql security definer set search_path = public as $$
declare i est_itens; v_saldo numeric; v_id bigint;
begin
  select * into i from est_itens where id = p_item for update;
  if i.id is null then raise exception 'Item não encontrado'; end if;
  if not i.controla_estoque then raise exception 'O item "%" não controla estoque', i.nome; end if;
  if not exists (select 1 from est_locais where id = p_local and cliente_id = i.cliente_id and ativo) then
    raise exception 'Estoque (local) não encontrado ou inativo';
  end if;
  if p_qtd is null or p_qtd = 0 then raise exception 'Informe a quantidade'; end if;
  if p_qtd < 0 and not coalesce((select permite_negativo from est_parametros where cliente_id = i.cliente_id), false) then
    select coalesce(sum(quantidade), 0) into v_saldo from est_movimentos
     where item_id = p_item and local_id = p_local and not estornado;
    if v_saldo + p_qtd < 0 then
      raise exception 'Estoque insuficiente de "%": saldo % %, saída de %', i.nome, trim(to_char(v_saldo, 'FM999999990.####')), i.unidade,
        trim(to_char(-p_qtd, 'FM999999990.####'));
    end if;
  end if;
  insert into est_movimentos (org_id, cliente_id, item_id, local_id, data, tipo, quantidade, custo_unitario, origem, origem_id, grupo, observacao, por)
  values (i.org_id, i.cliente_id, i.id, p_local, coalesce(p_data, app.hoje(i.org_id)), p_tipo, round(p_qtd, 4), p_custo, p_origem, p_origem_id,
          p_grupo, nullif(trim(p_obs), ''), auth.uid())
  returning id into v_id;
  return v_id;
end $$;
revoke all on function app.est_gravar(uuid, uuid, date, text, numeric, numeric, text, text, uuid, text) from public, anon, authenticated;

/** Saída de estoque para os pedidos e notas (próximas fases): só baixa item estocável; serviço e não estocável passam direto. */
create or replace function app.est_saida(p_item uuid, p_local uuid, p_data date, p_qtd numeric, p_origem text, p_origem_id text)
returns bigint language plpgsql security definer set search_path = public as $$
begin
  if not (select controla_estoque from est_itens where id = p_item) then return null; end if;
  return app.est_gravar(p_item, p_local, p_data, 'saida', -abs(p_qtd), null, p_origem, p_origem_id, null, null);
end $$;
revoke all on function app.est_saida(uuid, uuid, date, numeric, text, text) from public, anon, authenticated;

/**
 * Movimento manual. p: item, local, data, tipo (entrada | saida | ajuste | transferencia), quantidade (sempre
 * positiva; no ajuste é o SALDO CONTADO no inventário), custo_unitario (entrada), destino (transferência), observacao.
 */
create or replace function public.est_movimentar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  i est_itens; v_tipo text := p->>'tipo'; v_qtd numeric := round((p->>'quantidade')::numeric, 4);
  v_local uuid := (p->>'local')::uuid; v_destino uuid := nullif(p->>'destino', '')::uuid; v_data date := nullif(p->>'data', '')::date;
  v_saldo numeric; v_dif numeric; v_grupo uuid; v_ids bigint[] := '{}';
begin
  select * into i from est_itens where id = (p->>'item')::uuid;
  if i.id is null then raise exception 'Item não encontrado'; end if;
  if not app.fin_pode(i.cliente_id, 'operar') then raise exception 'Sem permissão para movimentar o estoque desta empresa'; end if;
  if v_qtd is null or v_qtd < 0 or (v_qtd = 0 and v_tipo <> 'ajuste') then raise exception 'Informe uma quantidade maior que zero'; end if;

  if v_tipo = 'entrada' then
    v_ids := v_ids || app.est_gravar(i.id, v_local, v_data, 'entrada', v_qtd, nullif(p->>'custo_unitario', '')::numeric, 'manual', null, null, p->>'observacao');
  elsif v_tipo = 'saida' then
    v_ids := v_ids || app.est_gravar(i.id, v_local, v_data, 'saida', -v_qtd, null, 'manual', null, null, p->>'observacao');
  elsif v_tipo = 'ajuste' then
    perform 1 from est_itens where id = i.id for update;
    select coalesce(sum(quantidade), 0) into v_saldo from est_movimentos where item_id = i.id and local_id = v_local and not estornado;
    v_dif := v_qtd - v_saldo;
    if v_dif = 0 then raise exception 'O saldo contado é igual ao saldo do sistema; nada a ajustar'; end if;
    v_ids := v_ids || app.est_gravar(i.id, v_local, v_data, 'ajuste', v_dif, null, 'manual', null, null,
      coalesce(nullif(trim(p->>'observacao'), ''), 'Inventário') || format(' (contado %s, sistema %s)', v_qtd, v_saldo));
  elsif v_tipo = 'transferencia' then
    if v_destino is null or v_destino = v_local then raise exception 'Escolha um estoque de destino diferente do de origem'; end if;
    v_grupo := gen_random_uuid();
    v_ids := v_ids || app.est_gravar(i.id, v_local, v_data, 'transferencia', -v_qtd, null, 'manual', null, v_grupo, p->>'observacao');
    v_ids := v_ids || app.est_gravar(i.id, v_destino, v_data, 'transferencia', v_qtd, null, 'manual', null, v_grupo, p->>'observacao');
  else
    raise exception 'Tipo de movimento inválido';
  end if;

  perform app.registrar(i.org_id, 'financeiro', 'estoque_' || v_tipo, i.id::text, null, p || jsonb_build_object('movimentos', to_jsonb(v_ids)));
  return jsonb_build_object('movimentos', to_jsonb(v_ids));
end $$;
revoke all on function public.est_movimentar(jsonb) from public, anon;
grant execute on function public.est_movimentar(jsonb) to authenticated;
comment on function public.est_movimentar(jsonb) is 'Entrada, saída, ajuste de inventário ou transferência manual de estoque (confere saldo; fica na auditoria).';

/** Estorna um movimento manual (e o par, na transferência). Recusa se o estorno deixar o estoque negativo. */
create or replace function public.est_estornar_movimento(p_mov bigint, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare m est_movimentos; r record; v_saldo numeric; v_neg boolean;
begin
  select * into m from est_movimentos where id = p_mov;
  if m.id is null then raise exception 'Movimento não encontrado'; end if;
  if not app.fin_pode(m.cliente_id, 'operar') then raise exception 'Sem permissão para estornar'; end if;
  if m.estornado then raise exception 'Este movimento já foi estornado'; end if;
  if m.origem <> 'manual' then raise exception 'Movimento gerado por pedido ou nota: estorne pelo documento de origem'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo do estorno'; end if;
  perform 1 from est_itens where id = m.item_id for update;
  v_neg := coalesce((select permite_negativo from est_parametros where cliente_id = m.cliente_id), false);
  for r in select * from est_movimentos where (id = m.id or (m.grupo is not null and grupo = m.grupo)) and not estornado loop
    if r.quantidade > 0 and not v_neg then
      select coalesce(sum(quantidade), 0) into v_saldo from est_movimentos where item_id = r.item_id and local_id = r.local_id and not estornado;
      if v_saldo - r.quantidade < 0 then raise exception 'Estornar esta entrada deixaria o estoque negativo (saldo atual %)', trim(to_char(v_saldo, 'FM999999990.####')); end if;
    end if;
    update est_movimentos set estornado = true, estornado_em = now(), estorno_motivo = trim(p_motivo) where id = r.id;
  end loop;
  perform app.registrar(m.org_id, 'financeiro', 'estoque_estorno', m.item_id::text, to_jsonb(m), jsonb_build_object('motivo', trim(p_motivo)));
end $$;
revoke all on function public.est_estornar_movimento(bigint, text) from public, anon;
grant execute on function public.est_estornar_movimento(bigint, text) to authenticated;
comment on function public.est_estornar_movimento(bigint, text) is 'Estorna um movimento manual de estoque (marca, não apaga).';
