-- 117 · BI de Gestão: centro de custo (departamento do Omie) e carteira de pedidos de venda (pedido do Edvaldo, 24/11/2026)
--
-- (1) Centro de custo. A Omie chama de "departamento". O título continua uma linha por categoria (nada muda nas
--     funções que já existem); cada linha passa a guardar o rateio por departamento (omie_movimentos.departamentos =
--     [{"codigo","pct"}], vazio = sem centro). omie_departamentos guarda o nome de cada um.
--     public.bi_centro_custo devolve a DRE ou o fluxo linha × mês × centro: parte de app.bi_fatos (a mesma base dos
--     relatórios) e reparte os títulos e as baixas pelo rateio. O que não vem de título (notas fiscais, impostos das
--     notas, extrato, lançamentos complementares) fica em "Sem centro de custo".
-- (2) Carteira de pedidos. omie_pedidos guarda os pedidos de venda (cabeçalho + total; o pedido inteiro no JSON).
--     public.bi_carteira devolve, das empresas escolhidas, os pedidos não cancelados que estão em carteira (sem
--     faturar) ou que entraram ou foram faturados no período, com o cliente pelo cadastro dos títulos/notas.
-- A recarga das empresas (para trazer o rateio dos títulos antigos e os pedidos) fica na 118, aplicada depois de
-- publicada a nova versão da função omie-sincronizar.
-- Tudo só gravado pela função omie-sincronizar (service_role); quem vê o BI da empresa lê.

-- ---------------------------------------------------------------- (1) centro de custo
alter table public.omie_movimentos add column if not exists departamentos jsonb not null default '[]'::jsonb;
comment on column public.omie_movimentos.departamentos is
  'Rateio do título por centro de custo (departamento da Omie), [{"codigo": "...", "pct": 60}], vazio = sem centro (117).';

create table if not exists public.omie_departamentos (
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  org_id uuid not null,
  codigo text not null,
  descricao text,
  estrutura text,
  inativo boolean not null default false,
  dados jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  primary key (cliente_id, codigo)
);
comment on table public.omie_departamentos is 'Centros de custo (departamentos) da Omie de cada empresa (117). Gravado só pela função omie-sincronizar.';
alter table public.omie_departamentos enable row level security;
drop policy if exists omie_departamentos_ver on public.omie_departamentos;
create policy omie_departamentos_ver on public.omie_departamentos for select to authenticated
  using ((select app.bi_pode_ver(cliente_id)));
revoke all on public.omie_departamentos from anon, authenticated;
grant select on public.omie_departamentos to authenticated;

create or replace function public.bi_centro_custo(p_relatorio text, p_clientes uuid[], p_inicio date, p_fim date,
                                                  p_eliminar boolean default true)
