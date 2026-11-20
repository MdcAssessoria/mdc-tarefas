-- =====================================================================================================
-- 097 · BI de Gestão v2: acesso por empresa, registro de acesso, indicadores dos títulos, orçamento
-- -----------------------------------------------------------------------------------------------------
-- Pedido do Edvaldo (20/11/2026): com mais clientes conectados, o BI não pode abrir direto nos números de um cliente;
-- a pessoa escolhe a empresa e só vê os números se tiver acesso. Mais comparações (período, empresa, orçado ×
-- realizado), indicadores e lançamentos.
--
-- Acesso (decisão do Edvaldo: aprova o administrador ou o responsável pelo cliente; vale 30 dias):
--   · ver os NÚMEROS de uma empresa (app.bi_pode_ver): administrador da organização, responsável pelo cliente
--     (cliente_responsaveis), ou pedido aprovado e dentro do prazo — sempre com a ferramenta bi_gestao; o Portal do
--     Cliente continua como antes (app.portal_pode(cliente, 'bi_gestao'));
--   · ver o CARTÃO da empresa (nome, CNPJ, última atualização, sem números): quem tem a ferramenta bi_gestao
--     (bi_empresas);
--   · lançar (complementares e orçamento): nível operar + acesso aos números da empresa.
-- Registro: cada relatório, indicador e orçado calculado grava quem, quais empresas e o período em
-- app.bi_acessos_log (só leitura pelo administrador, em bi_registro_acessos).
-- =====================================================================================================

-- ---------------------------------------------------------------- pedidos de acesso
create table if not exists public.bi_acessos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  user_id uuid not null,
  situacao text not null default 'pedido' check (situacao in ('pedido', 'aprovado', 'negado', 'encerrado')),
  motivo text not null check (length(trim(motivo)) between 3 and 500),
  pedido_em timestamptz not null default now(),
  decidido_por uuid,
  decidido_em timestamptz,
  resposta text,
  valido_ate date,
  constraint bi_acessos_aprovado_tem_prazo check (situacao <> 'aprovado' or valido_ate is not null)
);
create unique index if not exists bi_acessos_um_pedido_aberto on public.bi_acessos (cliente_id, user_id) where situacao = 'pedido';
create index if not exists bi_acessos_vigentes on public.bi_acessos (user_id, cliente_id) where situacao = 'aprovado';
alter table public.bi_acessos enable row level security;
revoke all on public.bi_acessos from anon, authenticated;

create table if not exists app.bi_acessos_log (
  id bigserial primary key,
  org_id uuid not null,
  user_id uuid,
  clientes uuid[] not null,
  consulta text not null,
  de date,
  ate date,
  em timestamptz not null default now()
);
create index if not exists bi_acessos_log_org_em on app.bi_acessos_log (org_id, em desc);
alter table app.bi_acessos_log enable row level security;
revoke all on app.bi_acessos_log from public, anon, authenticated;

-- ---------------------------------------------------------------- regras de acesso
create or replace function app.bi_responsavel(p_cliente uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from cliente_responsaveis r where r.cliente_id = p_cliente and r.user_id = auth.uid())
$$;

-- números da empresa liberados para quem está logado (sem olhar a ferramenta; quem chama confere)
create or replace function app.bi_liberado(p_cliente uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from clientes c
     where c.id = p_cliente
       and (app.papel(c.org_id) = 'admin'
            or app.bi_responsavel(c.id)
            or exists (select 1 from bi_acessos a
                        where a.cliente_id = c.id and a.user_id = auth.uid() and a.situacao = 'aprovado'
                          and a.valido_ate >= app.hoje(c.org_id))))
$$;

create or replace function app.bi_pode_aprovar(p_cliente uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from clientes c
                  where c.id = p_cliente and app.hub_pode(c.org_id, 'bi_gestao', 'ver')
                    and (app.papel(c.org_id) = 'admin' or app.bi_responsavel(c.id)))
$$;

create or replace function app.bi_pode_ver(p_cliente uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from clientes c
                  where c.id = p_cliente and app.hub_pode(c.org_id, 'bi_gestao', 'ver') and app.bi_liberado(c.id))
      or app.portal_pode(p_cliente, 'bi_gestao')
$$;

create or replace function app.bi_pode_lancar(p_cliente uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from clientes c
                  where c.id = p_cliente and app.hub_pode(c.org_id, 'bi_gestao', 'operar') and app.bi_liberado(c.id))
      or app.portal_pode(p_cliente, 'bi_gestao_lancar')
$$;

create policy bi_acessos_ver on public.bi_acessos for select to authenticated
  using (user_id = auth.uid() or app.bi_pode_aprovar(cliente_id));
grant select on public.bi_acessos to authenticated;

