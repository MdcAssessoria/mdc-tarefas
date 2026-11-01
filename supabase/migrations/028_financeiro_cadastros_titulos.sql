-- =====================================================================================================
--  028 · Financeiro: cadastros e contas a pagar e a receber
--
--  Pedido do Edvaldo (01/11/2026): contas a pagar, contas a receber, entradas e saídas, cadastro de despesas
--  ligado ao plano de contas. Usado pela equipe MDC e pelo cliente (Portal, permissão "financeiro").
--
--  fin_pessoas        fornecedores e clientes da empresa (mesmo cadastro servirá a pedidos e notas)
--  fin_centros_custo  centros de custo (opcional em cada lançamento)
--  fin_categorias     despesas e receitas; cada uma aponta para uma conta ANALÍTICA ATIVA do plano do Domínio
--  fin_titulos        contas a pagar e a receber (uma linha por parcela)
--  fin_baixas         pagamentos e recebimentos (baixa total ou parcial, com juros, multa e desconto)
--
--  Acesso: app.fin_pode(cliente, nível) = equipe com a ferramenta "financeiro" OU pessoa do cliente no Portal com a
--  permissão "financeiro" (ver e lançar; "gerir" é só da equipe). Nada se apaga: cadastro inativa, título cancela,
--  baixa estorna; tudo fica na auditoria. Situação e valor pago do título só mudam pelas funções.
-- =====================================================================================================

-- ------------------------------------------------------------------------------------- quem pode
create or replace function app.fin_pode(p_cliente uuid, p_min text default 'ver')
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from clientes c where c.id = p_cliente and app.hub_pode(c.org_id, 'financeiro', p_min))
      or (p_min in ('ver', 'operar') and app.portal_pode(p_cliente, 'financeiro'))
$$;
revoke all on function app.fin_pode(uuid, text) from public, anon;
grant execute on function app.fin_pode(uuid, text) to authenticated;
comment on function app.fin_pode(uuid, text) is
  'Financeiro do cliente: equipe com a ferramenta financeiro no nível pedido, ou pessoa do cliente no Portal com a permissão financeiro (ver/operar).';

-- auditoria das gravações diretas (cadastros e edição de título); as funções registram o próprio evento
create or replace function app.tg_fin_auditar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.fin_interno', true), '') = '1' then return new; end if;
  perform app.registrar(new.org_id, 'financeiro', lower(tg_op) || '_' || tg_table_name, new.id::text,
    case when tg_op = 'UPDATE' then to_jsonb(old) end, to_jsonb(new));
  return new;
end $$;
revoke all on function app.tg_fin_auditar() from public, anon, authenticated;

-- a conta bancária (etapa 1) passa a ficar na auditoria ao ser criada ou editada (pendência da auditoria anterior)
drop trigger if exists fin_auditar on public.fin_contas_bancarias;
create trigger fin_auditar after insert or update on public.fin_contas_bancarias
  for each row execute function app.tg_fin_auditar();

-- ------------------------------------------------------------------------------------- pessoas
create table if not exists public.fin_pessoas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  tipo text not null check (tipo in ('fornecedor', 'cliente', 'ambos')),
  nome text not null check (length(trim(nome)) > 0),
  documento text check (documento is null or documento ~ '^(\d{11}|\d{14})$'),
  email text,
  telefone text,
  cidade text,
  uf text check (uf is null or uf ~ '^[A-Z]{2}$'),
  observacao text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create unique index if not exists fin_pessoas_documento on public.fin_pessoas (cliente_id, documento) where documento is not null;
create index if not exists fin_pessoas_cliente on public.fin_pessoas (cliente_id, nome);
comment on table public.fin_pessoas is 'Fornecedores e clientes de cada empresa (CPF/CNPJ só com números, único por empresa).';

