-- =====================================================================================================
--  031 · Licenças e cobrança (Frente 1 do Financeiro v2)
--
--  Pedido do Edvaldo (01/11/2026): a MDC vai vender módulos do HUB (Financeiro, Estoque, Notas fiscais, Portal...)
--  e cobrar licença mensal. Decisões dele:
--    - a cobrança vai JUNTO com o honorário: o HUB controla contratos, valores, vencimentos e atrasos; o boleto/Pix é o
--      que a MDC já usa; a baixa é manual;
--    - inadimplência: o HUB lista e avisa; o BLOQUEIO É MANUAL (a MDC decide);
--    - bloqueado = o cliente não acessa os módulos pagos no Portal; os dados ficam guardados; a equipe MDC continua
--      acessando.
--
--  lic_produtos           módulos vendáveis da organização, com preço de tabela (slug = chave usada nas regras)
--  lic_planos             pacotes de módulos com preço próprio
--  lic_plano_produtos     módulos de cada plano
--  lic_contratos          contrato de cada cliente (plano ou módulos avulsos, valor negociado, dia de vencimento,
--                         início, fim, reajuste anual por índice e mês, situação ativo/encerrado)
--  lic_contrato_produtos  módulos do contrato (cópia dos módulos do plano no dia da contratação)
--  lic_cobrancas          mensalidades (uma por contrato e competência; geradas sozinhas todo dia, sem duplicar)
--  lic_baixas             pagamentos das mensalidades (desfazer marca, não apaga)
--  lic_reajustes          histórico dos reajustes aplicados
--  lic_bloqueios          bloqueios manuais (motivo de bloquear e de desbloquear; a linha aberta é o bloqueio atual)
--  lic_parametros         regra da organização: a partir de quantos dias de atraso o HUB sugere bloquear
--
--  Regra de acesso nova: app.cliente_tem_modulo(cliente, módulo) = contrato ativo e vigente com o módulo E cliente sem
--  bloqueio. app.fin_pode (028) passa a exigir isso no lado do PORTAL; a equipe MDC não é afetada.
--  Ferramenta nova "licencas" (só equipe): ver = consultar; operar = dar baixa, desfazer baixa, cancelar e gerar
--  cobranças; gerir = módulos, planos, contratos, reajuste e bloqueio.
--  Tabelas só para leitura pela API: toda gravação passa pelas funções lic_* (security definer, permissão conferida
--  na primeira linha, auditoria em app.registrar). Nada se apaga: contrato encerra, cobrança cancela, baixa desfaz.
-- =====================================================================================================

-- ------------------------------------------------------------------------------------- ferramenta
insert into public.hub_apps (slug, nome, descricao, icone, rota, status, externo, ordem)
values ('licencas', 'Licenças', 'Módulos do HUB vendidos aos clientes: contratos, mensalidades, inadimplência e bloqueio',
        'documento', '/licencas', 'beta', false, 85)
on conflict (slug) do update set nome = excluded.nome, descricao = excluded.descricao, icone = excluded.icone,
  rota = excluded.rota, status = excluded.status, externo = excluded.externo, ordem = excluded.ordem;

-- ------------------------------------------------------------------------------------- tabelas
create table if not exists public.lic_produtos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9_-]{2,30}$'),
  nome text not null check (length(trim(nome)) > 0),
  descricao text not null default '',
  preco numeric(15, 2) not null default 0 check (preco >= 0),
  ativo boolean not null default true,
  ordem int not null default 100,
  criado_em timestamptz not null default now(),
  unique (org_id, slug)
);
comment on table public.lic_produtos is
  'Módulos do HUB vendidos aos clientes (preço de tabela mensal). slug é a chave usada em app.cliente_tem_modulo e não muda.';

create table if not exists public.lic_planos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  descricao text not null default '',
  preco numeric(15, 2) not null default 0 check (preco >= 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (org_id, nome)
);
comment on table public.lic_planos is 'Planos (pacotes de módulos) com preço mensal próprio.';

create table if not exists public.lic_plano_produtos (
  plano_id uuid not null references public.lic_planos(id) on delete restrict,
  produto_id uuid not null references public.lic_produtos(id) on delete restrict,
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  primary key (plano_id, produto_id)
);
comment on table public.lic_plano_produtos is 'Módulos que fazem parte de cada plano (gravado só por lic_salvar_plano).';

create table if not exists public.lic_contratos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  plano_id uuid references public.lic_planos(id) on delete restrict,
  valor_tabela numeric(15, 2) not null default 0 check (valor_tabela >= 0),
  valor_mensal numeric(15, 2) not null check (valor_mensal >= 0),
  dia_vencimento int not null check (dia_vencimento between 1 and 31),
  inicio date not null,
  fim date,
  proporcional boolean not null default false,
  reajuste_indice text not null default 'IPCA' check (reajuste_indice in ('IPCA', 'IGP-M', 'INPC', 'fixo', 'nenhum')),
  reajuste_mes int check (reajuste_mes between 1 and 12),
  ultimo_reajuste date,
  situacao text not null default 'ativo' check (situacao in ('ativo', 'encerrado')),
  encerrado_em date,
  encerrado_motivo text,
  observacao text,
  por uuid,
  criado_em timestamptz not null default now(),
  check (fim is null or fim >= inicio),
  check (situacao = 'ativo' or (encerrado_em is not null and coalesce(trim(encerrado_motivo), '') <> ''))
);
create index if not exists lic_contratos_cliente on public.lic_contratos (org_id, cliente_id, situacao);
comment on table public.lic_contratos is
  'Contrato de licença de cada cliente: plano ou módulos avulsos, valor negociado, dia de vencimento, vigência, reajuste anual. Encerra com motivo, não apaga.';

create table if not exists public.lic_contrato_produtos (
  contrato_id uuid not null references public.lic_contratos(id) on delete restrict,
  produto_id uuid not null references public.lic_produtos(id) on delete restrict,
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  primary key (contrato_id, produto_id)
);
create index if not exists lic_contrato_produtos_produto on public.lic_contrato_produtos (produto_id);
comment on table public.lic_contrato_produtos is 'Módulos liberados por cada contrato (cópia dos módulos do plano no dia da contratação).';