-- empresas pedidas: todas existem, são da mesma organização e a pessoa vê os números de cada uma. Devolve a org.
create or replace function app.bi_org_dos_clientes(p_clientes uuid[])
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v_org uuid; v_orgs int;
begin
  if p_clientes is null or cardinality(p_clientes) = 0 then raise exception 'Escolha ao menos uma empresa.'; end if;
  if cardinality(p_clientes) > 50 then raise exception 'Escolha no máximo 50 empresas.'; end if;
  if exists (select 1 from unnest(p_clientes) x(id)
              where not exists (select 1 from clientes c where c.id = x.id) or not app.bi_pode_ver(x.id)) then
    raise exception 'Sem acesso às empresas informadas.';
  end if;
  select count(distinct c.org_id), min(c.org_id::text)::uuid into v_orgs, v_org from clientes c where c.id = any (p_clientes);
  if v_orgs <> 1 then raise exception 'Escolha empresas de uma mesma organização.'; end if;
  return v_org;
end $$;

create or replace function app.bi_registrar_acesso(p_org uuid, p_clientes uuid[], p_consulta text, p_de date, p_ate date)
returns void language sql volatile security definer set search_path = public as $$
  insert into app.bi_acessos_log (org_id, user_id, clientes, consulta, de, ate)
  values (p_org, auth.uid(), p_clientes, p_consulta, p_de, p_ate)
$$;

-- ---------------------------------------------------------------- cartões e pedidos
create or replace function public.bi_empresas()
returns table (grupo_id uuid, grupo text, eliminar_intragrupo boolean, cliente_id uuid, nome text, cnpj text,
               codigo_dominio text, ultima_sync timestamptz, liberado boolean, pode_aprovar boolean,
               pedido_situacao text, valido_ate date)
language sql stable security definer set search_path = public as $$
  select g.id, g.nome, g.eliminar_intragrupo, c.id, coalesce(nullif(c.nome_fantasia, ''), c.razao_social),
         app.so_digitos(c.cnpj), c.codigo_dominio, oe.ultimo_ok,
         app.bi_pode_ver(c.id), app.bi_pode_aprovar(c.id),
         (select a.situacao from bi_acessos a where a.cliente_id = c.id and a.user_id = auth.uid()
           order by a.pedido_em desc limit 1),
         (select max(a.valido_ate) from bi_acessos a
           where a.cliente_id = c.id and a.user_id = auth.uid() and a.situacao = 'aprovado')
    from bi_grupos g
    join bi_grupo_empresas e on e.grupo_id = g.id
    join clientes c on c.id = e.cliente_id
    left join omie_empresas oe on oe.cliente_id = c.id
   where g.ativo and c.ativo
     and (app.hub_pode(g.org_id, 'bi_gestao', 'ver') or app.portal_pode(c.id, 'bi_gestao'))
   order by g.nome, 5
$$;

create or replace function public.bi_acesso_pedir(p_cliente uuid, p_motivo text)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_cli clientes; v_id uuid; u record; v_nome text;
begin
  select * into v_cli from clientes where id = p_cliente;
  if v_cli.id is null or not app.hub_pode(v_cli.org_id, 'bi_gestao', 'ver') then raise exception 'Empresa não encontrada.'; end if;
  if app.bi_liberado(p_cliente) then raise exception 'Você já tem acesso a esta empresa.'; end if;
  if length(coalesce(trim(p_motivo), '')) < 3 then raise exception 'Escreva o motivo do pedido.'; end if;
  if exists (select 1 from bi_acessos where cliente_id = p_cliente and user_id = auth.uid() and situacao = 'pedido') then
    raise exception 'Já existe um pedido seu esperando aprovação para esta empresa.';
  end if;
  insert into bi_acessos (org_id, cliente_id, user_id, motivo) values (v_cli.org_id, p_cliente, auth.uid(), left(trim(p_motivo), 500))
  returning id into v_id;
  select coalesce(m.nome, m.email) into v_nome from membros m where m.org_id = v_cli.org_id and m.user_id = auth.uid();
  for u in select distinct m.user_id from membros m
            where m.org_id = v_cli.org_id and m.ativo and m.user_id <> auth.uid()
              and (m.papel::text = 'admin'
                   or exists (select 1 from cliente_responsaveis r where r.cliente_id = p_cliente and r.user_id = m.user_id)) loop
    perform app.notificar(v_cli.org_id, u.user_id, 'bi_gestao', 'Pedido de acesso ao BI',
      format('%s pediu para ver os números de %s no BI de Gestão.', coalesce(v_nome, 'Alguém da equipe'),
             coalesce(nullif(v_cli.nome_fantasia, ''), v_cli.razao_social)), '/bi-gestao?pedidos=1');
  end loop;
  perform app.registrar(v_cli.org_id, 'bi_gestao', 'pedir_acesso', v_id::text, null,
                        jsonb_build_object('cliente', p_cliente, 'motivo', p_motivo));
  return v_id;
