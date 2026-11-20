-- 105 · BI de Gestão: tela de classificação das categorias, saldos dos bancos do Omie e ajuste da 9.1.01 no fluxo de caixa
-- (decisões do Edvaldo, 20/11/2026).
--  1) bi_plano.linha_dfc_entrada: linha do fluxo de caixa para o que ENTRA na conta, quando difere da do que sai.
--     9.1.01 (adiantamentos, cartão, duplicidades): entrada = "Outros recebimentos"; saída continua em despesas.
--  2) Classificação feita só pela equipe MDC (gestor do BI: hub_pode 'gerir'), por função, com histórico:
--     bi_classificacao_listar, bi_excecao_salvar, bi_excecao_conferir, bi_excecao_excluir.
--  3) omie_saldos: saldo de cada conta corrente no início e no fim de cada mês, gravado pela função omie-sincronizar
--     (chave de serviço); leitura por bi_saldos, com a mesma permissão dos relatórios.

alter table public.bi_plano add column if not exists linha_dfc_entrada text;
comment on column public.bi_plano.linha_dfc_entrada is
  'Linha do fluxo de caixa para os recebimentos da conta, quando não é a mesma dos pagamentos (105). Nulo = usa linha_dfc.';
update public.bi_plano set linha_dfc_entrada = 'outros_recebimentos' where org_id is null and codigo = '9.1.01';

-- ---------------------------------------------------------------- histórico da classificação
create table if not exists public.bi_plano_excecoes_hist (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete cascade,
  categoria_codigo text not null,
  acao text not null check (acao in ('classificada', 'alterada', 'conferida', 'excluida')),
  plano_antes text,
  plano_depois text,
  motivo text,
  por uuid default auth.uid(),
  em timestamptz not null default now()
);
create index if not exists bi_plano_exc_hist_org on public.bi_plano_excecoes_hist (org_id, em desc);
comment on table public.bi_plano_excecoes_hist is 'Quem classificou, alterou, conferiu ou excluiu cada categoria do Omie no plano do BI (105). Só grava por função.';
alter table public.bi_plano_excecoes_hist enable row level security;
revoke all on public.bi_plano_excecoes_hist from anon, authenticated;
grant select on public.bi_plano_excecoes_hist to authenticated;
drop policy if exists bi_plano_exc_hist_ver on public.bi_plano_excecoes_hist;
create policy bi_plano_exc_hist_ver on public.bi_plano_excecoes_hist for select to authenticated
  using ((select app.hub_pode(org_id, 'bi_gestao', 'ver')));

-- ---------------------------------------------------------------- saldos dos bancos
create table if not exists public.omie_saldos (
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  org_id uuid not null,
  conta_corrente text not null,
  descricao text,
  mes date not null check (mes = date_trunc('month', mes)::date),
  saldo_anterior numeric(15,2) not null,
  saldo_final numeric(15,2) not null,
  dados jsonb,
  atualizado_em timestamptz not null default now(),
  primary key (cliente_id, conta_corrente, mes)
);
comment on table public.omie_saldos is 'Saldo de cada conta corrente do Omie no começo (saldo_anterior) e no fim (saldo_final) do mês (105). Gravado só pela função omie-sincronizar.';
alter table public.omie_saldos enable row level security;
revoke all on public.omie_saldos from anon, authenticated;
grant select on public.omie_saldos to authenticated;
drop policy if exists omie_saldos_ver on public.omie_saldos;
create policy omie_saldos_ver on public.omie_saldos for select to authenticated using ((select app.bi_pode_ver(cliente_id)));