create table if not exists public.lic_cobrancas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  contrato_id uuid not null references public.lic_contratos(id) on delete restrict,
  competencia date not null check (extract(day from competencia) = 1),
  vencimento date not null,
  descricao text not null,
  valor numeric(15, 2) not null check (valor > 0),
  situacao text not null default 'aberta' check (situacao in ('aberta', 'paga', 'cancelada')),
  pago_em date,
  valor_pago numeric(15, 2),
  cancelada_em timestamptz,
  cancelado_motivo text,
  observacao text,
  por uuid,
  criado_em timestamptz not null default now(),
  unique (contrato_id, competencia),
  check (situacao <> 'paga' or (pago_em is not null and valor_pago is not null)),
  check (situacao <> 'cancelada' or coalesce(trim(cancelado_motivo), '') <> '')
);
create index if not exists lic_cobrancas_org_venc on public.lic_cobrancas (org_id, vencimento);
create index if not exists lic_cobrancas_cliente on public.lic_cobrancas (org_id, cliente_id, competencia);
comment on table public.lic_cobrancas is
  'Mensalidades das licenças (uma por contrato e competência; a unicidade torna a geração idempotente). Situação muda só pelas funções.';

create table if not exists public.lic_baixas (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  cobranca_id uuid not null references public.lic_cobrancas(id) on delete restrict,
  data date not null,
  valor numeric(15, 2) not null check (valor > 0),
  juros numeric(15, 2) not null default 0 check (juros >= 0),
  desconto numeric(15, 2) not null default 0 check (desconto >= 0),
  total numeric(15, 2) generated always as (valor + juros - desconto) stored,
  forma text,
  observacao text,
  estornada boolean not null default false,
  estornada_em timestamptz,
  estorno_motivo text,
  por uuid,
  em timestamptz not null default now(),
  check (valor + juros - desconto >= 0)
);
create unique index if not exists lic_baixas_uma_valida on public.lic_baixas (cobranca_id) where not estornada;
create index if not exists lic_baixas_org_data on public.lic_baixas (org_id, data);
comment on table public.lic_baixas is
  'Pagamentos das mensalidades (valor da mensalidade + juros - desconto = total recebido). Desfazer marca estornada, não apaga.';

create table if not exists public.lic_reajustes (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  contrato_id uuid not null references public.lic_contratos(id) on delete restrict,
  data date not null,
  indice text not null,
  percentual numeric(9, 4) not null,
  valor_antes numeric(15, 2) not null,
  valor_depois numeric(15, 2) not null,
  observacao text,
  por uuid,
  em timestamptz not null default now()
);
create index if not exists lic_reajustes_contrato on public.lic_reajustes (contrato_id, data);
comment on table public.lic_reajustes is 'Histórico de reajustes dos contratos (o valor novo vale para as mensalidades geradas depois).';

create table if not exists public.lic_bloqueios (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  bloqueado_em timestamptz not null default now(),
  bloqueado_por uuid,
  motivo text not null check (length(trim(motivo)) > 0),
  desbloqueado_em timestamptz,
  desbloqueado_por uuid,
  motivo_desbloqueio text,
  check (desbloqueado_em is null or coalesce(trim(motivo_desbloqueio), '') <> '')
);
create unique index if not exists lic_bloqueios_atual on public.lic_bloqueios (cliente_id) where desbloqueado_em is null;
create index if not exists lic_bloqueios_org on public.lic_bloqueios (org_id, bloqueado_em desc);
comment on table public.lic_bloqueios is
  'Bloqueios manuais de clientes (inadimplência ou outro motivo). Linha sem desbloqueado_em = bloqueio atual; o resto é o histórico.';

create table if not exists public.lic_parametros (
  org_id uuid primary key references public.organizacoes(id) on delete cascade,
  dias_sugerir_bloqueio int not null default 30 check (dias_sugerir_bloqueio between 1 and 365),
  ultimo_aviso date,
  atualizado_em timestamptz not null default now()
);
comment on table public.lic_parametros is
  'Regras de licença da organização: dias de atraso a partir dos quais o HUB sugere bloquear; último aviso diário enviado.';