end $$;

create or replace function public.bi_acesso_decidir(p_id uuid, p_aprovar boolean, p_resposta text default null, p_dias int default 30)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v bi_acessos; v_nome text;
begin
  select * into v from bi_acessos where id = p_id for update;
  if v.id is null or not app.bi_pode_aprovar(v.cliente_id) then raise exception 'Pedido não encontrado.'; end if;
  if v.situacao <> 'pedido' then raise exception 'Este pedido já foi respondido.'; end if;
  if v.user_id = auth.uid() then raise exception 'Você não pode aprovar o próprio pedido.'; end if;
  if p_aprovar and (p_dias is null or p_dias < 1 or p_dias > 90) then raise exception 'O prazo vai de 1 a 90 dias.'; end if;
  if not p_aprovar and length(coalesce(trim(p_resposta), '')) < 3 then raise exception 'Escreva o motivo da recusa.'; end if;
  update bi_acessos
     set situacao = case when p_aprovar then 'aprovado' else 'negado' end,
         decidido_por = auth.uid(), decidido_em = now(), resposta = nullif(left(trim(coalesce(p_resposta, '')), 500), ''),
         valido_ate = case when p_aprovar then app.hoje(v.org_id) + p_dias end
   where id = p_id;
  select coalesce(nullif(c.nome_fantasia, ''), c.razao_social) into v_nome from clientes c where c.id = v.cliente_id;
  perform app.notificar(v.org_id, v.user_id, 'bi_gestao',
    case when p_aprovar then 'Acesso ao BI aprovado' else 'Acesso ao BI recusado' end,
    case when p_aprovar then format('Você pode ver os números de %s até %s.', v_nome, to_char(app.hoje(v.org_id) + p_dias, 'DD/MM/YYYY'))
         else format('Pedido para %s recusado: %s', v_nome, trim(p_resposta)) end,
    '/bi-gestao');
  perform app.registrar(v.org_id, 'bi_gestao', case when p_aprovar then 'aprovar_acesso' else 'recusar_acesso' end, p_id::text,
                        to_jsonb(v), jsonb_build_object('dias', p_dias, 'resposta', p_resposta));
end $$;