-- ------------------------------------------------------------------------------------- centros de custo
create table if not exists public.fin_centros_custo (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  codigo text,
  nome text not null check (length(trim(nome)) > 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (cliente_id, nome)
);
comment on table public.fin_centros_custo is 'Centros de custo da empresa (ex.: Administrativo, Obra X). Opcional em cada lançamento.';

-- ------------------------------------------------------------------------------------- categorias
create table if not exists public.fin_categorias (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  tipo text not null check (tipo in ('despesa', 'receita')),
  nome text not null check (length(trim(nome)) > 0),
  grupo text,
  conta_contabil_id uuid not null references public.fin_plano_contas(id) on delete restrict,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (cliente_id, tipo, nome)
);
comment on table public.fin_categorias is 'Despesas e receitas da empresa; cada uma ligada a uma conta analítica do plano do Domínio (conciliar = contabilizar).';

/** Categoria: conta contábil do mesmo cliente, analítica e ativa (conferida só quando muda); não muda de cliente. */
create or replace function app.tg_fin_categoria()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (new.cliente_id is distinct from old.cliente_id or new.org_id is distinct from old.org_id) then
    raise exception 'A categoria não muda de empresa';
  end if;
  if (tg_op = 'INSERT' or new.conta_contabil_id is distinct from old.conta_contabil_id) and not exists (
    select 1 from fin_plano_contas p where p.id = new.conta_contabil_id and p.cliente_id = new.cliente_id and p.analitica and p.ativo) then
    raise exception 'A categoria precisa ser ligada a uma conta analítica ativa do plano de contas desta empresa';
  end if;
  return new;
end $$;
revoke all on function app.tg_fin_categoria() from public, anon, authenticated;
drop trigger if exists fin_categoria_valida on public.fin_categorias;
create trigger fin_categoria_valida before insert or update on public.fin_categorias
  for each row execute function app.tg_fin_categoria();

-- ------------------------------------------------------------------------------------- títulos (a pagar / a receber)
create table if not exists public.fin_titulos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  tipo text not null check (tipo in ('pagar', 'receber')),
  pessoa_id uuid references public.fin_pessoas(id) on delete restrict,
  categoria_id uuid not null references public.fin_categorias(id) on delete restrict,
  centro_id uuid references public.fin_centros_custo(id) on delete restrict,
  conta_prevista_id uuid references public.fin_contas_bancarias(id) on delete restrict,
  descricao text not null check (length(trim(descricao)) > 0),
  documento text,
  emissao date,
  vencimento date not null,
  valor numeric(15, 2) not null check (valor > 0),
  valor_pago numeric(15, 2) not null default 0 check (valor_pago >= 0),
  parcela integer not null default 1 check (parcela >= 1),
  parcelas integer not null default 1 check (parcelas >= parcela),
  grupo uuid,
  situacao text not null default 'aberto' check (situacao in ('aberto', 'quitado', 'cancelado')),
  quitado_em date,
  cancelado_motivo text,
  observacao text,
  por uuid,
  criado_em timestamptz not null default now(),
  check (valor_pago <= valor)
);
create index if not exists fin_titulos_cliente_venc on public.fin_titulos (cliente_id, tipo, vencimento);
create index if not exists fin_titulos_grupo on public.fin_titulos (grupo) where grupo is not null;
comment on table public.fin_titulos is 'Contas a pagar e a receber (uma linha por parcela). Situação e valor pago mudam só pelas funções fin_baixar/fin_estornar_baixa/fin_cancelar_titulo.';

create table if not exists public.fin_baixas (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  titulo_id uuid not null references public.fin_titulos(id) on delete restrict,
  conta_id uuid not null references public.fin_contas_bancarias(id) on delete restrict,
  data date not null,
  valor numeric(15, 2) not null check (valor > 0),
  juros numeric(15, 2) not null default 0 check (juros >= 0),
  multa numeric(15, 2) not null default 0 check (multa >= 0),
  desconto numeric(15, 2) not null default 0 check (desconto >= 0),
  total numeric(15, 2) generated always as (valor + juros + multa - desconto) stored,
  forma text,
  observacao text,
  extrato_linha_id bigint references public.fin_extrato_linhas(id) on delete restrict,
  estornada boolean not null default false,
  estornada_em timestamptz,
  estorno_motivo text,
  por uuid,
  em timestamptz not null default now(),
  check (valor + juros + multa - desconto >= 0)
);
create index if not exists fin_baixas_cliente_data on public.fin_baixas (cliente_id, data);
create index if not exists fin_baixas_titulo on public.fin_baixas (titulo_id);
comment on table public.fin_baixas is 'Pagamentos e recebimentos dos títulos. valor = quanto do título foi baixado; total = o que passou no banco (valor + juros + multa - desconto). Estorno marca, não apaga.';