-- ---------------------------------------------------------------- fatos: 9.1.01 com linha própria para as entradas
create or replace function app.bi_fatos(p_relatorio text, p_clientes uuid[], p_inicio date, p_fim date, p_eliminar boolean)
returns table (cliente_id uuid, linha text, conta text, competencia date, valor numeric, origem text, ref text,
               data date, documento text, pessoa text, doc text, categoria text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_org uuid; v_cnpjs text[]; v_elim boolean;
begin
  select min(c.org_id::text)::uuid into v_org from clientes c where c.id = any (p_clientes);
  select array_agg(app.so_digitos(c.cnpj)) into v_cnpjs from clientes c where c.id = any (p_clientes);
  v_elim := p_eliminar and cardinality(p_clientes) > 1;

  return query
  with
  linhas as (
    select distinct on (l.codigo) l.codigo, l.natureza, l.soma
      from bi_linhas l where l.relatorio = p_relatorio and l.ativo and (l.org_id is null or l.org_id = v_org)
     order by l.codigo, (l.org_id is null)
  ),
  mov as (
    select m.* from omie_movimentos m
     where m.cliente_id = any (p_clientes)
       and coalesce(m.status, '') not ilike 'cancel%'
       and not (v_elim and app.so_digitos(coalesce(m.cnpj_cpf, '')) = any (v_cnpjs))
  ),
  cats as (
    select k.cliente_id, k.categoria_codigo, oc.descricao,
           app.bi_conta(v_org, k.cliente_id, k.categoria_codigo, oc.descricao) as conta
      from (select distinct m.cliente_id, m.categoria_codigo from mov m) k
      left join omie_categorias oc on oc.cliente_id = k.cliente_id and oc.codigo = k.categoria_codigo
  ),
  classe as (
    select c.cliente_id, c.categoria_codigo, c.descricao, c.conta, p.linha_dre, p.linha_dfc, p.linha_dfc_entrada, p.dre_por_titulo,
           (select mp from bi_mapa_categorias mp
             where mp.org_id = v_org and (mp.cliente_id is null or mp.cliente_id = c.cliente_id)
               and c.categoria_codigo like mp.prefixo || '%'
             order by (mp.cliente_id is null), length(mp.prefixo) desc limit 1) as regra
      from cats c
      left join lateral (select x.* from bi_plano x where x.codigo = c.conta and x.ativo and (x.org_id is null or x.org_id = v_org)
                          order by (x.org_id is null) limit 1) p on true
  ),
  base as (
    -- receita e devoluções pelas notas, por CFOP
    select n.cliente_id, r.linha_dre as linha,
           case when r.linha_dre = 'devolucoes' then '4.1.07'
                when c.cfop = 'SERV' then '3.2.01'
                when c.cfop in ('5124', '5125', '6124', '6125') then '3.2.02'
                else '3.1.01' end as conta,
           date_trunc('month', n.emissao)::date as comp, c.valor as v, null::text as nat_mov,
           'nota'::text as origem, n.modelo || ':' || n.id_omie as ref, n.emissao as data,
           coalesce(n.numero, '') || coalesce('/' || nullif(n.serie, ''), '') as documento,
           n.nome_dest as pessoa, n.cnpj_cpf_dest as doc, 'CFOP ' || c.cfop as categoria
      from omie_notas n
      join omie_nota_cfops c on c.cliente_id = n.cliente_id and c.modelo = n.modelo and c.id_omie = n.id_omie
      join bi_cfop_regras r on r.cfop = c.cfop
     where p_relatorio = 'dre' and n.cliente_id = any (p_clientes) and n.situacao = 'autorizada'
       and n.emissao between p_inicio and p_fim
       and not (v_elim and app.so_digitos(coalesce(n.cnpj_cpf_dest, '')) = any (v_cnpjs))
    union all
    -- impostos destacados nas notas de venda, um fato por imposto
    select n.cliente_id, 'deducoes', i.conta, date_trunc('month', n.emissao)::date, i.v, null,
           'imposto', n.modelo || ':' || n.id_omie, n.emissao,
           coalesce(n.numero, '') || coalesce('/' || nullif(n.serie, ''), ''), n.nome_dest, n.cnpj_cpf_dest, i.nome
      from omie_notas n
      cross join lateral (values ('4.1.02', n.icms, 'ICMS'), ('4.1.03', n.pis, 'PIS'), ('4.1.04', n.cofins, 'COFINS'),
                                 ('4.1.05', n.iss, 'ISS')) i(conta, v, nome)
     where p_relatorio = 'dre' and n.cliente_id = any (p_clientes) and n.situacao = 'autorizada'
       and n.emissao between p_inicio and p_fim and i.v <> 0
       and exists (select 1 from omie_nota_cfops c join bi_cfop_regras r on r.cfop = c.cfop and r.linha_dre = 'receita_bruta'
                    where c.cliente_id = n.cliente_id and c.modelo = n.modelo and c.id_omie = n.id_omie)
       and not (v_elim and app.so_digitos(coalesce(n.cnpj_cpf_dest, '')) = any (v_cnpjs))
    union all
    -- títulos (DRE pela emissão): conta do plano; sem conta, a regra antiga; sem nada, despesa em "Não classificado"
    select m.cliente_id,
           case when k.conta is not null then (case when k.dre_por_titulo then k.linha_dre end)
                when (k.regra).id is null then (case when m.natureza = 'P' then 'nao_classificado' end)
                when (k.regra).entra_dre then coalesce((k.regra).linha_dre, case when m.natureza = 'P' then 'nao_classificado' end)
           end,
           k.conta, date_trunc('month', coalesce(m.emissao, m.registro, m.vencimento))::date, m.valor_documento, m.natureza,
           'titulo', m.chave, coalesce(m.emissao, m.registro, m.vencimento), m.documento, m.nome, m.cnpj_cpf,
           coalesce(k.descricao, m.categoria_codigo)
      from (select distinct on (x.cliente_id, x.codigo_titulo, x.categoria_codigo) x.* from mov x
             order by x.cliente_id, x.codigo_titulo, x.categoria_codigo, x.valor_documento desc) m
      join classe k on k.cliente_id = m.cliente_id and k.categoria_codigo is not distinct from m.categoria_codigo
     where p_relatorio = 'dre' and coalesce(m.emissao, m.registro, m.vencimento) between p_inicio and p_fim
    union all
    -- baixas (fluxo pela data do pagamento)
    select m.cliente_id,
           case when k.conta is not null then (case when m.natureza = 'R' and k.linha_dfc_entrada is not null
                                                      then k.linha_dfc_entrada else k.linha_dfc end)
                when (k.regra).id is null then 'nao_classificado'
                when (k.regra).entra_dfc then coalesce((k.regra).linha_dfc, 'nao_classificado') end,
           k.conta, date_trunc('month', m.pagamento)::date, m.valor_pago, m.natureza,
           'baixa', m.chave, m.pagamento, m.documento, m.nome, m.cnpj_cpf, coalesce(k.descricao, m.categoria_codigo)
      from mov m
      join classe k on k.cliente_id = m.cliente_id and k.categoria_codigo is not distinct from m.categoria_codigo
     where p_relatorio = 'dfc' and m.pagamento between p_inicio and p_fim and m.valor_pago <> 0
    union all
    select b.cliente_id,
           case when p_relatorio = 'dre' then b.linha_dre else b.linha_dfc end, null,
           case when p_relatorio = 'dre' then b.competencia else date_trunc('month', b.data_caixa)::date end,
           b.valor, 'X', 'complementar', b.id::text,
           case when p_relatorio = 'dre' then b.competencia else b.data_caixa end, null, null, null, b.historico
      from bi_complementares b
     where b.cliente_id = any (p_clientes) and b.cancelado_em is null
       and ((p_relatorio = 'dre' and b.linha_dre is not null and b.competencia between date_trunc('month', p_inicio) and p_fim)
         or (p_relatorio = 'dfc' and b.linha_dfc is not null and b.data_caixa between p_inicio and p_fim))
  )
  select b.cliente_id, b.linha, b.conta, b.comp,
         (case
            when l.natureza is null then case when b.nat_mov = 'P' then -b.v else b.v end
            when b.nat_mov is null or b.nat_mov = 'X' then case when l.natureza = 'P' then -b.v else b.v end
            when b.nat_mov = l.natureza then case when l.natureza = 'P' then -b.v else b.v end
            else case when l.natureza = 'P' then b.v else -b.v end
          end)::numeric(15,2),
         b.origem, b.ref, b.data, b.documento, b.pessoa, b.doc, b.categoria
    from base b join linhas l on l.codigo = b.linha
   where b.linha is not null and l.soma is null;
end $$;

-- ---------------------------------------------------------------- classificação (só a equipe MDC)
create or replace function app.bi_exigir_gestor(p_org uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not app.hub_pode(p_org, 'bi_gestao', 'gerir') then
    raise exception 'Só a equipe MDC (gestor do BI de Gestão) classifica as categorias.';
  end if;
end $$;

create or replace function public.bi_classificacao_listar(p_clientes uuid[], p_inicio date, p_fim date)
returns table (cliente_id uuid, empresa text, categoria_codigo text, descricao text, conta text, conta_nome text,
               origem text, excecao_id uuid, a_conferir boolean, observacao text, alterado_em timestamptz,
               valor numeric, lancamentos integer)
language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
declare v_org uuid;
begin
  if p_inicio is null or p_fim is null or p_fim < p_inicio then raise exception 'Período inválido.'; end if;
  if p_fim - p_inicio > 1100 then raise exception 'Período máximo de 3 anos.'; end if;
  v_org := app.bi_org_dos_clientes(p_clientes);
  perform app.bi_exigir_gestor(v_org);
  perform app.bi_registrar_acesso(v_org, p_clientes, 'classificacao', p_inicio, p_fim);
  return query
  with usadas as (
    select m.cliente_id, m.categoria_codigo,
           sum(case when coalesce(m.emissao, m.registro, m.vencimento) between p_inicio and p_fim
                    then case when m.natureza = 'P' then -m.valor_documento else m.valor_documento end else 0 end) as valor,
           count(*) filter (where coalesce(m.emissao, m.registro, m.vencimento) between p_inicio and p_fim) as n
      from (select distinct on (x.cliente_id, x.codigo_titulo, x.categoria_codigo) x.*
              from omie_movimentos x
             where x.cliente_id = any (p_clientes) and coalesce(x.status, '') not ilike 'cancel%'
             order by x.cliente_id, x.codigo_titulo, x.categoria_codigo, x.valor_documento desc) m
     where m.categoria_codigo is not null
     group by m.cliente_id, m.categoria_codigo
  ),
  cats as (
    select oc.cliente_id, oc.codigo, oc.descricao, u.valor, u.n
      from omie_categorias oc
      left join usadas u on u.cliente_id = oc.cliente_id and u.categoria_codigo = oc.codigo
     where oc.cliente_id = any (p_clientes) and not coalesce(oc.totalizadora, false)
       and (u.cliente_id is not null
            or exists (select 1 from bi_plano_excecoes e where e.org_id = v_org and e.categoria_codigo = oc.codigo
                         and (e.cliente_id = oc.cliente_id or e.cliente_id is null)))
  ),
  exc as (
    select c.*, (select e from bi_plano_excecoes e
                  where e.org_id = v_org and e.categoria_codigo = c.codigo and (e.cliente_id = c.cliente_id or e.cliente_id is null)
                  order by (e.cliente_id is null) limit 1) as e,
           substring(coalesce(c.descricao, '') from '^\s*([0-9]\.[0-9]{1,2}\.[0-9]{1,2})\s*-') as cod
      from cats c
  ),
  res as (
    select x.*, app.bi_conta(v_org, x.cliente_id, x.codigo, x.descricao) as conta from exc x
  )
  select r.cliente_id, coalesce(nullif(cl.nome_fantasia, ''), cl.razao_social), r.codigo, r.descricao, r.conta,
         (select p.nome from bi_plano p where p.codigo = r.conta and (p.org_id is null or p.org_id = v_org)
           order by (p.org_id is null) limit 1),
         case when (r.e).id is not null then 'excecao'
              when r.codigo like '0.01.%' then 'transferencia'
              when r.conta is not null then 'codigo'
              else 'sem' end,
         (r.e).id, coalesce((r.e).a_conferir, false), (r.e).observacao, (r.e).alterado_em,
         coalesce(r.valor, 0)::numeric(15,2), coalesce(r.n, 0)::integer
    from res r join clientes cl on cl.id = r.cliente_id
   order by (r.conta is null) desc, coalesce((r.e).a_conferir, false) desc, abs(coalesce(r.valor, 0)) desc, r.codigo;
end $$;
comment on function public.bi_classificacao_listar(uuid[], date, date) is
  'Categorias do Omie usadas pelas empresas, com a conta do plano, de onde ela veio (código, exceção, transferência ou sem) e o valor no período (105). Só o gestor do BI.';

-- grava a conta de uma categoria; p_mesmo_nome = aplica também às outras empresas escolhidas que têm a categoria com o
-- mesmo código e o mesmo nome
create or replace function public.bi_excecao_salvar(p_clientes uuid[], p_cliente uuid, p_categoria text, p_plano text,
                                                    p_mesmo_nome boolean default false, p_observacao text default null)
returns integer language plpgsql volatile security definer set search_path = public as $$
declare v_org uuid; v_desc text; v_alvo uuid; v_antes text; v_n integer := 0;
begin
  v_org := app.bi_org_dos_clientes(p_clientes);
  perform app.bi_exigir_gestor(v_org);
  if p_cliente is null or not (p_cliente = any (p_clientes)) then raise exception 'Escolha a empresa da categoria.'; end if;
  select oc.descricao into v_desc from omie_categorias oc where oc.cliente_id = p_cliente and oc.codigo = p_categoria;
  if not found then raise exception 'Categoria do Omie não encontrada nesta empresa.'; end if;
  if not exists (select 1 from bi_plano p where p.codigo = p_plano and p.ativo and (p.org_id is null or p.org_id = v_org)) then
    raise exception 'Conta do plano inválida ou inativa.';
  end if;
  if length(coalesce(p_observacao, '')) > 500 then raise exception 'Observação com no máximo 500 letras.'; end if;

  for v_alvo in
    select oc.cliente_id from omie_categorias oc
     where oc.codigo = p_categoria and oc.cliente_id = any (p_clientes)
       and (oc.cliente_id = p_cliente
            or (coalesce(p_mesmo_nome, false) and lower(trim(oc.descricao)) = lower(trim(v_desc))))
  loop
    select e.plano_codigo into v_antes from bi_plano_excecoes e
     where e.org_id = v_org and e.cliente_id = v_alvo and e.categoria_codigo = p_categoria;
    insert into bi_plano_excecoes (org_id, cliente_id, categoria_codigo, plano_codigo, a_conferir, origem, observacao, alterado_por, alterado_em)
    values (v_org, v_alvo, p_categoria, p_plano, false, 'tela', nullif(trim(p_observacao), ''), auth.uid(), now())
    on conflict (org_id, coalesce(cliente_id, '00000000-0000-0000-0000-000000000000'::uuid), categoria_codigo)
      do update set plano_codigo = excluded.plano_codigo, a_conferir = false, origem = 'tela',
                    observacao = excluded.observacao, alterado_por = excluded.alterado_por, alterado_em = now();
    insert into bi_plano_excecoes_hist (org_id, cliente_id, categoria_codigo, acao, plano_antes, plano_depois, motivo)
    values (v_org, v_alvo, p_categoria, case when v_antes is null then 'classificada' else 'alterada' end, v_antes, p_plano,
            nullif(trim(p_observacao), ''));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function public.bi_excecao_conferir(p_clientes uuid[], p_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_org uuid; v_e bi_plano_excecoes;
begin
  v_org := app.bi_org_dos_clientes(p_clientes);
  perform app.bi_exigir_gestor(v_org);
  select * into v_e from bi_plano_excecoes e where e.id = p_id and e.org_id = v_org
     and (e.cliente_id is null or e.cliente_id = any (p_clientes));
  if not found then raise exception 'Classificação não encontrada.'; end if;
  update bi_plano_excecoes set a_conferir = false, alterado_por = auth.uid(), alterado_em = now() where id = p_id;
  insert into bi_plano_excecoes_hist (org_id, cliente_id, categoria_codigo, acao, plano_antes, plano_depois)
  values (v_org, v_e.cliente_id, v_e.categoria_codigo, 'conferida', v_e.plano_codigo, v_e.plano_codigo);
end $$;

create or replace function public.bi_excecao_excluir(p_clientes uuid[], p_id uuid, p_motivo text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_org uuid; v_e bi_plano_excecoes;
begin
  v_org := app.bi_org_dos_clientes(p_clientes);
  perform app.bi_exigir_gestor(v_org);
  if length(trim(coalesce(p_motivo, ''))) < 5 then raise exception 'Informe o motivo (pelo menos 5 letras).'; end if;
  select * into v_e from bi_plano_excecoes e where e.id = p_id and e.org_id = v_org
     and (e.cliente_id is null or e.cliente_id = any (p_clientes));
  if not found then raise exception 'Classificação não encontrada.'; end if;
  delete from bi_plano_excecoes where id = p_id;
  insert into bi_plano_excecoes_hist (org_id, cliente_id, categoria_codigo, acao, plano_antes, plano_depois, motivo)
  values (v_org, v_e.cliente_id, v_e.categoria_codigo, 'excluida', v_e.plano_codigo, null, trim(p_motivo));
end $$;

-- ---------------------------------------------------------------- saldos dos bancos por mês
create or replace function public.bi_saldos(p_clientes uuid[], p_inicio date, p_fim date)
returns table (empresa text, conta_corrente text, descricao text, mes date, saldo_anterior numeric, saldo_final numeric,
               atualizado_em timestamptz)
language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
declare v_org uuid;
begin
  if p_inicio is null or p_fim is null or p_fim < p_inicio then raise exception 'Período inválido.'; end if;
  if p_fim - p_inicio > 1100 then raise exception 'Período máximo de 3 anos.'; end if;
  v_org := app.bi_org_dos_clientes(p_clientes);
  perform app.bi_registrar_acesso(v_org, p_clientes, 'saldos', p_inicio, p_fim);
  return query
  select coalesce(nullif(c.nome_fantasia, ''), c.razao_social), s.conta_corrente, s.descricao, s.mes,
         s.saldo_anterior, s.saldo_final, s.atualizado_em
    from omie_saldos s join clientes c on c.id = s.cliente_id
   where s.cliente_id = any (p_clientes)
     and s.mes between date_trunc('month', p_inicio)::date and date_trunc('month', p_fim)::date
   order by 1, s.descricao, s.mes;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.bi_classificacao_listar(uuid[], date, date)',
    'public.bi_excecao_salvar(uuid[], uuid, text, text, boolean, text)',
    'public.bi_excecao_conferir(uuid[], uuid)',
    'public.bi_excecao_excluir(uuid[], uuid, text)',
    'public.bi_saldos(uuid[], date, date)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array['app.bi_exigir_gestor(uuid)', 'app.bi_fatos(text, uuid[], date, date, boolean)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