create or replace function public.bi_acesso_encerrar(p_id uuid, p_motivo text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v bi_acessos;
begin
  select * into v from bi_acessos where id = p_id for update;
  if v.id is null or not (v.user_id = auth.uid() or app.bi_pode_aprovar(v.cliente_id)) then raise exception 'Pedido não encontrado.'; end if;
  if v.situacao not in ('pedido', 'aprovado') then raise exception 'Este acesso já está encerrado.'; end if;
  update bi_acessos set situacao = 'encerrado', decidido_por = auth.uid(), decidido_em = now(),
         resposta = coalesce(nullif(left(trim(coalesce(p_motivo, '')), 500), ''), resposta)
   where id = p_id;
  perform app.registrar(v.org_id, 'bi_gestao', 'encerrar_acesso', p_id::text, to_jsonb(v), jsonb_build_object('motivo', p_motivo));
end $$;

-- pedidos e acessos: os meus e, para quem aprova, os das empresas que aprova
create or replace function public.bi_acessos_listar()
returns table (id uuid, cliente_id uuid, empresa text, pessoa text, eu boolean, situacao text, motivo text,
               pedido_em timestamptz, decidido_em timestamptz, resposta text, valido_ate date, posso_decidir boolean)
language sql stable security definer set search_path = public as $$
  select a.id, a.cliente_id, coalesce(nullif(c.nome_fantasia, ''), c.razao_social),
         coalesce(m.nome, m.email, 'Pessoa da equipe'), a.user_id = auth.uid(),
         case when a.situacao = 'aprovado' and a.valido_ate < app.hoje(a.org_id) then 'vencido' else a.situacao end,
         a.motivo, a.pedido_em, a.decidido_em, a.resposta, a.valido_ate,
         a.situacao = 'pedido' and a.user_id <> auth.uid() and app.bi_pode_aprovar(a.cliente_id)
    from bi_acessos a
    join clientes c on c.id = a.cliente_id
    left join membros m on m.org_id = a.org_id and m.user_id = a.user_id
   where a.user_id = auth.uid() or app.bi_pode_aprovar(a.cliente_id)
   order by (a.situacao = 'pedido') desc, a.pedido_em desc
   limit 300
$$;

-- registro de quem abriu os números (administrador)
create or replace function public.bi_registro_acessos(p_dias int default 30)
returns table (em timestamptz, pessoa text, empresas text, consulta text, de date, ate date)
language sql stable security definer set search_path = public as $$
  select l.em, coalesce(m.nome, m.email, 'Pessoa'),
         (select string_agg(coalesce(nullif(c.nome_fantasia, ''), c.razao_social), ', ') from clientes c where c.id = any (l.clientes)),
         l.consulta, l.de, l.ate
    from app.bi_acessos_log l
    left join membros m on m.org_id = l.org_id and m.user_id = l.user_id
   where app.papel(l.org_id) = 'admin' and l.em >= now() - make_interval(days => least(greatest(coalesce(p_dias, 30), 1), 365))
   order by l.em desc
   limit 1000
$$;

-- ---------------------------------------------------------------- regra da categoria (mapa da MDC)
create or replace function app.bi_regra(p_org uuid, p_cliente uuid, p_categoria text)
returns public.bi_mapa_categorias language sql stable security definer set search_path = public as $$
  select mp from bi_mapa_categorias mp
   where mp.org_id = p_org and (mp.cliente_id is null or mp.cliente_id = p_cliente) and p_categoria like mp.prefixo || '%'
   order by (mp.cliente_id is null), length(mp.prefixo) desc limit 1
$$;

-- ---------------------------------------------------------------- indicadores dos títulos do Omie
-- Títulos: linha "título|0|0|categoria" (valor do documento, vencimento, situação); baixas: as demais linhas do
-- mesmo título (valor pago e data). Saldo em aberto numa data = documento − baixas até a data, para títulos
-- emitidos até ela (fora cancelados e previsões). A classe vem do mapa de categorias (linha do DFC).
create or replace function public.bi_indicadores(p_clientes uuid[], p_inicio date, p_fim date, p_eliminar boolean default true)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_org uuid; v_cnpjs text[]; v_elim boolean; v_corte date; v jsonb;
begin
  if p_inicio is null or p_fim is null or p_fim < p_inicio then raise exception 'Período inválido.'; end if;
  if p_fim - p_inicio > 1100 then raise exception 'Período máximo de 3 anos.'; end if;
  v_org := app.bi_org_dos_clientes(p_clientes);
  perform app.bi_registrar_acesso(v_org, p_clientes, 'indicadores', p_inicio, p_fim);
  select array_agg(app.so_digitos(c.cnpj)) into v_cnpjs from clientes c where c.id = any (p_clientes);
  v_elim := p_eliminar and cardinality(p_clientes) > 1;
  v_corte := least(p_fim, app.hoje(v_org));

  with mov as (
    select m.*, (app.bi_regra(v_org, m.cliente_id, m.categoria_codigo)).linha_dfc as classe, m.chave like '%|0|0|%' as titulo
      from omie_movimentos m
     where m.cliente_id = any (p_clientes)
       and not (v_elim and app.so_digitos(coalesce(m.cnpj_cpf, '')) = any (v_cnpjs))
  ),
  tit as (select * from mov where titulo and coalesce(status, '') not in ('CANCELADO', 'PREVISAO')),
  bx as (select * from mov where not titulo and valor_pago <> 0),
  saldo as (
    select t.natureza, t.classe, t.vencimento,
           t.valor_documento - coalesce((select sum(b.valor_pago) from bx b
                                          where b.cliente_id = t.cliente_id and b.codigo_titulo = t.codigo_titulo
                                            and b.categoria_codigo = t.categoria_codigo and b.pagamento <= v_corte), 0) as aberto
      from tit t
     where coalesce(t.emissao, t.registro) <= v_corte
  ),
  abertos as (
    select case when natureza = 'R' and classe = 'rec_clientes' then 'receber'
                when natureza = 'P' and classe in ('pag_fornecedores', 'pag_despesas', 'pag_impostos', 'pag_pessoal') then 'pagar' end as lado,
           aberto, greatest(v_corte - vencimento, 0) as atraso
      from saldo where aberto > 0.01
  ),
  posicao as (
    select lado,
           sum(aberto) as aberto,
           sum(aberto) filter (where atraso > 0) as vencido,
           sum(aberto) filter (where atraso between 1 and 30) as a30,
           sum(aberto) filter (where atraso between 31 and 60) as a60,
           sum(aberto) filter (where atraso between 61 and 90) as a90,
           sum(aberto) filter (where atraso > 90) as mais90
      from abertos where lado is not null group by lado
  ),
  prazos as (
    select sum(valor_pago * greatest(pagamento - emissao, 0)) filter (where natureza = 'R' and classe = 'rec_clientes')
             / nullif(sum(valor_pago) filter (where natureza = 'R' and classe = 'rec_clientes'), 0) as pmr,
           sum(valor_pago * greatest(pagamento - emissao, 0)) filter (where natureza = 'P' and classe in ('pag_fornecedores', 'pag_despesas'))
             / nullif(sum(valor_pago) filter (where natureza = 'P' and classe in ('pag_fornecedores', 'pag_despesas')), 0) as pmp
      from bx where pagamento between p_inicio and p_fim and emissao is not null
  ),
  clientes_top as (
    select app.so_digitos(n.cnpj_cpf_dest) as doc, max(n.nome_dest) as nome, sum(n.valor_total) as valor
      from omie_notas n
     where n.cliente_id = any (p_clientes) and n.situacao = 'autorizada' and n.emissao between p_inicio and p_fim
       and exists (select 1 from omie_nota_cfops c join bi_cfop_regras r on r.cfop = c.cfop and r.linha_dre = 'receita_bruta'
                    where c.cliente_id = n.cliente_id and c.modelo = n.modelo and c.id_omie = n.id_omie)
       and not (v_elim and app.so_digitos(coalesce(n.cnpj_cpf_dest, '')) = any (v_cnpjs))
     group by 1
  ),
  fornecedores_top as (
    select app.so_digitos(t.cnpj_cpf) as doc, max(t.nome) as nome, sum(t.valor_documento) as valor
      from tit t
     where t.natureza = 'P' and t.classe in ('pag_fornecedores', 'pag_despesas')
       and coalesce(t.emissao, t.registro) between p_inicio and p_fim
     group by 1
  ),
  liquidez as (
    select distinct on (b.cliente_id) b.cliente_id, coalesce(nullif(c.nome_fantasia, ''), c.razao_social) as empresa,
           b.competencia, b.indices
      from portal_balancetes b join clientes c on c.id = b.cliente_id
     where b.cliente_id = any (p_clientes) and b.status = 'publicado' and b.competencia <= p_fim
       and b.indices ? 'liquidez_corrente'
     order by b.cliente_id, b.competencia desc
  )
  select jsonb_build_object(
    'corte', v_corte,
    'pmr', (select round(pmr, 1) from prazos),
    'pmp', (select round(pmp, 1) from prazos),
    'receber', coalesce((select to_jsonb(p) - 'lado' from posicao p where lado = 'receber'), '{}'::jsonb),
    'pagar', coalesce((select to_jsonb(p) - 'lado' from posicao p where lado = 'pagar'), '{}'::jsonb),
    'clientes_total', (select coalesce(sum(valor), 0) from clientes_top),
    'clientes', coalesce((select jsonb_agg(jsonb_build_object('doc', doc, 'nome', nome, 'valor', round(valor, 2)) order by valor desc)
                            from (select * from clientes_top order by valor desc limit 10) x), '[]'::jsonb),
    'fornecedores_total', (select coalesce(sum(valor), 0) from fornecedores_top),
    'fornecedores', coalesce((select jsonb_agg(jsonb_build_object('doc', doc, 'nome', nome, 'valor', round(valor, 2)) order by valor desc)
                                from (select * from fornecedores_top order by valor desc limit 10) x), '[]'::jsonb),
    'liquidez', coalesce((select jsonb_agg(jsonb_build_object(
                             'empresa', empresa, 'competencia', competencia,
                             'corrente', indices->'liquidez_corrente', 'seca', indices->'liquidez_seca',
                             'imediata', indices->'liquidez_imediata', 'geral', indices->'liquidez_geral'))
                            from liquidez), '[]'::jsonb)
  ) into v;
  return v;
end $$;

-- ---------------------------------------------------------------- orçamento
create table if not exists public.bi_orcamento (
  id bigserial primary key,
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  relatorio text not null check (relatorio in ('dre', 'dfc')),
  linha text not null,
  competencia date not null check (extract(day from competencia) = 1),
  valor numeric(15, 2) not null,
  atualizado_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now(),
  unique (cliente_id, relatorio, linha, competencia)
);
alter table public.bi_orcamento enable row level security;
revoke all on public.bi_orcamento from anon, authenticated;
create policy bi_orcamento_ver on public.bi_orcamento for select to authenticated using (app.bi_pode_ver(cliente_id));
grant select on public.bi_orcamento to authenticated;

-- grava a meta: [{cnpj, relatorio, linha, competencia, valor}]; valor em branco apaga a célula. Tudo ou nada.
-- Valores positivos; o relatório põe o sinal pela natureza da linha (despesa sai negativa).
create or replace function public.bi_orcamento_gravar(p_linhas jsonb, p_arquivo text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r jsonb; i int := 0; v_cli uuid; v_org uuid; v_rel text; v_linha text; v_comp date; v_valor numeric;
        v_erros text[] := '{}'; v_gravadas int := 0; v_apagadas int := 0; v_orgs uuid[] := '{}';
begin
  if auth.uid() is null then raise exception 'Faça login de novo.'; end if;
  if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) = 0 then raise exception 'Nada para gravar.'; end if;
  if jsonb_array_length(p_linhas) > 10000 then raise exception 'Máximo de 10.000 linhas por vez.'; end if;
  for r in select * from jsonb_array_elements(p_linhas) loop
    i := i + 1;
    begin
      select c.id, c.org_id into v_cli, v_org from clientes c
       where app.so_digitos(c.cnpj) = app.so_digitos(r->>'cnpj') and app.bi_pode_lancar(c.id) limit 1;
      if v_cli is null then raise exception 'empresa % não encontrada ou sem permissão', coalesce(r->>'cnpj', '(vazio)'); end if;
      v_rel := lower(trim(r->>'relatorio'));
      if v_rel not in ('dre', 'dfc') then raise exception 'relatório deve ser DRE ou DFC'; end if;
      v_linha := trim(r->>'linha');
      if not exists (select 1 from bi_linhas l where l.relatorio = v_rel and l.codigo = v_linha and l.soma is null and l.ativo
                        and (l.org_id is null or l.org_id = v_org)) then
        raise exception 'linha "%" não existe na % ou é subtotal', v_linha, upper(v_rel); end if;
      v_comp := date_trunc('month', (r->>'competencia')::date)::date;
      if v_comp is null then raise exception 'mês vazio'; end if;
      v_valor := round(nullif(trim(r->>'valor'), '')::numeric, 2);
      if v_valor is not null and v_valor < 0 and exists (select 1 from bi_linhas l where l.relatorio = v_rel and l.codigo = v_linha and l.natureza is not null) then
        raise exception 'use valor positivo: a linha "%" já põe o sinal', v_linha; end if;
      v_orgs := v_orgs || v_org;
    exception when others then
      v_erros := v_erros || format('Linha %s: %s', i + 1, sqlerrm);
    end;
  end loop;
  if cardinality(v_erros) > 0 then
    return jsonb_build_object('ok', false, 'erros', to_jsonb(v_erros[1:50]), 'total_erros', cardinality(v_erros));
  end if;
  for r in select * from jsonb_array_elements(p_linhas) loop
    select c.id, c.org_id into v_cli, v_org from clientes c
     where app.so_digitos(c.cnpj) = app.so_digitos(r->>'cnpj') and app.bi_pode_lancar(c.id) limit 1;
    v_rel := lower(trim(r->>'relatorio')); v_linha := trim(r->>'linha');
    v_comp := date_trunc('month', (r->>'competencia')::date)::date;
    v_valor := round(nullif(trim(r->>'valor'), '')::numeric, 2);
    if v_valor is null then
      delete from bi_orcamento where cliente_id = v_cli and relatorio = v_rel and linha = v_linha and competencia = v_comp;
      if found then v_apagadas := v_apagadas + 1; end if;
    else
      insert into bi_orcamento (org_id, cliente_id, relatorio, linha, competencia, valor)
      values (v_org, v_cli, v_rel, v_linha, v_comp, v_valor)
      on conflict (cliente_id, relatorio, linha, competencia)
      do update set valor = excluded.valor, atualizado_por = auth.uid(), atualizado_em = now();
      v_gravadas := v_gravadas + 1;
    end if;
  end loop;
  perform app.registrar(v_orgs[1], 'bi_gestao', 'gravar_orcamento', null, null,
                        jsonb_build_object('arquivo', p_arquivo, 'gravadas', v_gravadas, 'apagadas', v_apagadas));
  return jsonb_build_object('ok', true, 'gravadas', v_gravadas, 'apagadas', v_apagadas);
end $$;

-- orçado no mesmo formato do bi_relatorio (conta × mês, com subtotais)
create or replace function public.bi_orcado(p_relatorio text, p_clientes uuid[], p_inicio date, p_fim date)
returns table (codigo text, nome text, ordem integer, subtotal boolean, natureza text, competencia date, valor numeric)
language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
declare v_org uuid;
begin
  if p_relatorio not in ('dre', 'dfc') then raise exception 'Relatório inválido.'; end if;
  if p_inicio is null or p_fim is null or p_fim < p_inicio then raise exception 'Período inválido.'; end if;
  if p_fim - p_inicio > 1100 then raise exception 'Período máximo de 3 anos.'; end if;
  v_org := app.bi_org_dos_clientes(p_clientes);
  perform app.bi_registrar_acesso(v_org, p_clientes, 'orcado_' || p_relatorio, p_inicio, p_fim);
  return query
  with recursive
  linhas as (
    select distinct on (l.codigo) l.codigo, l.nome, l.ordem, l.natureza, l.soma
      from bi_linhas l where l.relatorio = p_relatorio and l.ativo and (l.org_id is null or l.org_id = v_org)
     order by l.codigo, (l.org_id is null)
  ),
  meses as (
    select generate_series(date_trunc('month', p_inicio), date_trunc('month', p_fim), interval '1 month')::date as comp
  ),
  analiticas as (
    select l.codigo, ms.comp,
           coalesce(sum(case when l.natureza = 'P' then -abs(o.valor) when l.natureza = 'R' then abs(o.valor) else o.valor end), 0)::numeric(15,2) as v
      from linhas l cross join meses ms
      left join bi_orcamento o on o.relatorio = p_relatorio and o.linha = l.codigo and o.competencia = ms.comp
                              and o.cliente_id = any (p_clientes)
     where l.soma is null
     group by l.codigo, ms.comp
  ),
  arvore (raiz, folha) as (
    select l.codigo, x from linhas l, unnest(l.soma) x where l.soma is not null
    union
    select a.raiz, x from arvore a join linhas l on l.codigo = a.folha and l.soma is not null, unnest(l.soma) x
  ),
  subtotais as (
    select a.raiz as codigo, an.comp, sum(an.v)::numeric(15,2) as v
      from arvore a join analiticas an on an.codigo = a.folha
     group by a.raiz, an.comp
  ),
  tudo as (select * from analiticas union all select * from subtotais)
  select l.codigo, l.nome, l.ordem, l.soma is not null, l.natureza, t.comp, coalesce(t.v, 0)
    from linhas l join tudo t on t.codigo = l.codigo
   order by l.ordem, t.comp;
end $$;

-- ---------------------------------------------------------------- relatório (094) com a regra nova e o registro
create or replace function public.bi_relatorio(p_relatorio text, p_clientes uuid[], p_inicio date, p_fim date,
                                               p_eliminar boolean default true)
returns table (codigo text, nome text, ordem integer, subtotal boolean, natureza text, competencia date, valor numeric)
language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
declare v_org uuid; v_cnpjs text[]; v_elim boolean;
begin
  if p_relatorio not in ('dre', 'dfc') then raise exception 'Relatório inválido.'; end if;
  if p_inicio is null or p_fim is null or p_fim < p_inicio then raise exception 'Período inválido.'; end if;
  if p_fim - p_inicio > 1100 then raise exception 'Período máximo de 3 anos.'; end if;
  -- acesso conferido em cada empresa pedida (097: números só para quem tem acesso à empresa) e registrado
  v_org := app.bi_org_dos_clientes(p_clientes);
  perform app.bi_registrar_acesso(v_org, p_clientes, p_relatorio, p_inicio, p_fim);
  select array_agg(regexp_replace(c.cnpj, '\D', '', 'g')) into v_cnpjs from clientes c where c.id = any (p_clientes);
  v_elim := p_eliminar and cardinality(p_clientes) > 1;

  return query
  with recursive
  linhas as (
    select distinct on (l.codigo) l.codigo, l.nome, l.ordem, l.natureza, l.soma
      from bi_linhas l where l.relatorio = p_relatorio and l.ativo and (l.org_id is null or l.org_id = v_org)
     order by l.codigo, (l.org_id is null)
  ),
  mov as (
    select m.*, (
      select mp from bi_mapa_categorias mp
       where mp.org_id = v_org and (mp.cliente_id is null or mp.cliente_id = m.cliente_id) and m.categoria_codigo like mp.prefixo || '%'
       order by (mp.cliente_id is null), length(mp.prefixo) desc limit 1) as regra
      from omie_movimentos m
     where m.cliente_id = any (p_clientes)
       and coalesce(m.status, '') not ilike 'cancel%'
       and not (v_elim and regexp_replace(coalesce(m.cnpj_cpf, ''), '\D', '', 'g') = any (v_cnpjs))
  ),
  base as (
    select r.linha_dre as linha, date_trunc('month', n.emissao)::date as comp, c.valor as v, null::text as nat_mov
      from omie_notas n
      join omie_nota_cfops c using (cliente_id, modelo, id_omie)
      join bi_cfop_regras r on r.cfop = c.cfop
     where p_relatorio = 'dre' and n.cliente_id = any (p_clientes) and n.situacao = 'autorizada'
       and n.emissao between p_inicio and p_fim
       and not (v_elim and regexp_replace(coalesce(n.cnpj_cpf_dest, ''), '\D', '', 'g') = any (v_cnpjs))
    union all
    select 'deducoes', date_trunc('month', n.emissao)::date, (n.icms + n.pis + n.cofins + n.iss), null
      from omie_notas n
     where p_relatorio = 'dre' and n.cliente_id = any (p_clientes) and n.situacao = 'autorizada'
       and n.emissao between p_inicio and p_fim
       and exists (select 1 from omie_nota_cfops c join bi_cfop_regras r on r.cfop = c.cfop and r.linha_dre = 'receita_bruta'
                    where c.cliente_id = n.cliente_id and c.modelo = n.modelo and c.id_omie = n.id_omie)
       and not (v_elim and regexp_replace(coalesce(n.cnpj_cpf_dest, ''), '\D', '', 'g') = any (v_cnpjs))
    union all
    select case when (m.regra).id is null then (case when m.natureza = 'P' then 'nao_classificado' end)
                when (m.regra).entra_dre then coalesce((m.regra).linha_dre, case when m.natureza = 'P' then 'nao_classificado' end) end,
           date_trunc('month', coalesce(m.emissao, m.registro, m.vencimento))::date, m.valor_documento, m.natureza
      from (select distinct on (cliente_id, codigo_titulo, categoria_codigo) * from mov
             order by cliente_id, codigo_titulo, categoria_codigo, valor_documento desc) m
     where p_relatorio = 'dre' and coalesce(m.emissao, m.registro, m.vencimento) between p_inicio and p_fim
    union all
    select case when (m.regra).id is null then 'nao_classificado'
                when (m.regra).entra_dfc then coalesce((m.regra).linha_dfc, 'nao_classificado') end,
           date_trunc('month', m.pagamento)::date, m.valor_pago, m.natureza
      from mov m
     where p_relatorio = 'dfc' and m.pagamento between p_inicio and p_fim and m.valor_pago <> 0
    union all
    select case when p_relatorio = 'dre' then b.linha_dre else b.linha_dfc end,
           case when p_relatorio = 'dre' then b.competencia else date_trunc('month', b.data_caixa)::date end,
           b.valor, 'X'
      from bi_complementares b
     where b.cliente_id = any (p_clientes) and b.cancelado_em is null
       and ((p_relatorio = 'dre' and b.linha_dre is not null and b.competencia between date_trunc('month', p_inicio) and p_fim)
         or (p_relatorio = 'dfc' and b.linha_dfc is not null and b.data_caixa between p_inicio and p_fim))
  ),
  com_sinal as (
    select b.linha, b.comp,
           case
             when l.natureza is null then case when b.nat_mov = 'P' then -b.v else b.v end
             when b.nat_mov is null or b.nat_mov = 'X' then case when l.natureza = 'P' then -b.v else b.v end
             when b.nat_mov = l.natureza then case when l.natureza = 'P' then -b.v else b.v end
             else case when l.natureza = 'P' then b.v else -b.v end
           end as v
      from base b join linhas l on l.codigo = b.linha
     where b.linha is not null and l.soma is null
  ),
  meses as (
    select generate_series(date_trunc('month', p_inicio), date_trunc('month', p_fim), interval '1 month')::date as comp
  ),
  analiticas as (
    select l.codigo, ms.comp, coalesce(sum(s.v), 0)::numeric(15,2) as v
      from linhas l cross join meses ms
      left join com_sinal s on s.linha = l.codigo and s.comp = ms.comp
     where l.soma is null
     group by l.codigo, ms.comp
  ),
  arvore (raiz, folha) as (
    select l.codigo, x from linhas l, unnest(l.soma) x where l.soma is not null
    union
    select a.raiz, x from arvore a join linhas l on l.codigo = a.folha and l.soma is not null, unnest(l.soma) x
  ),
  subtotais as (
    select a.raiz as codigo, an.comp, sum(an.v)::numeric(15,2) as v
      from arvore a join analiticas an on an.codigo = a.folha
     group by a.raiz, an.comp
  ),
  tudo as (select * from analiticas union all select * from subtotais)
  select l.codigo, l.nome, l.ordem, l.soma is not null, l.natureza, t.comp, coalesce(t.v, 0)
    from linhas l join tudo t on t.codigo = l.codigo
   order by l.ordem, t.comp;
end $$;

-- ---------------------------------------------------------------- execução: só quem está logado
do $$
declare f text;
begin
  foreach f in array array[
    'public.bi_relatorio(text, uuid[], date, date, boolean)', 'public.bi_indicadores(uuid[], date, date, boolean)',
    'public.bi_orcado(text, uuid[], date, date)', 'public.bi_orcamento_gravar(jsonb, text)', 'public.bi_empresas()',
    'public.bi_acesso_pedir(uuid, text)', 'public.bi_acesso_decidir(uuid, boolean, text, integer)',
    'public.bi_acesso_encerrar(uuid, text)', 'public.bi_acessos_listar()', 'public.bi_registro_acessos(integer)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array[
    'app.bi_responsavel(uuid)', 'app.bi_liberado(uuid)', 'app.bi_pode_aprovar(uuid)', 'app.bi_org_dos_clientes(uuid[])',
    'app.bi_registrar_acesso(uuid, uuid[], text, date, date)', 'app.bi_regra(uuid, uuid, text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