/**
 * Título: pessoa, categoria, centro e conta prevista da mesma empresa; categoria de despesa só em "a pagar" e de
 * receita só em "a receber". Fora das funções, não deixa mudar situação/valor pago, nem editar título cancelado ou
 * quitado, nem baixar o valor abaixo do que já foi pago.
 */
create or replace function app.tg_fin_titulo()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_tipo_cat text; v_interno boolean := coalesce(current_setting('app.fin_interno', true), '') = '1';
begin
  if tg_op = 'UPDATE' then
    if new.cliente_id is distinct from old.cliente_id or new.org_id is distinct from old.org_id or new.tipo is distinct from old.tipo
       or new.grupo is distinct from old.grupo or new.parcela is distinct from old.parcela or new.parcelas is distinct from old.parcelas then
      raise exception 'Empresa, tipo e parcela do título não mudam';
    end if;
    if not v_interno then
      if new.situacao is distinct from old.situacao or new.valor_pago is distinct from old.valor_pago
         or new.quitado_em is distinct from old.quitado_em or new.cancelado_motivo is distinct from old.cancelado_motivo then
        raise exception 'A situação do título muda só ao pagar, receber, estornar ou cancelar';
      end if;
      if old.situacao <> 'aberto' then raise exception 'Título quitado ou cancelado não pode ser editado; estorne a baixa antes'; end if;
      if new.valor < old.valor_pago then raise exception 'O valor não pode ficar menor do que já foi pago'; end if;
    end if;
  elsif not v_interno then
    if new.valor_pago <> 0 or new.situacao <> 'aberto' or new.quitado_em is not null then
      raise exception 'Título novo entra em aberto; use Pagar/Receber para dar baixa';
    end if;
  end if;
  select tipo into v_tipo_cat from fin_categorias where id = new.categoria_id and cliente_id = new.cliente_id;
  if v_tipo_cat is null then raise exception 'Categoria não encontrada nesta empresa'; end if;
  if (new.tipo = 'pagar' and v_tipo_cat <> 'despesa') or (new.tipo = 'receber' and v_tipo_cat <> 'receita') then
    raise exception 'Conta a pagar usa categoria de despesa; conta a receber usa categoria de receita';
  end if;
  if new.pessoa_id is not null and not exists (select 1 from fin_pessoas where id = new.pessoa_id and cliente_id = new.cliente_id) then
    raise exception 'Fornecedor/cliente não encontrado nesta empresa';
  end if;
  if new.centro_id is not null and not exists (select 1 from fin_centros_custo where id = new.centro_id and cliente_id = new.cliente_id) then
    raise exception 'Centro de custo não encontrado nesta empresa';
  end if;
  if new.conta_prevista_id is not null and not exists (select 1 from fin_contas_bancarias where id = new.conta_prevista_id and cliente_id = new.cliente_id) then
    raise exception 'Conta bancária não encontrada nesta empresa';
  end if;
  return new;
end $$;
revoke all on function app.tg_fin_titulo() from public, anon, authenticated;
drop trigger if exists fin_titulo_valida on public.fin_titulos;
create trigger fin_titulo_valida before insert or update on public.fin_titulos
  for each row execute function app.tg_fin_titulo();