returns table (centro text, centro_nome text, linha text, competencia date, valor numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_org uuid;
begin
  if p_relatorio not in ('dre', 'dfc') then raise exception 'Relatório inválido.'; end if;
  if p_inicio is null or p_fim is null or p_fim < p_inicio then raise exception 'Período inválido.'; end if;
  if p_fim - p_inicio > 1100 then raise exception 'Período máximo de 3 anos.'; end if;
  v_org := app.bi_org_dos_clientes(p_clientes);   -- confere o acesso a cada empresa
  perform app.bi_registrar_acesso(v_org, p_clientes, 'centro_custo_' || p_relatorio, p_inicio, p_fim);

  return query
  with
  fatos as (
    select f.cliente_id, f.linha, f.competencia, f.valor, f.origem, f.ref
      from app.bi_fatos(p_relatorio, p_clientes, p_inicio, p_fim, p_eliminar) f
  ),
  -- título (DRE) e baixa (fluxo): ref = chave do movimento; reparte pelo rateio do título
  repartido as (
    select f.linha, f.competencia, coalesce(d->>'codigo', '') as centro,
           case when d is null then f.valor
                else round(f.valor * coalesce(nullif(d->>'pct', '')::numeric, 0) / 100, 2) end as valor
      from fatos f
      left join public.omie_movimentos m
        on f.origem in ('titulo', 'baixa') and m.cliente_id = f.cliente_id and m.chave = f.ref
      left join lateral jsonb_array_elements(case when jsonb_typeof(m.departamentos) = 'array'
                                                   and jsonb_array_length(m.departamentos) > 0
                                                  then m.departamentos end) d on true
  ),
  -- nome do centro: o mesmo código pode existir em mais de uma empresa do grupo; fica o nome mais recente
  nomes as (
    select distinct on (o.codigo) o.codigo, coalesce(nullif(trim(o.descricao), ''), o.codigo) as nome
      from public.omie_departamentos o
     where o.cliente_id = any (p_clientes)
     order by o.codigo, o.atualizado_em desc
  )
  select r.centro, case when r.centro = '' then 'Sem centro de custo' else coalesce(n.nome, 'Centro ' || r.centro) end,
         r.linha, r.competencia, sum(r.valor)::numeric(15,2)
    from repartido r
    left join nomes n on n.codigo = r.centro
   group by r.centro, n.nome, r.linha, r.competencia
  having sum(r.valor) <> 0;
end $$;
comment on function public.bi_centro_custo(text, uuid[], date, date, boolean) is
  'DRE ou fluxo por centro de custo (117): fatos do BI repartidos pelo rateio de departamento dos títulos; o resto em "Sem centro de custo".';

-- ---------------------------------------------------------------- (2) carteira de pedidos
create table if not exists public.omie_pedidos (
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  org_id uuid not null,
  codigo_pedido text not null,
  numero text,
  numero_cliente text,
  codigo_cliente text,
  etapa text,
  etapa_nome text,
  inclusao date,
  previsao date,
  faturado boolean not null default false,
  faturamento date,
  cancelado boolean not null default false,
  valor numeric(15,2) not null default 0,
  quantidade numeric(15,3) not null default 0,
  itens integer not null default 0,
  dados jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  primary key (cliente_id, codigo_pedido)
);
create index if not exists omie_pedidos_aberto on public.omie_pedidos (cliente_id, faturado, previsao);
create index if not exists omie_pedidos_inclusao on public.omie_pedidos (cliente_id, inclusao);
comment on table public.omie_pedidos is
  'Pedidos de venda da Omie (117): cabeçalho, etapa, previsão de entrega, faturamento e total. Gravado só pela função omie-sincronizar.';
alter table public.omie_pedidos enable row level security;
drop policy if exists omie_pedidos_ver on public.omie_pedidos;
create policy omie_pedidos_ver on public.omie_pedidos for select to authenticated using ((select app.bi_pode_ver(cliente_id)));
revoke all on public.omie_pedidos from anon, authenticated;
grant select on public.omie_pedidos to authenticated;

-- o pedido traz só o código do cliente na Omie; o CNPJ sai dos títulos (nCodCliente) e o nome do cadastro de pessoas
create index if not exists omie_mov_cod_cliente on public.omie_movimentos (cliente_id, ((dados->'detalhes'->>'nCodCliente')));

create or replace function public.bi_carteira(p_clientes uuid[], p_inicio date, p_fim date)
returns table (cliente_id uuid, empresa text, codigo_pedido text, numero text, numero_cliente text, cliente_doc text,
               cliente_nome text, etapa text, etapa_nome text, inclusao date, previsao date, faturado boolean,
               faturamento date, valor numeric, quantidade numeric, itens integer)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_org uuid;
begin
  if p_inicio is null or p_fim is null or p_fim < p_inicio then raise exception 'Período inválido.'; end if;
  if p_fim - p_inicio > 1100 then raise exception 'Período máximo de 3 anos.'; end if;
  v_org := app.bi_org_dos_clientes(p_clientes);
  perform app.bi_registrar_acesso(v_org, p_clientes, 'carteira', p_inicio, p_fim);

  return query
  select p.cliente_id, coalesce(nullif(c.nome_fantasia, ''), c.razao_social), p.codigo_pedido, p.numero, p.numero_cliente,
         doc.doc, coalesce(pe.nome, nt.nome, case when p.codigo_cliente is not null then 'Cliente ' || p.codigo_cliente end),
         p.etapa, p.etapa_nome, p.inclusao, p.previsao, p.faturado, p.faturamento, p.valor, p.quantidade, p.itens
    from public.omie_pedidos p
    join public.clientes c on c.id = p.cliente_id
    left join lateral (
      select nullif(app.so_digitos(m.cnpj_cpf), '') as doc from public.omie_movimentos m
       where m.cliente_id = p.cliente_id and m.dados->'detalhes'->>'nCodCliente' = p.codigo_cliente
         and coalesce(m.cnpj_cpf, '') <> ''
       limit 1) doc on true
    left join public.omie_pessoas pe on pe.cliente_id = p.cliente_id and pe.doc = doc.doc
    left join lateral (
      select n.nome_dest as nome from public.omie_notas n
       where n.cliente_id = p.cliente_id and n.cnpj_cpf_dest = doc.doc and coalesce(n.nome_dest, '') <> ''
       limit 1) nt on pe.nome is null
   where p.cliente_id = any (p_clientes)
     and not p.cancelado
     and (not p.faturado
          or p.faturamento between p_inicio and p_fim
          or p.inclusao between p_inicio and p_fim);
end $$;
comment on function public.bi_carteira(uuid[], date, date) is
  'Pedidos de venda para o BI (117): os em carteira (sem faturar) e os que entraram ou foram faturados no período.';

revoke all on function public.bi_centro_custo(text, uuid[], date, date, boolean) from public, anon;
revoke all on function public.bi_carteira(uuid[], date, date) from public, anon;
grant execute on function public.bi_centro_custo(text, uuid[], date, date, boolean) to authenticated;
grant execute on function public.bi_carteira(uuid[], date, date) to authenticated;