-- mesma organização do cliente
do $$
declare t text;
begin
  foreach t in array array['lic_contratos', 'lic_cobrancas', 'lic_baixas', 'lic_reajustes', 'lic_bloqueios'] loop
    execute format('drop trigger if exists cliente_mesma_org on public.%I', t);
    execute format('create trigger cliente_mesma_org before insert or update of cliente_id, org_id on public.%I
                    for each row execute function app.tg_cliente_mesma_org()', t);
  end loop;
end $$;

-- ------------------------------------------------------------------------------------- acesso (só leitura pela API)
do $$
declare t text;
begin
  foreach t in array array['lic_produtos', 'lic_planos', 'lic_plano_produtos', 'lic_contratos', 'lic_contrato_produtos',
                           'lic_cobrancas', 'lic_baixas', 'lic_reajustes', 'lic_bloqueios', 'lic_parametros'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists lic_ver on public.%I', t);
    execute format('create policy lic_ver on public.%I for select to authenticated using (app.hub_pode(org_id, ''licencas'', ''ver''))', t);
  end loop;
end $$;
-- sem políticas de insert/update/delete: gravação só pelas funções abaixo.

-- ------------------------------------------------------------------------------------- módulos e plano iniciais
/** Módulos iniciais (preço zero: a MDC define na tela Produtos e planos) e o plano "Gestão completa" (todos). Não mexe no que já existe. */
create or replace function app.lic_semear(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_plano uuid;
begin
  insert into lic_produtos (org_id, slug, nome, descricao, ordem)
  values (p_org, 'financeiro', 'Financeiro', 'Contas a pagar e a receber, entradas e saídas de caixa, bancos, transferências, extratos e conciliação', 10),
         (p_org, 'entradas', 'Entradas', 'Notas recebidas, compras e pedidos de compra, manifestação e carga tributária das entradas', 20),
         (p_org, 'saidas', 'Saídas', 'Pedidos de venda, emissão de NF-e/NFS-e e notas emitidas', 30),
         (p_org, 'estoque', 'Estoque', 'Itens, locais, movimentações e inventário', 40),
         (p_org, 'centros_custo', 'Centros de custo', 'Separação de receitas e despesas por centro de custo', 50),
         (p_org, 'plano_contas', 'Plano de contas', 'Plano de contas do Domínio e categorias de despesa e receita', 60),
         (p_org, 'relatorios', 'Relatórios', 'DRE gerencial, fluxo de caixa e relatórios de cada módulo', 70)
  on conflict (org_id, slug) do nothing;
  insert into lic_planos (org_id, nome, descricao)
  values (p_org, 'Gestão completa', 'Todos os módulos de gestão do HUB')
  on conflict (org_id, nome) do nothing
  returning id into v_plano;
  if v_plano is not null then
    insert into lic_plano_produtos (plano_id, produto_id, org_id)
    select v_plano, id, p_org from lic_produtos
     where org_id = p_org and slug in ('financeiro', 'entradas', 'saidas', 'estoque', 'centros_custo', 'plano_contas', 'relatorios');
  end if;
  insert into lic_parametros (org_id) values (p_org) on conflict do nothing;
end $$;
revoke all on function app.lic_semear(uuid) from public, anon, authenticated;

create or replace function app.tg_org_semear_licencas()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform app.lic_semear(new.id);
  return new;
end $$;
revoke all on function app.tg_org_semear_licencas() from public, anon, authenticated;
drop trigger if exists organizacoes_semear_licencas on public.organizacoes;
create trigger organizacoes_semear_licencas after insert on public.organizacoes
  for each row execute function app.tg_org_semear_licencas();

select app.lic_semear(id) from public.organizacoes;

-- ------------------------------------------------------------------------------------- regra de acesso
/** Cliente com bloqueio manual em aberto. */
create or replace function app.cliente_bloqueado(p_cliente uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from lic_bloqueios b where b.cliente_id = p_cliente and b.desbloqueado_em is null)
$$;
comment on function app.cliente_bloqueado(uuid) is 'Verdadeiro se o cliente tem bloqueio manual em aberto (lic_bloqueios).';

/**
 * O cliente pode usar o módulo no Portal: tem contrato ATIVO e VIGENTE hoje (início ≤ hoje ≤ fim) com o módulo e
 * não está bloqueado. Usado no lado do Portal das regras de acesso (ex.: app.fin_pode); a equipe MDC não passa por aqui.
 */
create or replace function app.cliente_tem_modulo(p_cliente uuid, p_modulo text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from lic_contratos k
      join lic_contrato_produtos cp on cp.contrato_id = k.id
      join lic_produtos p on p.id = cp.produto_id
     where k.cliente_id = p_cliente and p.slug = p_modulo and k.situacao = 'ativo'
       and k.inicio <= app.hoje(k.org_id) and (k.fim is null or k.fim >= app.hoje(k.org_id)))
    and not app.cliente_bloqueado(p_cliente)
$$;
comment on function app.cliente_tem_modulo(uuid, text) is
  'Cliente pode usar o módulo pago no Portal: contrato ativo e vigente com o módulo (lic_*) e sem bloqueio manual.';
revoke all on function app.cliente_bloqueado(uuid) from public, anon;
revoke all on function app.cliente_tem_modulo(uuid, text) from public, anon;
grant execute on function app.cliente_bloqueado(uuid), app.cliente_tem_modulo(uuid, text) to authenticated;

-- Financeiro: o lado do Portal agora exige contrato ativo do módulo "financeiro" e cliente sem bloqueio.
create or replace function app.fin_pode(p_cliente uuid, p_min text default 'ver')
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from clientes c where c.id = p_cliente and app.hub_pode(c.org_id, 'financeiro', p_min))
      or (p_min in ('ver', 'operar') and app.portal_pode(p_cliente, 'financeiro')
          and app.cliente_tem_modulo(p_cliente, 'financeiro'))
$$;
comment on function app.fin_pode(uuid, text) is
  'Financeiro do cliente: equipe com a ferramenta financeiro no nível pedido, ou pessoa do cliente no Portal com a permissão financeiro (ver/operar) quando o cliente tem contrato ativo do módulo financeiro e não está bloqueado (031).';

-- contas bancárias e plano de contas vistos pelo Portal seguem a mesma regra (antes olhavam só a permissão)
drop policy if exists fin_contas_ver_portal on public.fin_contas_bancarias;
create policy fin_contas_ver_portal on public.fin_contas_bancarias for select to authenticated
  using (app.portal_pode(cliente_id, 'financeiro') and app.cliente_tem_modulo(cliente_id, 'financeiro'));
drop policy if exists fin_plano_ver_portal on public.fin_plano_contas;
create policy fin_plano_ver_portal on public.fin_plano_contas for select to authenticated
  using (app.portal_pode(cliente_id, 'financeiro') and app.cliente_tem_modulo(cliente_id, 'financeiro'));

-- ------------------------------------------------------------------------------------- cálculo da mensalidade
/**
 * Valor da mensalidade de uma competência. Sem "proporcional", o mês inteiro; com, só os dias cobertos pelo contrato
 * naquele mês (início ou fim no meio do mês). Mesma conta de web/src/dominios/licencas/regras.ts (valorDoMes).
 */
create or replace function app.lic_valor_mes(p_valor numeric, p_inicio date, p_fim date, p_proporcional boolean, p_competencia date)
returns numeric language plpgsql immutable set search_path = '' as $$
declare
  v_ini date := date_trunc('month', p_competencia)::date;
  v_fim date := (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date;
  v_de date; v_ate date; v_dias int;
begin
  v_de := greatest(v_ini, p_inicio);
  v_ate := least(v_fim, coalesce(p_fim, v_fim));
  if v_ate < v_de then return 0; end if;
  if not p_proporcional then return round(p_valor, 2); end if;
  v_dias := v_fim - v_ini + 1;
  return round(p_valor * (v_ate - v_de + 1) / v_dias, 2);
end $$;
revoke all on function app.lic_valor_mes(numeric, date, date, boolean, date) from public, anon, authenticated;

/** Vencimento da mensalidade: o dia do contrato dentro do próprio mês da competência (31 vira o último dia do mês). */
create or replace function app.lic_vencimento(p_competencia date, p_dia int)
returns date language sql immutable set search_path = '' as $$
  select make_date(extract(year from p_competencia)::int, extract(month from p_competencia)::int,
                   least(p_dia, extract(day from (date_trunc('month', p_competencia) + interval '1 month - 1 day'))::int))
$$;
revoke all on function app.lic_vencimento(date, int) from public, anon, authenticated;

/** Texto da mensalidade: "Licença HUB 11/2026 · Plano Gestão" ou "Licença HUB 11/2026 · Financeiro, Estoque". */
create or replace function app.lic_descricao(p_contrato uuid, p_competencia date)
returns text language sql stable security definer set search_path = public as $$
  select 'Licença HUB ' || to_char(p_competencia, 'MM/YYYY') || ' · ' ||
         coalesce((select 'Plano ' || pl.nome from lic_contratos k join lic_planos pl on pl.id = k.plano_id where k.id = p_contrato),
                  (select string_agg(p.nome, ', ' order by p.ordem, p.nome)
                     from lic_contrato_produtos cp join lic_produtos p on p.id = cp.produto_id where cp.contrato_id = p_contrato),
                  'módulos do HUB')
$$;
revoke all on function app.lic_descricao(uuid, date) from public, anon, authenticated;

/**
 * Gera as mensalidades de uma competência (todos os contratos da organização ou só um). Idempotente: a unicidade
 * (contrato, competência) faz a segunda chamada não criar nada. Mensalidade de valor zero não é criada.
 */
create or replace function app.lic_gerar(p_org uuid, p_competencia date, p_contrato uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_comp date := date_trunc('month', p_competencia)::date;
  v_fim date := (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date;
  n int;
begin
  insert into lic_cobrancas (org_id, cliente_id, contrato_id, competencia, vencimento, descricao, valor)
  select k.org_id, k.cliente_id, k.id, v_comp, app.lic_vencimento(v_comp, k.dia_vencimento), app.lic_descricao(k.id, v_comp),
         app.lic_valor_mes(k.valor_mensal, k.inicio, k.fim, k.proporcional, v_comp)
    from lic_contratos k
   where k.org_id = p_org and (p_contrato is null or k.id = p_contrato)
     and k.situacao = 'ativo' and k.inicio <= v_fim and (k.fim is null or k.fim >= v_comp)
     and app.lic_valor_mes(k.valor_mensal, k.inicio, k.fim, k.proporcional, v_comp) > 0
  on conflict (contrato_id, competencia) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function app.lic_gerar(uuid, date, uuid) from public, anon, authenticated;

-- ------------------------------------------------------------------------------------- módulos e planos
/** Cria ou altera um módulo vendável. p: id?, org, slug (só ao criar), nome, descricao, preco, ativo, ordem. */
create or replace function public.lic_salvar_produto(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid := (p->>'org')::uuid; v_id uuid := nullif(p->>'id', '')::uuid; v_antes lic_produtos; v_preco numeric;
begin
  if v_id is not null then
    select * into v_antes from lic_produtos where id = v_id for update;
    if v_antes.id is null then raise exception 'Módulo não encontrado'; end if;
    v_org := v_antes.org_id;
  end if;
  if v_org is null or not app.hub_pode(v_org, 'licencas', 'gerir') then raise exception 'Sem permissão para cadastrar módulos'; end if;
  if coalesce(trim(p->>'nome'), '') = '' then raise exception 'Informe o nome do módulo'; end if;
  v_preco := round(coalesce(nullif(p->>'preco', '')::numeric, 0), 2);
  if v_preco < 0 then raise exception 'O preço não pode ser negativo'; end if;
  if v_id is null then
    if coalesce(p->>'slug', '') !~ '^[a-z0-9_-]{2,30}$' then
      raise exception 'Código do módulo: de 2 a 30 letras minúsculas, números, hífen ou sublinhado (ex.: centros_custo)';
    end if;
    if exists (select 1 from lic_produtos where org_id = v_org and slug = p->>'slug') then raise exception 'Já existe um módulo com este código'; end if;
    insert into lic_produtos (org_id, slug, nome, descricao, preco, ativo, ordem)
    values (v_org, p->>'slug', trim(p->>'nome'), coalesce(trim(p->>'descricao'), ''), v_preco,
            coalesce((p->>'ativo')::boolean, true), coalesce((p->>'ordem')::int, 100))
    returning id into v_id;
  else
    update lic_produtos set nome = trim(p->>'nome'), descricao = coalesce(trim(p->>'descricao'), ''), preco = v_preco,
           ativo = coalesce((p->>'ativo')::boolean, ativo), ordem = coalesce((p->>'ordem')::int, ordem)
     where id = v_id;
  end if;
  perform app.registrar(v_org, 'licencas', case when v_antes.id is null then 'criar_modulo' else 'alterar_modulo' end, v_id::text,
    case when v_antes.id is not null then to_jsonb(v_antes) end, (select to_jsonb(x) from lic_produtos x where x.id = v_id));
  return v_id;
end $$;
comment on function public.lic_salvar_produto(jsonb) is 'Cria ou altera um módulo vendável (gerir). O código (slug) não muda depois de criado.';

/** Cria ou altera um plano. p: id?, org, nome, descricao, preco, ativo, produtos (lista de ids). */
create or replace function public.lic_salvar_plano(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := (p->>'org')::uuid; v_id uuid := nullif(p->>'id', '')::uuid; v_antes jsonb; v_preco numeric;
  v_prods uuid[] := coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(p->'produtos', '[]'::jsonb)) x), '{}');
begin
  if v_id is not null then
    select org_id into v_org from lic_planos where id = v_id for update;
    if v_org is null then raise exception 'Plano não encontrado'; end if;
    select to_jsonb(x) || jsonb_build_object('produtos', (select jsonb_agg(produto_id) from lic_plano_produtos where plano_id = v_id))
      into v_antes from lic_planos x where x.id = v_id;
  end if;
  if v_org is null or not app.hub_pode(v_org, 'licencas', 'gerir') then raise exception 'Sem permissão para cadastrar planos'; end if;
  if coalesce(trim(p->>'nome'), '') = '' then raise exception 'Informe o nome do plano'; end if;
  if cardinality(v_prods) = 0 then raise exception 'Marque ao menos um módulo no plano'; end if;
  if exists (select 1 from unnest(v_prods) u where not exists (select 1 from lic_produtos where id = u and org_id = v_org)) then
    raise exception 'Módulo não encontrado nesta organização';
  end if;
  v_preco := round(coalesce(nullif(p->>'preco', '')::numeric, 0), 2);
  if v_preco < 0 then raise exception 'O preço não pode ser negativo'; end if;
  if exists (select 1 from lic_planos where org_id = v_org and lower(nome) = lower(trim(p->>'nome')) and id is distinct from v_id) then
    raise exception 'Já existe um plano com este nome';
  end if;
  if v_id is null then
    insert into lic_planos (org_id, nome, descricao, preco, ativo)
    values (v_org, trim(p->>'nome'), coalesce(trim(p->>'descricao'), ''), v_preco, coalesce((p->>'ativo')::boolean, true))
    returning id into v_id;
  else
    update lic_planos set nome = trim(p->>'nome'), descricao = coalesce(trim(p->>'descricao'), ''), preco = v_preco,
           ativo = coalesce((p->>'ativo')::boolean, ativo)
     where id = v_id;
  end if;
  -- composição do plano: os contratos já fechados guardam a própria cópia dos módulos, então mudar aqui não os afeta
  delete from lic_plano_produtos where plano_id = v_id and produto_id <> all (v_prods);
  insert into lic_plano_produtos (plano_id, produto_id, org_id) select v_id, u, v_org from unnest(v_prods) u on conflict do nothing;
  perform app.registrar(v_org, 'licencas', case when v_antes is null then 'criar_plano' else 'alterar_plano' end, v_id::text, v_antes,
    (select to_jsonb(x) from lic_planos x where x.id = v_id) || jsonb_build_object('produtos', to_jsonb(v_prods)));
  return v_id;
end $$;
comment on function public.lic_salvar_plano(jsonb) is
  'Cria ou altera um plano e os módulos dele (gerir). Contratos já fechados guardam a própria cópia dos módulos.';

-- ------------------------------------------------------------------------------------- contratos
/**
 * Cria ou altera um contrato. p: id?, cliente, plano (opcional), produtos (lista; com plano e sem lista, usa os do
 * plano), valor_mensal, dia_vencimento, inicio, fim, proporcional, reajuste_indice, reajuste_mes, observacao.
 * Um módulo não pode estar em dois contratos ativos do mesmo cliente. Ao salvar, gera a mensalidade do mês atual
 * se o contrato já valer (idempotente).
 */
create or replace function public.lic_salvar_contrato(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid; v_antes lic_contratos; v_cli clientes; v_org uuid;
  v_plano uuid := nullif(p->>'plano', '')::uuid; v_prods uuid[]; v_tabela numeric; v_valor numeric := round((p->>'valor_mensal')::numeric, 2);
  v_inicio date := (p->>'inicio')::date; v_fim date := nullif(p->>'fim', '')::date; v_dia int := (p->>'dia_vencimento')::int;
  v_indice text := coalesce(nullif(p->>'reajuste_indice', ''), 'IPCA'); v_mes int := nullif(p->>'reajuste_mes', '')::int;
  v_conflito text; v_antes_prods jsonb;
begin
  if v_id is not null then
    select * into v_antes from lic_contratos where id = v_id for update;
    if v_antes.id is null then raise exception 'Contrato não encontrado'; end if;
    if v_antes.situacao <> 'ativo' then raise exception 'Contrato encerrado não pode ser alterado'; end if;
    if (p->>'cliente') is not null and (p->>'cliente')::uuid <> v_antes.cliente_id then raise exception 'O contrato não muda de cliente'; end if;
    select * into v_cli from clientes where id = v_antes.cliente_id;
    select jsonb_agg(produto_id) into v_antes_prods from lic_contrato_produtos where contrato_id = v_id;
  else
    select * into v_cli from clientes where id = (p->>'cliente')::uuid;
    if v_cli.id is null then raise exception 'Cliente não encontrado'; end if;
  end if;
  v_org := v_cli.org_id;
  if not app.hub_pode(v_org, 'licencas', 'gerir') then raise exception 'Sem permissão para cadastrar contratos de licença'; end if;
  if v_id is null and not v_cli.ativo then raise exception 'Cliente inativo não recebe contrato novo'; end if;

  if v_plano is not null and not exists (select 1 from lic_planos where id = v_plano and org_id = v_org) then
    raise exception 'Plano não encontrado';
  end if;
  if v_plano is not null and v_id is null and not exists (select 1 from lic_planos where id = v_plano and ativo) then
    raise exception 'Este plano está inativo';
  end if;
  if jsonb_typeof(p->'produtos') = 'array' and jsonb_array_length(p->'produtos') > 0 then
    select array_agg(distinct x::uuid) into v_prods from jsonb_array_elements_text(p->'produtos') x;
  elsif v_plano is not null then
    select array_agg(produto_id) into v_prods from lic_plano_produtos where plano_id = v_plano;
  end if;
  if coalesce(cardinality(v_prods), 0) = 0 then raise exception 'Escolha um plano ou ao menos um módulo'; end if;
  if exists (select 1 from unnest(v_prods) u where not exists (select 1 from lic_produtos where id = u and org_id = v_org)) then
    raise exception 'Módulo não encontrado nesta organização';
  end if;
  if exists (select 1 from unnest(v_prods) u join lic_produtos pr on pr.id = u
              where not pr.ativo and (v_antes_prods is null or not v_antes_prods @> to_jsonb(u::text))) then
    raise exception 'Há módulo inativo na escolha; reative o módulo em Produtos e planos';
  end if;
  select string_agg(pr.nome, ', ') into v_conflito
    from unnest(v_prods) u join lic_produtos pr on pr.id = u
   where exists (select 1 from lic_contratos k join lic_contrato_produtos cp on cp.contrato_id = k.id
                  where k.cliente_id = v_cli.id and k.situacao = 'ativo' and k.id is distinct from v_id and cp.produto_id = u);
  if v_conflito is not null then raise exception 'O cliente já tem contrato ativo com: %. Edite aquele contrato ou encerre antes', v_conflito; end if;

  if v_valor is null or v_valor < 0 then raise exception 'Informe o valor mensal (zero para cortesia)'; end if;
  if v_dia is null or v_dia < 1 or v_dia > 31 then raise exception 'Dia de vencimento: de 1 a 31'; end if;
  if v_inicio is null then raise exception 'Informe a data de início'; end if;
  if v_fim is not null and v_fim < v_inicio then raise exception 'O fim não pode ser antes do início'; end if;
  if v_indice not in ('IPCA', 'IGP-M', 'INPC', 'fixo', 'nenhum') then raise exception 'Índice de reajuste inválido'; end if;
  if v_indice <> 'nenhum' and (v_mes is null or v_mes not between 1 and 12) then raise exception 'Escolha o mês do reajuste'; end if;
  if v_id is not null and v_inicio <> v_antes.inicio and exists (select 1 from lic_cobrancas where contrato_id = v_id) then
    raise exception 'O início não muda depois que há mensalidade gerada';
  end if;

  v_tabela := coalesce((select preco from lic_planos where id = v_plano),
                       (select sum(preco) from lic_produtos where id = any (v_prods)), 0);
  if v_id is null then
    insert into lic_contratos (org_id, cliente_id, plano_id, valor_tabela, valor_mensal, dia_vencimento, inicio, fim, proporcional,
                               reajuste_indice, reajuste_mes, observacao, por)
    values (v_org, v_cli.id, v_plano, v_tabela, v_valor, v_dia, v_inicio, v_fim, coalesce((p->>'proporcional')::boolean, false),
            v_indice, case when v_indice = 'nenhum' then null else v_mes end, nullif(trim(p->>'observacao'), ''), auth.uid())
    returning id into v_id;
  else
    update lic_contratos set plano_id = v_plano, valor_tabela = v_tabela, valor_mensal = v_valor, dia_vencimento = v_dia,
           inicio = v_inicio, fim = v_fim, proporcional = coalesce((p->>'proporcional')::boolean, proporcional),
           reajuste_indice = v_indice, reajuste_mes = case when v_indice = 'nenhum' then null else v_mes end,
           observacao = nullif(trim(p->>'observacao'), '')
     where id = v_id;
    delete from lic_contrato_produtos where contrato_id = v_id and produto_id <> all (v_prods);
  end if;
  insert into lic_contrato_produtos (contrato_id, produto_id, org_id) select v_id, u, v_org from unnest(v_prods) u on conflict do nothing;

  perform app.registrar(v_org, 'licencas', case when v_antes.id is null then 'criar_contrato' else 'alterar_contrato' end, v_id::text,
    case when v_antes.id is not null then to_jsonb(v_antes) || jsonb_build_object('produtos', v_antes_prods) end,
    (select to_jsonb(x) from lic_contratos x where x.id = v_id) || jsonb_build_object('produtos', to_jsonb(v_prods)));
  perform app.lic_gerar(v_org, app.hoje(v_org), v_id);
  return v_id;
end $$;
comment on function public.lic_salvar_contrato(jsonb) is
  'Cria ou altera contrato de licença (gerir). Módulo não repete em dois contratos ativos do cliente; gera a mensalidade do mês se já valer.';

/** Encerra o contrato numa data, com motivo. Mensalidades em aberto de meses depois do encerramento são canceladas. */
create or replace function public.lic_encerrar_contrato(p_contrato uuid, p_data date, p_motivo text)
returns int language plpgsql security definer set search_path = public as $$
declare k lic_contratos; n int;
begin
  select * into k from lic_contratos where id = p_contrato for update;
  if k.id is null then raise exception 'Contrato não encontrado'; end if;
  if not app.hub_pode(k.org_id, 'licencas', 'gerir') then raise exception 'Sem permissão para encerrar contratos'; end if;
  if k.situacao <> 'ativo' then raise exception 'Este contrato já está encerrado'; end if;
  if p_data is null then raise exception 'Informe a data do encerramento'; end if;
  if p_data < k.inicio then raise exception 'O encerramento não pode ser antes do início (%)', to_char(k.inicio, 'DD/MM/YYYY'); end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo do encerramento'; end if;
  update lic_contratos set situacao = 'encerrado', encerrado_em = p_data, encerrado_motivo = trim(p_motivo),
         fim = least(coalesce(fim, p_data), p_data)
   where id = k.id;
  update lic_cobrancas set situacao = 'cancelada', cancelada_em = now(), cancelado_motivo = 'Contrato encerrado: ' || trim(p_motivo)
   where contrato_id = k.id and situacao = 'aberta' and competencia > date_trunc('month', p_data)::date;
  get diagnostics n = row_count;
  perform app.registrar(k.org_id, 'licencas', 'encerrar_contrato', k.id::text, to_jsonb(k),
    jsonb_build_object('data', p_data, 'motivo', trim(p_motivo), 'cobrancas_canceladas', n));
  return n;
end $$;
comment on function public.lic_encerrar_contrato(uuid, date, text) is
  'Encerra contrato com data e motivo (gerir); cancela as mensalidades em aberto de meses posteriores.';

/** Reajusta o valor mensal do contrato pelo percentual informado (índice do período). Vale para as próximas mensalidades. */
create or replace function public.lic_reajustar_contrato(p_contrato uuid, p_percentual numeric, p_obs text default null)
returns numeric language plpgsql security definer set search_path = public as $$
declare k lic_contratos; v_novo numeric;
begin
  select * into k from lic_contratos where id = p_contrato for update;
  if k.id is null then raise exception 'Contrato não encontrado'; end if;
  if not app.hub_pode(k.org_id, 'licencas', 'gerir') then raise exception 'Sem permissão para reajustar contratos'; end if;
  if k.situacao <> 'ativo' then raise exception 'Contrato encerrado não é reajustado'; end if;
  if p_percentual is null or p_percentual <= -50 or p_percentual > 100 then raise exception 'Percentual de reajuste fora do esperado (de -50%% a 100%%)'; end if;
  v_novo := round(k.valor_mensal * (1 + p_percentual / 100), 2);
  insert into lic_reajustes (org_id, cliente_id, contrato_id, data, indice, percentual, valor_antes, valor_depois, observacao, por)
  values (k.org_id, k.cliente_id, k.id, app.hoje(k.org_id), k.reajuste_indice, p_percentual, k.valor_mensal, v_novo,
          nullif(trim(p_obs), ''), auth.uid());
  update lic_contratos set valor_mensal = v_novo, ultimo_reajuste = app.hoje(k.org_id) where id = k.id;
  perform app.registrar(k.org_id, 'licencas', 'reajustar_contrato', k.id::text, jsonb_build_object('valor', k.valor_mensal),
    jsonb_build_object('valor', v_novo, 'percentual', p_percentual, 'indice', k.reajuste_indice, 'obs', p_obs));
  return v_novo;
end $$;
comment on function public.lic_reajustar_contrato(uuid, numeric, text) is
  'Aplica reajuste percentual ao contrato (gerir) e guarda o histórico em lic_reajustes. Mensalidades já geradas não mudam.';

-- ------------------------------------------------------------------------------------- mensalidades
/** Botão "Gerar mensalidades do mês" (operar). Idempotente; aceita até o mês seguinte ao atual. */
create or replace function public.lic_gerar_cobrancas(p_org uuid, p_competencia date)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not app.hub_pode(p_org, 'licencas', 'operar') then raise exception 'Sem permissão para gerar mensalidades'; end if;
  if p_competencia is null then raise exception 'Informe o mês'; end if;
  if date_trunc('month', p_competencia) > date_trunc('month', app.hoje(p_org)) + interval '1 month' then
    raise exception 'Só dá para gerar até o mês que vem';
  end if;
  n := app.lic_gerar(p_org, p_competencia);
  perform app.registrar(p_org, 'licencas', 'gerar_cobrancas', to_char(p_competencia, 'YYYY-MM'), null, jsonb_build_object('geradas', n));
  return n;
end $$;
comment on function public.lic_gerar_cobrancas(uuid, date) is 'Gera as mensalidades do mês para os contratos ativos (operar). Não duplica.';

/** Dá baixa (recebimento) numa mensalidade em aberto: valor da mensalidade + juros - desconto. */
create or replace function public.lic_baixar_cobranca(p_cobranca uuid, p_data date, p_forma text default null,
  p_juros numeric default 0, p_desconto numeric default 0, p_obs text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c lic_cobrancas; v_baixa bigint; v_total numeric;
begin
  select * into c from lic_cobrancas where id = p_cobranca for update;
  if c.id is null then raise exception 'Mensalidade não encontrada'; end if;
  if not app.hub_pode(c.org_id, 'licencas', 'operar') then raise exception 'Sem permissão para dar baixa'; end if;
  if c.situacao <> 'aberta' then raise exception 'Esta mensalidade não está em aberto'; end if;
  if p_data is null then raise exception 'Informe a data do recebimento'; end if;
  if p_data > app.hoje(c.org_id) then raise exception 'A data do recebimento não pode ser no futuro'; end if;
  if coalesce(p_juros, 0) < 0 or coalesce(p_desconto, 0) < 0 then raise exception 'Juros e desconto não podem ser negativos'; end if;
  if c.valor + coalesce(p_juros, 0) - coalesce(p_desconto, 0) < 0 then raise exception 'O desconto é maior que a mensalidade'; end if;
  insert into lic_baixas (org_id, cliente_id, cobranca_id, data, valor, juros, desconto, forma, observacao, por)
  values (c.org_id, c.cliente_id, c.id, p_data, c.valor, round(coalesce(p_juros, 0), 2), round(coalesce(p_desconto, 0), 2),
          nullif(trim(p_forma), ''), nullif(trim(p_obs), ''), auth.uid())
  returning id, total into v_baixa, v_total;
  update lic_cobrancas set situacao = 'paga', pago_em = p_data, valor_pago = v_total where id = c.id;
  perform app.registrar(c.org_id, 'licencas', 'baixar_cobranca', c.id::text, null,
    jsonb_build_object('baixa', v_baixa, 'data', p_data, 'total', v_total, 'juros', p_juros, 'desconto', p_desconto, 'forma', p_forma));
  return jsonb_build_object('baixa', v_baixa, 'total', v_total);
end $$;
comment on function public.lic_baixar_cobranca(uuid, date, text, numeric, numeric, text) is
  'Registra o recebimento de uma mensalidade (operar). Total = valor + juros - desconto.';

/** Desfaz a baixa (pagamento lançado por engano): marca a baixa como desfeita, com motivo, e reabre a mensalidade. */
create or replace function public.lic_desfazer_baixa(p_cobranca uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare c lic_cobrancas; b lic_baixas;
begin
  select * into c from lic_cobrancas where id = p_cobranca for update;
  if c.id is null then raise exception 'Mensalidade não encontrada'; end if;
  if not app.hub_pode(c.org_id, 'licencas', 'operar') then raise exception 'Sem permissão para desfazer a baixa'; end if;
  if c.situacao <> 'paga' then raise exception 'Esta mensalidade não está paga'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo para desfazer a baixa'; end if;
  select * into b from lic_baixas where cobranca_id = c.id and not estornada for update;
  update lic_baixas set estornada = true, estornada_em = now(), estorno_motivo = trim(p_motivo) where id = b.id;
  update lic_cobrancas set situacao = 'aberta', pago_em = null, valor_pago = null where id = c.id;
  perform app.registrar(c.org_id, 'licencas', 'desfazer_baixa', c.id::text, to_jsonb(b), jsonb_build_object('motivo', trim(p_motivo)));
end $$;
comment on function public.lic_desfazer_baixa(uuid, text) is 'Desfaz o recebimento de uma mensalidade (operar), com motivo. A baixa fica marcada, não é apagada.';

/** Cancela uma mensalidade em aberto, com motivo (ex.: cortesia, lançada por engano). Ela não volta a ser gerada. */
create or replace function public.lic_cancelar_cobranca(p_cobranca uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare c lic_cobrancas;
begin
  select * into c from lic_cobrancas where id = p_cobranca for update;
  if c.id is null then raise exception 'Mensalidade não encontrada'; end if;
  if not app.hub_pode(c.org_id, 'licencas', 'operar') then raise exception 'Sem permissão para cancelar mensalidades'; end if;
  if c.situacao <> 'aberta' then raise exception 'Só mensalidade em aberto pode ser cancelada (desfaça a baixa antes)'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo do cancelamento'; end if;
  update lic_cobrancas set situacao = 'cancelada', cancelada_em = now(), cancelado_motivo = trim(p_motivo) where id = c.id;
  perform app.registrar(c.org_id, 'licencas', 'cancelar_cobranca', c.id::text, to_jsonb(c), jsonb_build_object('motivo', trim(p_motivo)));
end $$;
comment on function public.lic_cancelar_cobranca(uuid, text) is 'Cancela mensalidade em aberto (operar), com motivo. Não é gerada de novo.';

-- ------------------------------------------------------------------------------------- bloqueio manual
create or replace function public.lic_bloquear(p_cliente uuid, p_motivo text)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_id bigint;
begin
  select org_id into v_org from clientes where id = p_cliente;
  if v_org is null then raise exception 'Cliente não encontrado'; end if;
  if not app.hub_pode(v_org, 'licencas', 'gerir') then raise exception 'Sem permissão para bloquear clientes'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo do bloqueio'; end if;
  perform 1 from clientes where id = p_cliente for update;
  if app.cliente_bloqueado(p_cliente) then raise exception 'Este cliente já está bloqueado'; end if;
  insert into lic_bloqueios (org_id, cliente_id, bloqueado_por, motivo) values (v_org, p_cliente, auth.uid(), trim(p_motivo))
  returning id into v_id;
  perform app.registrar(v_org, 'licencas', 'bloquear_cliente', p_cliente::text, null, jsonb_build_object('motivo', trim(p_motivo)));
  return v_id;
end $$;
comment on function public.lic_bloquear(uuid, text) is
  'Bloqueia o cliente (gerir): ele deixa de acessar os módulos pagos no Portal; os dados ficam guardados e a equipe continua acessando.';

create or replace function public.lic_desbloquear(p_cliente uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare b lic_bloqueios;
begin
  select * into b from lic_bloqueios where cliente_id = p_cliente and desbloqueado_em is null for update;
  if b.id is null then raise exception 'Este cliente não está bloqueado'; end if;
  if not app.hub_pode(b.org_id, 'licencas', 'gerir') then raise exception 'Sem permissão para desbloquear clientes'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo do desbloqueio'; end if;
  update lic_bloqueios set desbloqueado_em = now(), desbloqueado_por = auth.uid(), motivo_desbloqueio = trim(p_motivo) where id = b.id;
  perform app.registrar(b.org_id, 'licencas', 'desbloquear_cliente', p_cliente::text, jsonb_build_object('motivo_bloqueio', b.motivo),
    jsonb_build_object('motivo', trim(p_motivo)));
end $$;
comment on function public.lic_desbloquear(uuid, text) is 'Desbloqueia o cliente (gerir), com motivo; o bloqueio fica no histórico.';

create or replace function public.lic_definir_parametros(p_org uuid, p_dias_sugerir_bloqueio int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not app.hub_pode(p_org, 'licencas', 'gerir') then raise exception 'Sem permissão para mudar as regras de licença'; end if;
  if p_dias_sugerir_bloqueio is null or p_dias_sugerir_bloqueio not between 1 and 365 then raise exception 'Dias: de 1 a 365'; end if;
  insert into lic_parametros (org_id, dias_sugerir_bloqueio) values (p_org, p_dias_sugerir_bloqueio)
  on conflict (org_id) do update set dias_sugerir_bloqueio = excluded.dias_sugerir_bloqueio, atualizado_em = now();
  perform app.registrar(p_org, 'licencas', 'parametros', p_org::text, null, jsonb_build_object('dias_sugerir_bloqueio', p_dias_sugerir_bloqueio));
end $$;
comment on function public.lic_definir_parametros(uuid, int) is 'Define a partir de quantos dias de atraso o HUB sugere bloquear (gerir).';

-- ------------------------------------------------------------------------------------- Portal
/**
 * Situação do cliente para o Portal: se está bloqueado e quais módulos pagos tem contratados hoje. Não mostra o
 * motivo do bloqueio (é anotação interna da MDC). Pessoa do cliente (qualquer permissão) ou equipe com Licenças.
 */
create or replace function public.portal_licenca_situacao(p_cliente uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from clientes where id = p_cliente;
  if v_org is null or not (app.portal_pode(p_cliente) or app.hub_pode(v_org, 'licencas', 'ver')) then
    raise exception 'Sem acesso a esta empresa';
  end if;
  return jsonb_build_object(
    'bloqueado', app.cliente_bloqueado(p_cliente),
    'modulos', coalesce((
      select jsonb_agg(distinct jsonb_build_object('slug', p.slug, 'nome', p.nome))
        from lic_contratos k
        join lic_contrato_produtos cp on cp.contrato_id = k.id
        join lic_produtos p on p.id = cp.produto_id
       where k.cliente_id = p_cliente and k.situacao = 'ativo'
         and k.inicio <= app.hoje(v_org) and (k.fim is null or k.fim >= app.hoje(v_org))), '[]'::jsonb));
end $$;
comment on function public.portal_licenca_situacao(uuid) is
  'Portal: cliente bloqueado? e módulos pagos contratados hoje (sem o motivo do bloqueio).';

-- ------------------------------------------------------------------------------------- rotina diária
/**
 * Roda todo dia (pg_cron): encerra contratos cujo prazo acabou, gera as mensalidades do mês (sem duplicar) e, uma vez
 * por dia, avisa no sino quem cuida de Licenças (administradores e quem tem a ferramenta) das mensalidades que venceram
 * ontem e das que chegaram ao atraso em que o HUB sugere bloquear. Bloquear continua manual.
 */
create or replace function app.lic_rotina_diaria()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o record; v_hoje date; v_dias int; v_ultimo date; n_enc int; n_ger int; n_venc int; v_venc numeric; n_sug int; v_texto text; u record;
  v_total_ger int := 0; v_total_enc int := 0; v_avisos int := 0;
begin
  for o in select id from organizacoes loop
    v_hoje := app.hoje(o.id);
    insert into lic_parametros (org_id) values (o.id) on conflict do nothing;
    select dias_sugerir_bloqueio, ultimo_aviso into v_dias, v_ultimo from lic_parametros where org_id = o.id for update;

    update lic_contratos set situacao = 'encerrado', encerrado_em = fim, encerrado_motivo = 'Fim do prazo do contrato'
     where org_id = o.id and situacao = 'ativo' and fim is not null and fim < v_hoje;
    get diagnostics n_enc = row_count;
    n_ger := app.lic_gerar(o.id, v_hoje);
    v_total_ger := v_total_ger + n_ger;
    v_total_enc := v_total_enc + n_enc;

    if v_ultimo is distinct from v_hoje then
      select count(*), coalesce(sum(valor), 0) into n_venc, v_venc
        from lic_cobrancas where org_id = o.id and situacao = 'aberta' and vencimento = v_hoje - 1;
      select count(distinct cliente_id) into n_sug
        from lic_cobrancas c where org_id = o.id and situacao = 'aberta' and vencimento = v_hoje - v_dias
         and not app.cliente_bloqueado(c.cliente_id);
      if n_venc > 0 or n_sug > 0 then
        v_texto := concat_ws(' ',
          case when n_venc > 0 then format('%s mensalidade(s) venceram ontem sem baixa (R$ %s).', n_venc,
                                            translate(to_char(v_venc, 'FM999,999,990.00'), ',.', '.,')) end,
          case when n_sug > 0 then format('%s cliente(s) chegaram a %s dias de atraso: avalie o bloqueio.', n_sug, v_dias) end);
        for u in select m.user_id from membros m
                  where m.org_id = o.id and m.ativo
                    and (m.papel = 'admin' or exists (select 1 from hub_acessos a where a.org_id = o.id and a.user_id = m.user_id and a.app = 'licencas'))
        loop
          perform app.notificar(o.id, u.user_id, 'licencas', 'Licenças: mensalidades em atraso', v_texto, '/licencas/inadimplentes');
          v_avisos := v_avisos + 1;
        end loop;
      end if;
      update lic_parametros set ultimo_aviso = v_hoje where org_id = o.id;
    end if;
  end loop;
  return jsonb_build_object('geradas', v_total_ger, 'encerrados', v_total_enc, 'avisos', v_avisos);
end $$;
revoke all on function app.lic_rotina_diaria() from public, anon, authenticated;
comment on function app.lic_rotina_diaria() is
  'pg_cron licencas-diaria (06h25): encerra contratos vencidos, gera as mensalidades do mês (idempotente) e avisa atrasos no sino uma vez por dia.';

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if exists (select 1 from cron.job where jobname = 'licencas-diaria') then perform cron.unschedule('licencas-diaria'); end if;
    perform cron.schedule('licencas-diaria', '25 9 * * *', 'select app.lic_rotina_diaria()');   -- 09:25 UTC = 06:25 Brasília
  else
    raise notice 'pg_cron indisponível: a rotina licencas-diaria não foi agendada';
  end if;
end $$;

-- ------------------------------------------------------------------------------------- permissões das funções
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and (p.proname ~ '^lic_' or p.proname = 'portal_licenca_situacao') loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