-- mesma organização do cliente e auditoria das gravações diretas
do $$
declare t text;
begin
  foreach t in array array['fin_pessoas', 'fin_centros_custo', 'fin_categorias', 'fin_titulos', 'fin_baixas'] loop
    execute format('drop trigger if exists cliente_mesma_org on public.%I', t);
    execute format('create trigger cliente_mesma_org before insert or update of cliente_id, org_id on public.%I
                    for each row execute function app.tg_cliente_mesma_org()', t);
  end loop;
  foreach t in array array['fin_pessoas', 'fin_centros_custo', 'fin_categorias', 'fin_titulos'] loop
    execute format('drop trigger if exists fin_auditar on public.%I', t);
    execute format('create trigger fin_auditar after insert or update on public.%I
                    for each row execute function app.tg_fin_auditar()', t);
  end loop;
end $$;

-- ------------------------------------------------------------------------------------- acesso
alter table public.fin_pessoas enable row level security;
alter table public.fin_centros_custo enable row level security;
alter table public.fin_categorias enable row level security;
alter table public.fin_titulos enable row level security;
alter table public.fin_baixas enable row level security;

do $$
declare t text;
begin
  foreach t in array array['fin_pessoas', 'fin_centros_custo', 'fin_categorias', 'fin_titulos'] loop
    execute format('drop policy if exists fin_ver on public.%I', t);
    execute format('create policy fin_ver on public.%I for select to authenticated using (app.fin_pode(cliente_id, ''ver''))', t);
    execute format('drop policy if exists fin_incluir on public.%I', t);
    execute format('create policy fin_incluir on public.%I for insert to authenticated with check (app.fin_pode(cliente_id, ''operar''))', t);
    execute format('drop policy if exists fin_alterar on public.%I', t);
    execute format('create policy fin_alterar on public.%I for update to authenticated
                    using (app.fin_pode(cliente_id, ''operar'')) with check (app.fin_pode(cliente_id, ''operar''))', t);
  end loop;
end $$;
drop policy if exists fin_ver on public.fin_baixas;
create policy fin_ver on public.fin_baixas for select to authenticated using (app.fin_pode(cliente_id, 'ver'));
-- baixas: sem gravação direta (só pelas funções). Nenhuma tabela tem delete: inativar, cancelar ou estornar.

-- as contas bancárias também ficam visíveis para o cliente no Portal (para escolher onde pagou/recebeu)
drop policy if exists fin_contas_ver_portal on public.fin_contas_bancarias;
create policy fin_contas_ver_portal on public.fin_contas_bancarias for select to authenticated
  using (app.portal_pode(cliente_id, 'financeiro'));
drop policy if exists fin_plano_ver_portal on public.fin_plano_contas;
create policy fin_plano_ver_portal on public.fin_plano_contas for select to authenticated
  using (app.portal_pode(cliente_id, 'financeiro'));

-- ------------------------------------------------------------------------------------- lançar (com parcelas)
/**
 * Lança uma conta a pagar ou a receber, dividida em parcelas mensais (a diferença de centavos vai na última).
 * Com p->'pago' (data e conta), já dá baixa total em todas as parcelas: é o lançamento "à vista" de Entradas e saídas.
 * Campos de p: cliente, tipo, pessoa, categoria, centro, conta_prevista, descricao, documento, emissao, vencimento,
 * valor (total), parcelas, observacao, pago {data, conta, forma}.
 */
create or replace function public.fin_lancar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cliente uuid := (p->>'cliente')::uuid; v_org uuid; v_n int := coalesce((p->>'parcelas')::int, 1);
  v_total numeric := round((p->>'valor')::numeric, 2); v_parcela numeric; v_grupo uuid; v_id uuid; v_ids uuid[] := '{}';
  v_venc date := (p->>'vencimento')::date; v_pago jsonb := p->'pago'; v_conta uuid; k int;
begin
  select org_id into v_org from clientes where id = v_cliente;
  if v_org is null then raise exception 'Empresa não encontrada'; end if;
  if not app.fin_pode(v_cliente, 'operar') then raise exception 'Sem permissão para lançar no Financeiro desta empresa'; end if;
  if v_total is null or v_total <= 0 then raise exception 'Informe um valor maior que zero'; end if;
  if v_venc is null then raise exception 'Informe o vencimento'; end if;
  if v_n < 1 or v_n > 120 then raise exception 'Parcelas: de 1 a 120'; end if;
  if v_total / v_n < 0.01 then raise exception 'Valor pequeno demais para tantas parcelas'; end if;
  if v_pago is not null and jsonb_typeof(v_pago) = 'object' then
    v_conta := (v_pago->>'conta')::uuid;
    if v_conta is null or (v_pago->>'data') is null then raise exception 'Para lançar já pago, informe a data e a conta bancária'; end if;
    if not exists (select 1 from fin_contas_bancarias where id = v_conta and cliente_id = v_cliente and ativo) then
      raise exception 'Conta bancária não encontrada ou inativa';
    end if;
  else
    v_pago := null;
  end if;

  v_grupo := case when v_n > 1 then gen_random_uuid() end;
  v_parcela := trunc(v_total / v_n, 2);
  perform set_config('app.fin_interno', '1', true);
  for k in 1..v_n loop
    insert into fin_titulos (org_id, cliente_id, tipo, pessoa_id, categoria_id, centro_id, conta_prevista_id, descricao, documento,
                             emissao, vencimento, valor, parcela, parcelas, grupo, observacao, por)
    values (v_org, v_cliente, p->>'tipo', nullif(p->>'pessoa', '')::uuid, (p->>'categoria')::uuid, nullif(p->>'centro', '')::uuid,
            coalesce(nullif(p->>'conta_prevista', '')::uuid, v_conta),
            trim(p->>'descricao') || case when v_n > 1 then format(' (%s/%s)', k, v_n) else '' end,
            nullif(trim(p->>'documento'), ''), nullif(p->>'emissao', '')::date, (v_venc + make_interval(months => k - 1))::date,
            case when k = v_n then v_total - v_parcela * (v_n - 1) else v_parcela end, k, v_n, v_grupo,
            nullif(trim(p->>'observacao'), ''), auth.uid())
    returning id into v_id;
    v_ids := v_ids || v_id;
    if v_pago is not null then
      insert into fin_baixas (org_id, cliente_id, titulo_id, conta_id, data, valor, forma, por)
      select org_id, cliente_id, id, v_conta, (v_pago->>'data')::date, valor, nullif(v_pago->>'forma', ''), auth.uid()
        from fin_titulos where id = v_id;
      update fin_titulos set valor_pago = valor, situacao = 'quitado', quitado_em = (v_pago->>'data')::date where id = v_id;
    end if;
  end loop;
  perform set_config('app.fin_interno', '', true);

  perform app.registrar(v_org, 'financeiro', 'lancar_' || (p->>'tipo'), coalesce(v_grupo, v_id)::text, null,
    p || jsonb_build_object('titulos', to_jsonb(v_ids)));
  return jsonb_build_object('titulos', to_jsonb(v_ids), 'grupo', v_grupo);
end $$;
revoke all on function public.fin_lancar(jsonb) from public, anon;
grant execute on function public.fin_lancar(jsonb) to authenticated;
comment on function public.fin_lancar(jsonb) is 'Lança conta a pagar/receber (parcelas mensais; opcionalmente já paga). Tudo ou nada; fica na auditoria.';

-- ------------------------------------------------------------------------------------- pagar / receber
create or replace function public.fin_baixar(
  p_titulo uuid, p_data date, p_valor numeric, p_conta uuid,
  p_juros numeric default 0, p_multa numeric default 0, p_desconto numeric default 0, p_forma text default null, p_obs text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t fin_titulos; v_valor numeric := round(p_valor, 2); v_baixa bigint; v_pago numeric;
begin
  select * into t from fin_titulos where id = p_titulo for update;
  if t.id is null then raise exception 'Título não encontrado'; end if;
  if not app.fin_pode(t.cliente_id, 'operar') then raise exception 'Sem permissão para dar baixa'; end if;
  if t.situacao <> 'aberto' then raise exception 'Este título não está em aberto'; end if;
  if p_data is null then raise exception 'Informe a data do pagamento'; end if;
  if v_valor is null or v_valor <= 0 then raise exception 'Informe o valor baixado'; end if;
  if v_valor > t.valor - t.valor_pago then raise exception 'O valor baixado é maior que o saldo em aberto (%)', t.valor - t.valor_pago; end if;
  if coalesce(p_juros, 0) < 0 or coalesce(p_multa, 0) < 0 or coalesce(p_desconto, 0) < 0 then raise exception 'Juros, multa e desconto não podem ser negativos'; end if;
  if v_valor + coalesce(p_juros, 0) + coalesce(p_multa, 0) - coalesce(p_desconto, 0) < 0 then raise exception 'O desconto é maior que o valor pago'; end if;
  if not exists (select 1 from fin_contas_bancarias where id = p_conta and cliente_id = t.cliente_id and ativo) then
    raise exception 'Conta bancária não encontrada ou inativa';
  end if;

  insert into fin_baixas (org_id, cliente_id, titulo_id, conta_id, data, valor, juros, multa, desconto, forma, observacao, por)
  values (t.org_id, t.cliente_id, t.id, p_conta, p_data, v_valor, round(coalesce(p_juros, 0), 2), round(coalesce(p_multa, 0), 2),
          round(coalesce(p_desconto, 0), 2), nullif(trim(p_forma), ''), nullif(trim(p_obs), ''), auth.uid())
  returning id into v_baixa;
  v_pago := t.valor_pago + v_valor;
  perform set_config('app.fin_interno', '1', true);
  update fin_titulos set valor_pago = v_pago,
         situacao = case when v_pago >= valor then 'quitado' else 'aberto' end,
         quitado_em = case when v_pago >= valor then p_data end
   where id = t.id;
  perform set_config('app.fin_interno', '', true);
  perform app.registrar(t.org_id, 'financeiro', 'baixar_' || t.tipo, t.id::text, null,
    jsonb_build_object('baixa', v_baixa, 'data', p_data, 'valor', v_valor, 'juros', p_juros, 'multa', p_multa, 'desconto', p_desconto, 'conta', p_conta));
  return jsonb_build_object('baixa', v_baixa, 'quitado', v_pago >= t.valor, 'saldo', t.valor - v_pago);
end $$;
revoke all on function public.fin_baixar(uuid, date, numeric, uuid, numeric, numeric, numeric, text, text) from public, anon;
grant execute on function public.fin_baixar(uuid, date, numeric, uuid, numeric, numeric, numeric, text, text) to authenticated;
comment on function public.fin_baixar(uuid, date, numeric, uuid, numeric, numeric, numeric, text, text) is
  'Paga ou recebe um título (total ou parcial). Quita quando o valor baixado chega ao valor do título.';

create or replace function public.fin_estornar_baixa(p_baixa bigint, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b fin_baixas; t fin_titulos;
begin
  select * into b from fin_baixas where id = p_baixa for update;
  if b.id is null then raise exception 'Pagamento não encontrado'; end if;
  if not app.fin_pode(b.cliente_id, 'operar') then raise exception 'Sem permissão para estornar'; end if;
  if b.estornada then raise exception 'Este pagamento já foi estornado'; end if;
  if b.extrato_linha_id is not null then raise exception 'Este pagamento já foi conciliado com o extrato; desfaça a conciliação antes'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo do estorno'; end if;
  select * into t from fin_titulos where id = b.titulo_id for update;
  update fin_baixas set estornada = true, estornada_em = now(), estorno_motivo = trim(p_motivo) where id = b.id;
  perform set_config('app.fin_interno', '1', true);
  update fin_titulos set valor_pago = valor_pago - b.valor, situacao = 'aberto', quitado_em = null where id = t.id;
  perform set_config('app.fin_interno', '', true);
  perform app.registrar(b.org_id, 'financeiro', 'estornar_baixa', t.id::text, to_jsonb(b), jsonb_build_object('motivo', trim(p_motivo)));
  return jsonb_build_object('titulo', t.id);
end $$;
revoke all on function public.fin_estornar_baixa(bigint, text) from public, anon;
grant execute on function public.fin_estornar_baixa(bigint, text) to authenticated;
comment on function public.fin_estornar_baixa(bigint, text) is 'Estorna um pagamento/recebimento (marca, não apaga) e reabre o título.';

create or replace function public.fin_cancelar_titulo(p_titulo uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare t fin_titulos;
begin
  select * into t from fin_titulos where id = p_titulo for update;
  if t.id is null then raise exception 'Título não encontrado'; end if;
  if not app.fin_pode(t.cliente_id, 'operar') then raise exception 'Sem permissão para cancelar'; end if;
  if t.situacao <> 'aberto' then raise exception 'Só título em aberto pode ser cancelado'; end if;
  if t.valor_pago > 0 then raise exception 'Este título tem pagamento; estorne o pagamento antes de cancelar'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo do cancelamento'; end if;
  perform set_config('app.fin_interno', '1', true);
  update fin_titulos set situacao = 'cancelado', cancelado_motivo = trim(p_motivo) where id = t.id;
  perform set_config('app.fin_interno', '', true);
  perform app.registrar(t.org_id, 'financeiro', 'cancelar_' || t.tipo, t.id::text, to_jsonb(t), jsonb_build_object('motivo', trim(p_motivo)));
end $$;
revoke all on function public.fin_cancelar_titulo(uuid, text) from public, anon;
grant execute on function public.fin_cancelar_titulo(uuid, text) to authenticated;
comment on function public.fin_cancelar_titulo(uuid, text) is 'Cancela um título em aberto sem pagamento (fica guardado e na auditoria).';
