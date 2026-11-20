-- Omie: segundo modelo omie_contas/gestao_* (sem uso hoje, NOV-02).
-- Aplicada direto em produção em 19/11/2026 como "090_omie_gestao" (versão 20261119205330) e trazida ao repositório
-- em 20/11/2026 (ALT-02). Daqui para baixo, o texto é idêntico ao gravado em produção.

-- =====================================================================================================
--  090 · Gestão pelo Omie: o HUB traz a base do Omie das empresas do cliente e monta DRE e DFC
--  (detalhes no arquivo supabase/migrations/090_omie_gestao.sql e em docs/modulos/gestao-omie.md)
-- =====================================================================================================

create or replace function app.gestao_chave(p text)
returns text language sql immutable set search_path = '' as $$
  select upper(regexp_replace(trim(translate(
           regexp_replace(coalesce(p, ''), '^\s*[0-9]+(\.[0-9]+)*\s*-\s*', ''),
           'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
           'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')), '\s+', ' ', 'g'))
$$;

create or replace function app.omie_data(p text)
returns date language sql immutable set search_path = '' as $$
  select case when p ~ '^\d{2}/\d{2}/\d{4}$' then to_date(p, 'DD/MM/YYYY')
              when p ~ '^\d{4}-\d{2}-\d{2}' then left(p, 10)::date end
$$;

create or replace function app.omie_num(p text)
returns numeric language sql immutable set search_path = '' as $$
  select case when p ~ '^-?\d+(\.\d+)?$' then p::numeric end
$$;

create table if not exists public.omie_contas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  grupo text not null check (length(trim(grupo)) between 2 and 60),
  sigla text not null check (sigla ~ '^[A-Z0-9_]{2,20}$'),
  chave_final text not null default '',
  key_secret uuid,
  secret_secret uuid,
  ativo boolean not null default true,
  ultima_sinc timestamptz,
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  unique (cliente_id),
  unique (org_id, grupo, sigla)
);
comment on table public.omie_contas is
  'Conexão de uma empresa com o Omie (090). Chaves no Vault; grava só omie_conta_salvar/omie_conta_excluir (demonstrativos › gerir).';
alter table public.omie_contas enable row level security;
drop policy if exists omie_contas_ler on public.omie_contas;
create policy omie_contas_ler on public.omie_contas for select to authenticated
  using ((select app.hub_pode(org_id, 'demonstrativos', 'ver')));
revoke all on public.omie_contas from anon;
revoke all on public.omie_contas from authenticated;
grant select (id, org_id, cliente_id, grupo, sigla, chave_final, ativo, ultima_sinc, criado_em) on public.omie_contas to authenticated;

create or replace function public.omie_conta_salvar(p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_cli public.clientes;
  v_atual public.omie_contas;
  v_key text := nullif(trim(coalesce(p->>'app_key', '')), '');
  v_sec text := nullif(trim(coalesce(p->>'app_secret', '')), '');
  v_grupo text := trim(coalesce(p->>'grupo', ''));
  v_sigla text := upper(trim(coalesce(p->>'sigla', '')));
begin
  if v_id is not null then
    select * into v_atual from public.omie_contas where id = v_id;
    if not found then raise exception 'Conexão não encontrada.'; end if;
    select * into v_cli from public.clientes where id = v_atual.cliente_id;
  else
    select * into v_cli from public.clientes where id = nullif(p->>'cliente_id', '')::uuid;
    if not found then raise exception 'Escolha a empresa.'; end if;
  end if;
  if not app.hub_pode(v_cli.org_id, 'demonstrativos', 'gerir') then
    raise exception 'Só quem gerencia os Demonstrativos cadastra a conexão com o Omie.';
  end if;
  if length(v_grupo) < 2 then raise exception 'Informe o grupo (ex.: Grupo Clara).'; end if;
  if v_sigla !~ '^[A-Z0-9_]{2,20}$' then raise exception 'A sigla deve ter de 2 a 20 letras ou números, sem espaço (ex.: CLARATEC).'; end if;
  if (v_key is null) <> (v_sec is null) then raise exception 'Informe as duas chaves do Omie (App Key e App Secret) juntas.'; end if;
  if v_key is not null and (v_key !~ '^[0-9]{6,20}$' or v_sec !~ '^[0-9a-fA-F]{20,64}$') then
    raise exception 'As chaves não parecem do Omie: a App Key tem só números e a App Secret letras e números. Copie de novo no Omie: Meus aplicativos › Resumo do App › Chave de Integração (API).';
  end if;

  if v_id is null then
    if v_key is null then raise exception 'Informe a App Key e a App Secret do Omie.'; end if;
    if exists (select 1 from public.omie_contas where cliente_id = v_cli.id) then
      raise exception 'Esta empresa já tem conexão com o Omie. Edite a conexão existente.';
    end if;
    delete from vault.secrets where name in ('omie_key_' || v_cli.id, 'omie_secret_' || v_cli.id);
    insert into public.omie_contas (org_id, cliente_id, grupo, sigla, chave_final, key_secret, secret_secret, ativo, criado_por)
    values (v_cli.org_id, v_cli.id, v_grupo, v_sigla, right(v_key, 4),
            vault.create_secret(v_key, 'omie_key_' || v_cli.id, 'App Key do Omie (090)'),
            vault.create_secret(v_sec, 'omie_secret_' || v_cli.id, 'App Secret do Omie (090)'),
            coalesce((p->>'ativo')::boolean, true), auth.uid())
    returning id into v_id;
  else
    if v_key is not null then
      perform vault.update_secret(v_atual.key_secret, v_key);
      perform vault.update_secret(v_atual.secret_secret, v_sec);
    end if;
    update public.omie_contas
       set grupo = v_grupo, sigla = v_sigla, ativo = coalesce((p->>'ativo')::boolean, ativo),
           chave_final = coalesce(right(v_key, 4), chave_final)
     where id = v_id;
  end if;
  insert into public.hub_auditoria (org_id, user_id, app, acao, alvo, depois)
  values (v_cli.org_id, auth.uid(), 'demonstrativos', 'omie_conexao_salva', v_cli.razao_social,
          jsonb_build_object('grupo', v_grupo, 'sigla', v_sigla, 'chaves_trocadas', v_key is not null));
  return v_id;
end $$;

create or replace function public.omie_conta_excluir(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.omie_contas;
begin
  select * into v from public.omie_contas where id = p_id;
  if not found then raise exception 'Conexão não encontrada.'; end if;
  if not app.hub_pode(v.org_id, 'demonstrativos', 'gerir') then
    raise exception 'Só quem gerencia os Demonstrativos exclui a conexão com o Omie.';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 5 then raise exception 'Informe o motivo (pelo menos 5 letras).'; end if;
  delete from vault.secrets where id in (v.key_secret, v.secret_secret);
  delete from public.omie_contas where id = p_id;
  insert into public.hub_auditoria (org_id, user_id, app, acao, alvo, depois)
  values (v.org_id, auth.uid(), 'demonstrativos', 'omie_conexao_excluida', v.sigla, jsonb_build_object('motivo', p_motivo));
end $$;

create or replace function public.omie_credenciais(p_conta uuid)
returns table (app_key text, app_secret text)
language sql stable security definer set search_path = '' as $$
  select k.decrypted_secret, s.decrypted_secret
    from public.omie_contas c
    join vault.decrypted_secrets k on k.id = c.key_secret
    join vault.decrypted_secrets s on s.id = c.secret_secret
   where c.id = p_conta
$$;

create table if not exists public.omie_registros (
  conta_id uuid not null references public.omie_contas(id) on delete cascade,
  entidade text not null,
  codigo text not null,
  dados jsonb not null,
  atualizado_em timestamptz not null default now(),
  primary key (conta_id, entidade, codigo)
);
comment on table public.omie_registros is 'Espelho cru do Omie por conexão (090). Só o servidor grava (omie_registros_gravar).';
alter table public.omie_registros enable row level security;
drop policy if exists omie_registros_ler on public.omie_registros;
create policy omie_registros_ler on public.omie_registros for select to authenticated
  using (exists (select 1 from public.omie_contas c where c.id = conta_id and (select app.hub_pode(c.org_id, 'demonstrativos', 'ver'))));
revoke all on public.omie_registros from anon;
revoke insert, update, delete, truncate on public.omie_registros from authenticated;

create or replace function public.omie_registros_gravar(p_conta uuid, p_entidade text, p_itens jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  insert into public.omie_registros (conta_id, entidade, codigo, dados, atualizado_em)
  select p_conta, p_entidade, i->>'codigo', i->'dados', now()
    from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) i
   where coalesce(i->>'codigo', '') <> ''
  on conflict (conta_id, entidade, codigo) do update set dados = excluded.dados, atualizado_em = now();
  get diagnostics n = row_count;
  return n;
end $$;

create table if not exists public.omie_sincronizacoes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  conta_id uuid not null references public.omie_contas(id) on delete cascade,
  situacao text not null default 'na_fila' check (situacao in ('na_fila', 'rodando', 'concluida', 'erro')),
  origem text not null default 'manual' check (origem in ('manual', 'agenda')),
  progresso jsonb not null default '{}'::jsonb,
  erro text,
  pedido_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  iniciado_em timestamptz,
  atualizado_em timestamptz not null default now(),
  concluido_em timestamptz
);
create index if not exists omie_sinc_conta on public.omie_sincronizacoes (conta_id, criado_em desc);
create unique index if not exists omie_sinc_uma_aberta on public.omie_sincronizacoes (conta_id) where situacao in ('na_fila', 'rodando');
alter table public.omie_sincronizacoes enable row level security;
drop policy if exists omie_sinc_ler on public.omie_sincronizacoes;
create policy omie_sinc_ler on public.omie_sincronizacoes for select to authenticated
  using ((select app.hub_pode(org_id, 'demonstrativos', 'ver')));
revoke all on public.omie_sincronizacoes from anon;
revoke insert, update, delete, truncate on public.omie_sincronizacoes from authenticated;

create or replace function public.omie_sincronizar_pedir(p_conta uuid default null, p_org uuid default null, p_grupo text default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_org uuid; n integer;
begin
  select coalesce(p_org, (select org_id from public.omie_contas where id = p_conta)) into v_org;
  if v_org is null or not app.hub_pode(v_org, 'demonstrativos', 'operar') then
    raise exception 'Sem permissão para sincronizar com o Omie.';
  end if;
  insert into public.omie_sincronizacoes (org_id, conta_id, origem, pedido_por)
  select c.org_id, c.id, 'manual', auth.uid()
    from public.omie_contas c
   where c.org_id = v_org and c.ativo
     and (p_conta is null or c.id = p_conta) and (p_grupo is null or c.grupo = p_grupo)
     and not exists (select 1 from public.omie_sincronizacoes s where s.conta_id = c.id and s.situacao in ('na_fila', 'rodando'));
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function app.omie_agendar_diario()
returns void language sql security definer set search_path = '' as $$
  insert into public.omie_sincronizacoes (org_id, conta_id, origem)
  select c.org_id, c.id, 'agenda' from public.omie_contas c
   where c.ativo and not exists (select 1 from public.omie_sincronizacoes s where s.conta_id = c.id and s.situacao in ('na_fila', 'rodando'));
$$;

create or replace function public.omie_sinc_proxima()
returns table (id uuid, conta_id uuid, progresso jsonb)
language plpgsql security definer set search_path = '' as $$
declare v public.omie_sincronizacoes;
begin
  select * into v from public.omie_sincronizacoes s
   where s.situacao = 'na_fila' or (s.situacao = 'rodando' and s.atualizado_em < now() - interval '10 minutes')
   order by s.criado_em
   for update skip locked limit 1;
  if not found then return; end if;
  update public.omie_sincronizacoes s
     set situacao = 'rodando', iniciado_em = coalesce(s.iniciado_em, now()), atualizado_em = now()
   where s.id = v.id;
  return query select v.id, v.conta_id, v.progresso;
end $$;

create or replace function public.omie_sinc_progresso(p_sinc uuid, p_progresso jsonb, p_situacao text default 'rodando', p_erro text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_conta uuid;
begin
  if p_situacao not in ('na_fila', 'rodando', 'concluida', 'erro') then raise exception 'Situação inválida.'; end if;
  update public.omie_sincronizacoes
     set progresso = coalesce(p_progresso, progresso), situacao = p_situacao, erro = left(p_erro, 500), atualizado_em = now(),
         concluido_em = case when p_situacao in ('concluida', 'erro') then now() end
   where id = p_sinc returning conta_id into v_conta;
  if p_situacao = 'concluida' then
    perform app.omie_fatos_montar(v_conta);
    update public.omie_contas set ultima_sinc = now() where id = v_conta;
  end if;
end $$;

create table if not exists public.gestao_fatos (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  conta_id uuid not null references public.omie_contas(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  grupo text not null,
  sigla text not null,
  fonte text not null,
  registro text not null,
  natureza text not null check (natureza in ('R', 'P')),
  categoria_codigo text,
  categoria text,
  categoria_chave text not null default '',
  data_competencia date,
  data_caixa date,
  valor_competencia numeric(16, 2) not null default 0,
  valor_caixa numeric(16, 2) not null default 0,
  contraparte text,
  contraparte_doc text,
  documento text,
  intragrupo boolean not null default false
);
create index if not exists gestao_fatos_comp on public.gestao_fatos (org_id, grupo, data_competencia);
create index if not exists gestao_fatos_caixa on public.gestao_fatos (org_id, grupo, data_caixa);
create index if not exists gestao_fatos_conta on public.gestao_fatos (conta_id);
comment on table public.gestao_fatos is
  'Movimentos do Omie normalizados para DRE/DFC (090): + receita/entrada, − despesa/saída; rateio por categoria. Montados por app.omie_fatos_montar.';
alter table public.gestao_fatos enable row level security;
drop policy if exists gestao_fatos_ler on public.gestao_fatos;
create policy gestao_fatos_ler on public.gestao_fatos for select to authenticated
  using ((select app.hub_pode(org_id, 'demonstrativos', 'ver')));
revoke all on public.gestao_fatos from anon;
revoke insert, update, delete, truncate on public.gestao_fatos from authenticated;

create table if not exists public.gestao_plano (
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  grupo text not null,
  codigo text not null check (codigo ~ '^[0-9]+(\.[0-9]+)*$'),
  nome text not null,
  tipo text not null check (tipo in ('RB', 'DED', 'CUS', 'PES', 'ADM', 'COM', 'TRI', 'RFI', 'DFI', 'CX', 'IR')),
  ordem int not null default 0,
  primary key (org_id, grupo, codigo)
);
comment on table public.gestao_plano is
  'Plano gerencial MDC por grupo (090). Tipo: RB receita bruta, DED deduções, CUS custos, PES/ADM/COM/TRI despesas, RFI/DFI financeiro, CX amortização de dívida (só DFC), IR impostos sobre o lucro.';
alter table public.gestao_plano enable row level security;
drop policy if exists gestao_plano_ler on public.gestao_plano;
create policy gestao_plano_ler on public.gestao_plano for select to authenticated
  using ((select app.hub_pode(org_id, 'demonstrativos', 'ver')));
revoke all on public.gestao_plano from anon;
revoke insert, update, delete, truncate on public.gestao_plano from authenticated;

create table if not exists public.gestao_classificacao (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  grupo text not null,
  sigla text not null,
  categoria text not null,
  chave text not null,
  linha text,
  dfc text check (dfc in ('operacional', 'investimento', 'financiamento', 'grupo', 'outros')),
  alterado_por uuid references auth.users(id) on delete set null,
  alterado_em timestamptz not null default now(),
  unique (org_id, grupo, sigla, chave)
);
comment on table public.gestao_classificacao is
  'Categoria do Omie → linha do plano gerencial e grupo da DFC, por empresa (090). linha null = a classificar; NAO_DRE = só DFC.';
alter table public.gestao_classificacao enable row level security;
drop policy if exists gestao_class_ler on public.gestao_classificacao;
create policy gestao_class_ler on public.gestao_classificacao for select to authenticated
  using ((select app.hub_pode(org_id, 'demonstrativos', 'ver')));
revoke all on public.gestao_classificacao from anon;
revoke insert, update, delete, truncate on public.gestao_classificacao from authenticated;

create or replace function public.gestao_classificar(p_id uuid, p_linha text, p_dfc text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.gestao_classificacao; v_linha text := nullif(trim(coalesce(p_linha, '')), '');
begin
  select * into v from public.gestao_classificacao where id = p_id;
  if not found then raise exception 'Categoria não encontrada.'; end if;
  if not app.hub_pode(v.org_id, 'demonstrativos', 'operar') then raise exception 'Sem permissão para classificar categorias.'; end if;
  if v_linha is not null and v_linha <> 'NAO_DRE'
     and not exists (select 1 from public.gestao_plano where org_id = v.org_id and grupo = v.grupo and codigo = v_linha) then
    raise exception 'Linha % não existe no plano do grupo.', v_linha;
  end if;
  if v_linha = 'NAO_DRE' and p_dfc is null then raise exception 'Escolha onde a categoria entra na DFC.'; end if;
  update public.gestao_classificacao
     set linha = v_linha, dfc = case when v_linha = 'NAO_DRE' then p_dfc end, alterado_por = auth.uid(), alterado_em = now()
   where id = p_id;
  insert into public.hub_auditoria (org_id, user_id, app, acao, alvo, antes, depois)
  values (v.org_id, auth.uid(), 'demonstrativos', 'gestao_categoria_classificada', v.sigla || ' · ' || v.categoria,
          jsonb_build_object('linha', v.linha, 'dfc', v.dfc), jsonb_build_object('linha', v_linha, 'dfc', p_dfc));
end $$;

create or replace function app.omie_fatos_montar(p_conta uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare c public.omie_contas; n integer; v_grupo_docs text[];
begin
  select * into c from public.omie_contas where id = p_conta;
  if not found then return 0; end if;
  select coalesce(array_agg(regexp_replace(cl.cnpj, '\D', '', 'g')), '{}')
    into v_grupo_docs
    from public.omie_contas o join public.clientes cl on cl.id = o.cliente_id
   where o.org_id = c.org_id and o.grupo = c.grupo and cl.cnpj is not null;

  delete from public.gestao_fatos where conta_id = p_conta;

  with cat as (
    select codigo, coalesce(nullif(dados->>'descricao', ''), dados->>'descricao_padrao', codigo) as nome
      from public.omie_registros where conta_id = p_conta and entidade = 'categorias'
  ), pes as (
    select codigo, regexp_replace(coalesce(dados->>'cnpj_cpf', ''), '\D', '', 'g') as doc,
           coalesce(nullif(dados->>'nome_fantasia', ''), dados->>'razao_social') as nome
      from public.omie_registros where conta_id = p_conta and entidade = 'clientes'
  ), mov as (
    select r.codigo, r.dados, r.dados->'detalhes' as d, r.dados->'resumo' as rs
      from public.omie_registros r where r.conta_id = p_conta and r.entidade = 'movimentos'
  ), mov_base as (
    select 'movimentos'::text as fonte, m.codigo,
           upper(left(coalesce(m.d->>'cNatureza', ''), 1)) as natureza,
           coalesce(app.omie_data(m.d->>'dDtEmissao'), app.omie_data(m.d->>'dDtRegistro'), app.omie_data(m.d->>'dDtVenc')) as emissao,
           app.omie_data(m.d->>'dDtPagamento') as pagamento,
           coalesce(app.omie_num(m.d->>'nValorTitulo'), 0) as valor,
           coalesce(app.omie_num(m.rs->>'nValPago'), 0) as pago,
           m.d->>'nCodCliente' as pessoa,
           coalesce(nullif(m.d->>'cNumDocFiscal', ''), m.d->>'cNumTitulo') as documento,
           case when jsonb_typeof(m.dados->'categorias') = 'array' and jsonb_array_length(m.dados->'categorias') > 0
                then (select jsonb_agg(jsonb_build_object('cat', x->>'cCodCateg',
                                                          'pct', app.omie_num(x->>'nDistrPercentual'),
                                                          'val', app.omie_num(x->>'nDistrValor')))
                        from jsonb_array_elements(m.dados->'categorias') x)
                else jsonb_build_array(jsonb_build_object('cat', m.d->>'cCodCateg', 'pct', 100)) end as rateio
      from mov m
     where coalesce(m.d->>'cStatus', '') not ilike 'CANCEL%'
  ), tit as (
    select r.entidade, r.codigo, r.dados from public.omie_registros r
     where r.conta_id = p_conta and r.entidade in ('contas_receber', 'contas_pagar')
       and not exists (select 1 from mov)
  ), tit_base as (
    select t.entidade as fonte, t.codigo,
           case t.entidade when 'contas_receber' then 'R' else 'P' end as natureza,
           coalesce(app.omie_data(t.dados->>'data_emissao'), app.omie_data(t.dados->>'data_registro'), app.omie_data(t.dados->>'data_vencimento')) as emissao,
           null::date as pagamento,
           coalesce(app.omie_num(t.dados->>'valor_documento'), 0) as valor,
           0::numeric as pago,
           t.dados->>'codigo_cliente_fornecedor' as pessoa,
           coalesce(nullif(t.dados->>'numero_documento_fiscal', ''), t.dados->>'numero_documento') as documento,
           case when jsonb_typeof(t.dados->'categorias') = 'array' and jsonb_array_length(t.dados->'categorias') > 0
                then (select jsonb_agg(jsonb_build_object('cat', x->>'codigo_categoria',
                                                          'pct', app.omie_num(x->>'percentual'),
                                                          'val', app.omie_num(x->>'valor')))
                        from jsonb_array_elements(t.dados->'categorias') x)
                else jsonb_build_array(jsonb_build_object('cat', t.dados->>'codigo_categoria', 'pct', 100)) end as rateio
      from tit t
     where coalesce(t.dados->>'status_titulo', '') not ilike 'CANCEL%'
  ), base as (
    select * from mov_base union all select * from tit_base
  ), linhas as (
    select b.*, x->>'cat' as cat,
           case when b.valor <> 0 and app.omie_num(x->>'val') is not null and coalesce(app.omie_num(x->>'pct'), 0) = 0
                then app.omie_num(x->>'val') / b.valor
                else coalesce(app.omie_num(x->>'pct'), 100) / 100 end as fator
      from base b cross join lateral jsonb_array_elements(b.rateio) x
     where b.natureza in ('R', 'P')
  )
  insert into public.gestao_fatos (org_id, conta_id, cliente_id, grupo, sigla, fonte, registro, natureza, categoria_codigo,
                                   categoria, categoria_chave, data_competencia, data_caixa, valor_competencia, valor_caixa,
                                   contraparte, contraparte_doc, documento, intragrupo)
  select c.org_id, c.id, c.cliente_id, c.grupo, c.sigla, l.fonte, l.codigo, l.natureza, l.cat,
         coalesce(cat.nome, l.cat, 'Sem categoria'), app.gestao_chave(coalesce(cat.nome, l.cat, 'Sem categoria')),
         l.emissao, case when l.pago <> 0 then l.pagamento end,
         round(l.valor * l.fator * case l.natureza when 'R' then 1 else -1 end, 2),
         round(l.pago * l.fator * case l.natureza when 'R' then 1 else -1 end, 2),
         pes.nome, nullif(pes.doc, ''), l.documento,
         coalesce(pes.doc <> '' and pes.doc = any (v_grupo_docs), false)
    from linhas l
    left join cat on cat.codigo = l.cat
    left join pes on pes.codigo = l.pessoa;
  get diagnostics n = row_count;

  insert into public.gestao_classificacao (org_id, grupo, sigla, categoria, chave)
  select distinct on (f.categoria_chave) c.org_id, c.grupo, c.sigla, f.categoria, f.categoria_chave
    from public.gestao_fatos f where f.conta_id = p_conta
  on conflict (org_id, grupo, sigla, chave) do nothing;
  return n;
end $$;

create table if not exists public.gestao_complementares (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  grupo text not null,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  linha text not null,
  dfc text check (dfc in ('operacional', 'investimento', 'financiamento', 'grupo', 'outros')),
  natureza text not null check (natureza in ('R', 'P')),
  valor numeric(16, 2) not null check (valor > 0),
  data_competencia date,
  data_caixa date,
  descricao text not null check (length(trim(descricao)) between 3 and 200),
  documento text,
  origem text not null default 'manual' check (origem in ('manual', 'planilha')),
  lote uuid,
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  check (data_competencia is not null or data_caixa is not null),
  check (linha <> 'NAO_DRE' or dfc is not null)
);
create index if not exists gestao_compl_grupo on public.gestao_complementares (org_id, grupo);
comment on table public.gestao_complementares is
  'Lançamentos fora do Omie para a análise (090): data de competência entra na DRE faturado, data de caixa na DRE recebido e na DFC.';
alter table public.gestao_complementares enable row level security;
drop policy if exists gestao_compl_ler on public.gestao_complementares;
create policy gestao_compl_ler on public.gestao_complementares for select to authenticated
  using ((select app.hub_pode(org_id, 'demonstrativos', 'ver')));
revoke all on public.gestao_complementares from anon;
revoke insert, update, delete, truncate on public.gestao_complementares from authenticated;

create or replace function app.gestao_complementar_gravar(p jsonb, p_origem text, p_lote uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_cli public.clientes;
  v_grupo text := trim(coalesce(p->>'grupo', ''));
  v_linha text := trim(coalesce(p->>'linha', ''));
  v_nat text := upper(left(coalesce(p->>'natureza', ''), 1));
  v_valor numeric := round(app.omie_num(p->>'valor'), 2);
  v_dfc text := nullif(p->>'dfc', '');
begin
  select * into v_cli from public.clientes where id = nullif(p->>'cliente_id', '')::uuid;
  if not found then raise exception 'Escolha a empresa do lançamento.'; end if;
  if not app.hub_pode(v_cli.org_id, 'demonstrativos', 'operar') then raise exception 'Sem permissão para lançar.'; end if;
  if not exists (select 1 from public.omie_contas where cliente_id = v_cli.id and grupo = v_grupo) then
    raise exception 'A empresa % não faz parte do grupo %.', v_cli.razao_social, v_grupo;
  end if;
  if v_linha <> 'NAO_DRE' and not exists (select 1 from public.gestao_plano where org_id = v_cli.org_id and grupo = v_grupo and codigo = v_linha) then
    raise exception 'Linha "%" não existe no plano do grupo.', v_linha;
  end if;
  if v_nat not in ('R', 'P') then raise exception 'Informe se é receita/entrada ou despesa/saída.'; end if;
  if v_valor is null or v_valor <= 0 then raise exception 'Informe um valor maior que zero.'; end if;
  if v_linha = 'NAO_DRE' and v_dfc is null then raise exception 'Lançamento fora da DRE precisa do grupo da DFC.'; end if;
  if nullif(p->>'data_competencia', '') is null and nullif(p->>'data_caixa', '') is null then
    raise exception 'Informe a data de competência, a de pagamento/recebimento ou as duas.';
  end if;

  if v_id is null then
    insert into public.gestao_complementares (org_id, grupo, cliente_id, linha, dfc, natureza, valor, data_competencia, data_caixa,
                                              descricao, documento, origem, lote, criado_por)
    values (v_cli.org_id, v_grupo, v_cli.id, v_linha, case when v_linha = 'NAO_DRE' then v_dfc end, v_nat, v_valor,
            nullif(p->>'data_competencia', '')::date, nullif(p->>'data_caixa', '')::date,
            trim(p->>'descricao'), nullif(trim(coalesce(p->>'documento', '')), ''), p_origem, p_lote, auth.uid())
    returning id into v_id;
  else
    update public.gestao_complementares
       set cliente_id = v_cli.id, grupo = v_grupo, linha = v_linha, dfc = case when v_linha = 'NAO_DRE' then v_dfc end,
           natureza = v_nat, valor = v_valor,
           data_competencia = nullif(p->>'data_competencia', '')::date, data_caixa = nullif(p->>'data_caixa', '')::date,
           descricao = trim(p->>'descricao'), documento = nullif(trim(coalesce(p->>'documento', '')), '')
     where id = v_id and org_id = v_cli.org_id;
    if not found then raise exception 'Lançamento não encontrado.'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.gestao_complementar_salvar(p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  return app.gestao_complementar_gravar(p, 'manual', null);
end $$;

create or replace function public.gestao_complementares_importar(p_linhas jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_lote uuid := gen_random_uuid(); i int := 0; r jsonb;
begin
  if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) = 0 then raise exception 'A planilha não tem linhas.'; end if;
  if jsonb_array_length(p_linhas) > 5000 then raise exception 'Envie no máximo 5.000 linhas por vez.'; end if;
  for r in select * from jsonb_array_elements(p_linhas) loop
    i := i + 1;
    begin
      perform app.gestao_complementar_gravar(r - 'id', 'planilha', v_lote);
    exception when others then
      raise exception 'Linha %: %', coalesce(r->>'linha_planilha', i::text), sqlerrm;
    end;
  end loop;
  return i;
end $$;

create or replace function public.gestao_complementar_excluir(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.gestao_complementares;
begin
  select * into v from public.gestao_complementares where id = p_id;
  if not found then raise exception 'Lançamento não encontrado.'; end if;
  if not app.hub_pode(v.org_id, 'demonstrativos', 'operar') then raise exception 'Sem permissão para excluir.'; end if;
  if length(trim(coalesce(p_motivo, ''))) < 5 then raise exception 'Informe o motivo (pelo menos 5 letras).'; end if;
  delete from public.gestao_complementares where id = p_id;
  insert into public.hub_auditoria (org_id, user_id, app, acao, alvo, antes, depois)
  values (v.org_id, auth.uid(), 'demonstrativos', 'gestao_complementar_excluido', v.descricao, to_jsonb(v), jsonb_build_object('motivo', p_motivo));
end $$;

create or replace function app.gestao_grupo_pode(p_org uuid, p_grupo text, p_min text default 'ver')
returns boolean language sql stable security definer set search_path = '' as $$
  select app.hub_pode(p_org, 'demonstrativos', p_min)
      or (p_min = 'ver'
          and exists (select 1 from public.omie_contas o where o.org_id = p_org and o.grupo = p_grupo)
          and not exists (select 1 from public.omie_contas o where o.org_id = p_org and o.grupo = p_grupo
                             and not app.portal_pode(o.cliente_id, 'demonstrativos')))
$$;

create or replace function public.gestao_grupos()
returns table (org_id uuid, grupo text, empresas jsonb)
language sql stable security definer set search_path = '' as $$
  select o.org_id, o.grupo,
         jsonb_agg(jsonb_build_object('cliente_id', o.cliente_id, 'sigla', o.sigla,
                                      'nome', coalesce(nullif(c.nome_fantasia, ''), c.razao_social), 'cnpj', c.cnpj,
                                      'ultima_sinc', o.ultima_sinc) order by o.sigla)
    from public.omie_contas o join public.clientes c on c.id = o.cliente_id
   group by o.org_id, o.grupo
  having app.gestao_grupo_pode(o.org_id, o.grupo, 'ver')
$$;

create or replace function public.gestao_plano_do_grupo(p_org uuid, p_grupo text)
returns table (codigo text, nome text, tipo text, ordem int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.gestao_grupo_pode(p_org, p_grupo, 'ver') then raise exception 'Sem acesso a este grupo.'; end if;
  return query select p.codigo, p.nome, p.tipo, p.ordem from public.gestao_plano p
                where p.org_id = p_org and p.grupo = p_grupo order by p.ordem, p.codigo;
end $$;

create or replace function public.gestao_relatorio(p_org uuid, p_grupo text, p_de date, p_ate date)
returns table (regime text, cliente_id uuid, sigla text, mes date, linha text, dfc text, categoria text,
               intragrupo boolean, origem text, valor numeric, qtd bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.gestao_grupo_pode(p_org, p_grupo, 'ver') then raise exception 'Sem acesso a este grupo.'; end if;
  if p_ate < p_de or p_ate > p_de + interval '36 months' then raise exception 'Escolha um período de até 36 meses.'; end if;
  return query
  with f as (
    select 'competencia'::text as reg, x.cliente_id, x.sigla, date_trunc('month', x.data_competencia)::date as m,
           x.categoria_chave, x.categoria, x.intragrupo, x.valor_competencia as v
      from public.gestao_fatos x
     where x.org_id = p_org and x.grupo = p_grupo and x.data_competencia between p_de and p_ate and x.valor_competencia <> 0
    union all
    select 'caixa', x.cliente_id, x.sigla, date_trunc('month', x.data_caixa)::date, x.categoria_chave, x.categoria, x.intragrupo, x.valor_caixa
      from public.gestao_fatos x
     where x.org_id = p_org and x.grupo = p_grupo and x.data_caixa between p_de and p_ate and x.valor_caixa <> 0
  )
  select f.reg, f.cliente_id, f.sigla, f.m, k.linha, k.dfc, max(f.categoria), f.intragrupo, 'omie'::text,
         sum(f.v), count(*)
    from f left join public.gestao_classificacao k
      on k.org_id = p_org and k.grupo = p_grupo and k.sigla = f.sigla and k.chave = f.categoria_chave
   group by f.reg, f.cliente_id, f.sigla, f.m, k.linha, k.dfc, f.categoria_chave, f.intragrupo
  union all
  select r.reg, g.cliente_id, o.sigla, date_trunc('month', r.d)::date, g.linha, g.dfc, 'Lançamento complementar', false,
         'complementar', sum(g.valor * case g.natureza when 'R' then 1 else -1 end), count(*)
    from public.gestao_complementares g
    join public.omie_contas o on o.cliente_id = g.cliente_id
    cross join lateral (values ('competencia', g.data_competencia), ('caixa', g.data_caixa)) r(reg, d)
   where g.org_id = p_org and g.grupo = p_grupo and r.d between p_de and p_ate
   group by r.reg, g.cliente_id, o.sigla, date_trunc('month', r.d), g.linha, g.dfc;
end $$;

create or replace function public.gestao_lancamentos(p_org uuid, p_grupo text, p_de date, p_ate date, p_regime text,
                                                     p_linha text default null, p_cliente uuid default null,
                                                     p_categoria text default null)
returns table (data date, sigla text, categoria text, linha text, contraparte text, documento text,
               valor numeric, intragrupo boolean, origem text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.gestao_grupo_pode(p_org, p_grupo, 'ver') then raise exception 'Sem acesso a este grupo.'; end if;
  if p_regime not in ('competencia', 'caixa') then raise exception 'Regime inválido.'; end if;
  return query
  select * from (
    select case p_regime when 'competencia' then x.data_competencia else x.data_caixa end as d, x.sigla, x.categoria, k.linha,
           x.contraparte, x.documento,
           case p_regime when 'competencia' then x.valor_competencia else x.valor_caixa end as v, x.intragrupo, 'omie'::text
      from public.gestao_fatos x
      left join public.gestao_classificacao k
        on k.org_id = x.org_id and k.grupo = x.grupo and k.sigla = x.sigla and k.chave = x.categoria_chave
     where x.org_id = p_org and x.grupo = p_grupo
       and (case p_regime when 'competencia' then x.data_competencia else x.data_caixa end) between p_de and p_ate
       and (case p_regime when 'competencia' then x.valor_competencia else x.valor_caixa end) <> 0
       and (p_cliente is null or x.cliente_id = p_cliente)
       and (p_linha is null or coalesce(k.linha, 'A_CLASSIFICAR') = p_linha)
       and (p_categoria is null or x.categoria = p_categoria)
    union all
    select case p_regime when 'competencia' then g.data_competencia else g.data_caixa end, o.sigla, 'Lançamento complementar', g.linha,
           g.descricao, g.documento, g.valor * case g.natureza when 'R' then 1 else -1 end, false, 'complementar'
      from public.gestao_complementares g join public.omie_contas o on o.cliente_id = g.cliente_id
     where g.org_id = p_org and g.grupo = p_grupo
       and (case p_regime when 'competencia' then g.data_competencia else g.data_caixa end) between p_de and p_ate
       and (p_cliente is null or g.cliente_id = p_cliente)
       and (p_linha is null or g.linha = p_linha)
       and (p_categoria is null or p_categoria = 'Lançamento complementar')
  ) t order by t.d, t.sigla limit 3000;
end $$;

do $$ begin
  if not exists (select 1 from vault.secrets where name = 'omie_sinc_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'omie_sinc_token',
      'Token interno gerado pelo banco: o pg_cron usa para chamar a Função Edge omie-sincronizar (090).');
  end if;
end $$;

create or replace function public.omie_token_confere(p_token text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'omie_sinc_token' and decrypted_secret = p_token)
$$;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'omie-sincronizar') then perform cron.unschedule('omie-sincronizar'); end if;
  if exists (select 1 from cron.job where jobname = 'omie-agenda-diaria') then perform cron.unschedule('omie-agenda-diaria'); end if;
end $$;
select cron.schedule('omie-sincronizar', '*/2 * * * *', $cron$
  select net.http_post(
    url := 'https://bulqqdgfrrpqquqvjjfa.supabase.co/functions/v1/omie-sincronizar',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-omie-token', (select decrypted_secret from vault.decrypted_secrets where name = 'omie_sinc_token')),
    body := '{"acao":"rodar"}'::jsonb,
    timeout_milliseconds := 150000)
  where exists (select 1 from public.omie_sincronizacoes where situacao in ('na_fila', 'rodando'))
$cron$);
select cron.schedule('omie-agenda-diaria', '7 9 * * *', $cron$ select app.omie_agendar_diario() $cron$);

revoke all on function app.gestao_chave(text), app.omie_data(text), app.omie_num(text), app.omie_fatos_montar(uuid),
  app.omie_agendar_diario(), app.gestao_complementar_gravar(jsonb, text, uuid), app.gestao_grupo_pode(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.omie_credenciais(uuid), public.omie_registros_gravar(uuid, text, jsonb),
  public.omie_sinc_proxima(), public.omie_sinc_progresso(uuid, jsonb, text, text), public.omie_token_confere(text)
  from public, anon, authenticated;
grant execute on function public.omie_credenciais(uuid), public.omie_registros_gravar(uuid, text, jsonb),
  public.omie_sinc_proxima(), public.omie_sinc_progresso(uuid, jsonb, text, text), public.omie_token_confere(text)
  to service_role;
revoke all on function public.omie_conta_salvar(jsonb), public.omie_conta_excluir(uuid, text),
  public.omie_sincronizar_pedir(uuid, uuid, text), public.gestao_classificar(uuid, text, text),
  public.gestao_complementar_salvar(jsonb), public.gestao_complementares_importar(jsonb),
  public.gestao_complementar_excluir(uuid, text), public.gestao_grupos(), public.gestao_plano_do_grupo(uuid, text),
  public.gestao_relatorio(uuid, text, date, date), public.gestao_lancamentos(uuid, text, date, date, text, text, uuid, text)
  from public, anon;
grant execute on function public.omie_conta_salvar(jsonb), public.omie_conta_excluir(uuid, text),
  public.omie_sincronizar_pedir(uuid, uuid, text), public.gestao_classificar(uuid, text, text),
  public.gestao_complementar_salvar(jsonb), public.gestao_complementares_importar(jsonb),
  public.gestao_complementar_excluir(uuid, text), public.gestao_grupos(), public.gestao_plano_do_grupo(uuid, text),
  public.gestao_relatorio(uuid, text, date, date), public.gestao_lancamentos(uuid, text, date, date, text, text, uuid, text)
  to authenticated;

do $$
declare v_org uuid;
begin
  select org_id into v_org from public.clientes where regexp_replace(cnpj, '\D', '', 'g') = '14012035000155' limit 1;
  if v_org is null then return; end if;
  insert into public.gestao_plano (org_id, grupo, codigo, nome, tipo, ordem)
  select v_org, 'Grupo Clara', x.codigo, x.nome, x.tipo, x.ordem
    from (values
      ('3.1.01','Venda de Produção do Estabelecimento','RB',10),
      ('3.2.01','Serviços de Manutenção e Usinagem (NFS-e)','RB',20),
      ('3.2.02','Industrialização por Encomenda (NF-e)','RB',30),
      ('3.3.01','Outras Receitas Operacionais','RB',40),
      ('4.1.01','IPI sobre Faturamento','DED',50),
      ('4.1.02','ICMS sobre Vendas','DED',60),
      ('4.1.03','PIS sobre Faturamento','DED',70),
      ('4.1.04','COFINS sobre Faturamento','DED',80),
      ('4.1.05','ISS sobre Serviços','DED',90),
      ('4.1.06','Simples Nacional (DAS devido no mês)','DED',100),
      ('4.1.07','Devoluções, Cancelamentos e Abatimentos','DED',110),
      ('4.1.08','Outros impostos sobre o faturamento / diferença notas × DRE Omie','DED',120),
      ('5.0.01','Custo médio das vendas (CMC, apurado pelo estoque no Omie)','CUS',130),
      ('5.1.01','Matéria-Prima','CUS',140),
      ('5.1.02','Matéria-Prima Secundária, Gases e Consumíveis de Corte/Solda','CUS',150),
      ('5.1.03','Serviços de Terceiros e Industrialização','CUS',160),
      ('5.1.04','Materiais de Consumo Produtivo','CUS',170),
      ('5.1.05','Mão de Obra Direta - Salários (Produção)','CUS',180),
      ('5.1.06','Fretes sobre Compras','CUS',190),
      ('5.1.07','EPI e Uniformes','CUS',200),
      ('5.1.08','Embalagens','CUS',210),
      ('5.1.09','(−) Devoluções de Compras','CUS',220),
      ('5.1.10','(±) Variação de Estoques','CUS',230),
      ('5.1.11','Encargos Sociais (INSS/FGTS) - Produção','CUS',240),
      ('5.1.12','Benefícios (VT, VR, Saúde, Cesta Básica) - Produção','CUS',250),
      ('5.1.13','Energia Elétrica - Produção','CUS',260),
      ('5.1.14','Manutenção de Máquinas e Equipamentos - Produção','CUS',270),
      ('5.1.15','Locação de Máquinas e Equipamentos - Produção','CUS',280),
      ('6.1.01','Salários e Ordenados','PES',290),
      ('6.1.02','Encargos Sociais (INSS/FGTS) - Administrativo','PES',300),
      ('6.1.03','Pró-Labore','PES',310),
      ('6.1.04','Benefícios (VT, VR, Saúde, Cesta Básica) - Administrativo','PES',320),
      ('6.1.05','Serviços Administrativos','PES',330),
      ('6.2.01','Honorários Contábeis','ADM',340),
      ('6.2.02','Copa, Cozinha e Limpeza','ADM',350),
      ('6.2.03','Aluguel e Condomínio','ADM',360),
      ('6.2.04','Energia Elétrica','ADM',370),
      ('6.2.05','Veículos e Combustíveis','ADM',380),
      ('6.2.06','Seguros','ADM',390),
      ('6.2.07','Software e Sistemas','ADM',400),
      ('6.2.08','Outras Despesas Administrativas','ADM',410),
      ('6.2.09','Manutenção Predial e Pequenas Obras','ADM',420),
      ('6.2.10','Manutenção de Equipamentos','ADM',430),
      ('6.2.11','Manutenção de Veículos','ADM',440),
      ('6.2.12','Material de Escritório e Expediente','ADM',450),
      ('6.2.13','Honorários Advocatícios - Consultivo','ADM',460),
      ('6.2.14','Telefonia e Internet','ADM',470),
      ('6.2.15','Plano de Saúde','ADM',480),
      ('6.2.16','Informática e Licenças','ADM',490),
      ('6.2.17','Água e Esgoto','ADM',500),
      ('6.2.18','Honorários Advocatícios - Contencioso (processos judiciais)','ADM',510),
      ('6.3.01','Comissões sobre Vendas','COM',520),
      ('6.3.02','Bonificações e Brindes','COM',530),
      ('6.3.03','Fretes sobre Vendas','COM',540),
      ('6.3.04','Marketing e Propaganda','COM',550),
      ('6.3.05','Despesas de Viagens','COM',560),
      ('6.4.01','Taxas Estaduais e Municipais','TRI',570),
      ('6.4.02','Outros Tributos e Contribuições','TRI',580),
      ('7.1.01','Receitas Financeiras','RFI',590),
      ('7.2.01','Juros e Multas Pagos','DFI',600),
      ('7.2.02','Tarifas Bancárias','DFI',610),
      ('7.2.03','Juros sobre Empréstimos e Financiamentos','DFI',620),
      ('7.2.04','Caixa - GIROCAIXA','CX',630),
      ('7.2.05','Caixa - Pronampe','CX',640),
      ('7.2.06','Sicredi - Empréstimo 2731383838','CX',650),
      ('7.2.07','Sicredi - CCB C43331588-8','CX',660),
      ('7.2.08','Sicredi - CCB C43331584-5','CX',670),
      ('7.2.09','Itaú - 2799395286','CX',680),
      ('7.2.10','Sicoob - BNDES 34161030','CX',690),
      ('7.2.11','Sicoob - CCB 2134815','CX',700),
      ('7.2.12','Sicoob - CCB 1991571','CX',710),
      ('7.2.13','Claratec - Sicredi BNDES C43320750-3','CX',720),
      ('7.2.14','Claratec - Sicredi Pronampe C43330717-6','CX',730),
      ('7.2.15','Juros - Itaú 2799395286','DFI',740),
      ('7.2.16','Juros - Sicoob BNDES 34161030','DFI',750),
      ('7.2.17','Juros - Sicoob CCB 2134815','DFI',760),
      ('7.2.18','Juros - Sicoob CCB 1991571','DFI',770),
      ('7.2.19','Juros - Claratec BNDES','DFI',780),
      ('7.2.20','Juros - Claratec Pronampe','DFI',790),
      ('7.2.21','Parcelamento - Samir (Ylusa)','CX',800),
      ('7.2.22','Parcelamento - Impostos','CX',810),
      ('7.2.23','Acordo Sicredi - renegociação judicial','CX',820),
      ('7.2.24','Outras Despesas Financeiras','DFI',830),
      ('7.2.25','Juros sobre Antecipações de Recebíveis','DFI',840),
      ('7.2.26','Impostos - PGFN transação (Mecânica Clara)','CX',850),
      ('7.2.27','Impostos - RFB / Simples parcelamento ordinário','CX',860),
      ('7.2.28','Impostos - Refis Bragança (LC 1.033/2026)','CX',870),
      ('7.2.29','Impostos - Acordo Paulista (ICMS)','CX',880),
      ('7.2.30','Impostos - pagamentos à vista (FGTS, consignado, ISS vencido)','CX',890),
      ('7.2.31','Impostos - RELP/PERT-SN em andamento','CX',900),
      ('7.2.32','Impostos - parcelas em atraso RELP/PERT-SN','CX',910),
      ('7.2.33','Acordo Sicoob - repactuação','CX',920),
      ('7.2.34','Acordo Fornecedores - parcelamento','CX',930),
      ('8.1.01','IRPJ','IR',940),
      ('8.1.02','CSLL','IR',950)
    ) x(codigo, nome, tipo, ordem)
  on conflict (org_id, grupo, codigo) do update set nome = excluded.nome, tipo = excluded.tipo, ordem = excluded.ordem;

  insert into public.gestao_classificacao (org_id, grupo, sigla, categoria, chave, linha, dfc)
  select v_org, 'Grupo Clara', case e when 'I' then 'INDUSTRIA' when 'C' then 'COMPANY' else 'CLARATEC' end,
         x.categoria, app.gestao_chave(x.categoria), x.linha, x.dfc
    from (values
('TCI','13º Salário','6.1.01',null),
('TCI','Adiantamento','6.1.01',null),
('TCI','Adiantamento a Fornecedores','NAO_DRE','operacional'),
('TCI','Adiantamento de Clientes','NAO_DRE','operacional'),
('TCI','Advogados','6.2.18',null),
('TCI','Água e Esgoto','6.2.17',null),
('TCI','Aluguel','6.2.03',null),
('TCI','Aluguel de Maquinas e Equipamentos','6.2.03',null),
('TCI','Antecipação de recebíveis - Apex','NAO_DRE','financiamento'),
('TC','Antecipação de Recebíveis - BEX','NAO_DRE','financiamento'),
('TCI','Antecipação de Recebíveis - Projeção','NAO_DRE','financiamento'),
('TCI','Antecipação de Recebíveis - Sicoob','NAO_DRE','financiamento'),
('T','Antecipação de Recebiveis - YLUSA','NAO_DRE','financiamento'),
('TC','Assessoria Juridica','6.2.13',null),
('TCI','Assistência Médica','6.1.04',null),
('TC','Auxilio Enfermidade','6.1.01',null),
('TCI','Aviso Previo','6.1.01',null),
('TCI','Bens Deduzidos como Despesa','6.2.08',null),
('T','Bonificações/Brindes','6.3.02',null),
('T','C/C Alessandra','NAO_DRE','financiamento'),
('T','C/C Alessandra (Retirada)','NAO_DRE','financiamento'),
('T','C/C Alessandra Borges','NAO_DRE','financiamento'),
('TI','C/C Socios','NAO_DRE','financiamento'),
('TCI','Cartão de Credito a Pagar','NAO_DRE','operacional'),
('TCI','Cesta Basica','6.1.04',null),
('TC','Clientes - Industrialização de Terceiros','3.2.02',null),
('TCI','Clientes - Produtos','3.1.01',null),
('TCI','Clientes - Revenda de Mercadoria','3.1.01',null),
('TCI','Clientes - Serviços Prestados','3.2.01',null),
('TCI','Clientes - Venda de Mercadoria Fabricadas','3.1.01',null),
('TCI','COFINS','NAO_DRE','operacional'),
('TCI','Combustivel e Lubrificantes','6.2.05',null),
('TCI','Comissões','6.3.01',null),
('T','Compra de Materia Prima - ST','5.1.01',null),
('TCI','Compra de Serviços','5.1.03',null),
('TCI','Compras de Materia Prima','5.1.01',null),
('TCI','Compras de Mercadorias para Revenda','5.1.01',null),
('TCI','Comunicação','NAO_DRE','investimento'),
('TCI','Condomínio','6.2.03',null),
('TCI','Conservação de Imoveis','6.2.09',null),
('T','CONSORCIO','NAO_DRE','financiamento'),
('TCI','Contribuição Social','8.1.02',null),
('TCI','Convenio Medico','6.1.04',null),
('TCI','Copa e Cozinha','6.2.02',null),
('TC','Custo com Locação','5.1.15',null),
('TCI','Desconto Obtido','7.1.01',null),
('TCI','Descontos Concedidos','7.2.24',null),
('TCI','Despesas de Viagens','6.3.05',null),
('T','Devolução de Venda de Produtos','4.1.07',null),
('TCI','Devoluções de Compra de Ativo','NAO_DRE','investimento'),
('TCI','Devoluções de Compra de Matéria Prima','5.1.09',null),
('TCI','Devoluções de Compra de Material de Consumo','5.1.09',null),
('TCI','Devoluções de Compra de Mercadoria de Revenda','5.1.09',null),
('TCI','Devoluções de Compra de Serviços','5.1.09',null),
('TCI','Devoluções de Vendas de Mercadoria','4.1.07',null),
('TCI','Devoluções de Vendas de Serviços Prestados','4.1.07',null),
('TCI','Dividendos Recebidos','7.1.01',null),
('TI','Empréstimo cartão de crédito','NAO_DRE','financiamento'),
('TI','Emprestimo Concedido Clara Company','NAO_DRE','grupo'),
('T','Empréstimo Concedido Claratec','NAO_DRE','grupo'),
('T','Emprestimo Concedido Industria Mecanica Clara','NAO_DRE','grupo'),
('TCI','Empréstimos Bancários','NAO_DRE','financiamento'),
('TCI','Energia Elétrica','6.2.04',null),
('TI','Energia Eletrica (Custos)','5.1.13',null),
('TCI','Equipamentos de Informática','NAO_DRE','investimento'),
('TCI','Estornos diversos','NAO_DRE','outros'),
('TCI','Exame Medico','6.1.04',null),
('TCI','Férias','6.1.01',null),
('TCI','Ferramentas','5.1.04',null),
('TCI','FGTS','6.1.02',null),
('TCI','FGTS Rescisorio','6.1.02',null),
('TCI','FGTS S/13o. Salario','6.1.02',null),
('TCI','FGTS S/Ferias','6.1.02',null),
('TCI','Frete','5.1.06',null),
('TCI','Fretes e Carretos','5.1.06',null),
('TCI','Honorarios Contabilidade','6.2.01',null),
('TCI','Horas Extras','6.1.01',null),
('TCI','ICMS','NAO_DRE','operacional'),
('TCI','ICMS S/Compra de Materia Prima - ST','5.1.01',null),
('TCI','ICMS S/Fretes','5.1.06',null),
('T','ICMS S/Industrialização','5.1.03',null),
('TCI','ICMS S/Industrialização de Terceiros','NAO_DRE','operacional'),
('TCI','ICMS S/Materia Prima e Material de Embalagem','5.1.08',null),
('TCI','ICMS S/Vendas de Mercadorias','NAO_DRE','operacional'),
('TCI','ICMS S/Vendas de Produtos','NAO_DRE','operacional'),
('TCI','Impostos e Taxas','6.4.02',null),
('TCI','Industrialização de Terceiros','5.1.03',null),
('TCI','INSS','6.1.02',null),
('TCI','Instalações','NAO_DRE','operacional'),
('TCI','Internet','6.2.14',null),
('TCI','IOF','7.2.03',null),
('TCI','IPI','NAO_DRE','operacional'),
('TCI','IPTU','6.4.01',null),
('TCI','IPVA','6.4.01',null),
('TCI','IRPJ','8.1.01',null),
('TCI','IRRF','6.1.01',null),
('TI','IRRF S/Aplicação Financeira','7.2.24',null),
('TCI','ISS','NAO_DRE','operacional'),
('TCI','Juros Ativos','7.1.01',null),
('TCI','Juros Pagos','7.2.01',null),
('TCI','Juros sobre Antecipações','7.2.25',null),
('TCI','Juros sobre Empréstimos','7.2.03',null),
('TCI','Limpeza e Conservação','6.2.02',null),
('TCI','Lubrificantes','5.1.04',null),
('TCI','Manutenção e Reparação','5.1.14',null),
('TCI','Manutenção e Reparo','6.2.09',null),
('TCI','Máquinas e Equipamentos','NAO_DRE','investimento'),
('TCI','Marketing','6.3.04',null),
('TC','Materia Prima para Industrialização','5.1.01',null),
('TCI','Materia Prima-Secundaria','5.1.02',null),
('TCI','Material de Consumo','5.1.04',null),
('TC','Material de Embalagem','5.1.08',null),
('TCI','Material de Expediente','6.2.12',null),
('TCI','Material Suprimento e Serv de Informatica','6.2.16',null),
('TCI','Móveis e Utensílios','NAO_DRE','investimento'),
('TCI','Multas e Juros de Mora','7.2.01',null),
('TCI','Outros Benefícios','6.1.04',null),
('TCI','Pagamento de Empréstimos','NAO_DRE','financiamento'),
('TCI','Pagamento em Duplicidade','NAO_DRE','operacional'),
('TCI','Pedagio','6.2.05',null),
('TCI','Pensão Alimentícia','6.1.01',null),
('T','Perdas','5.1.04',null),
('TCI','PIS','NAO_DRE','operacional'),
('TCI','Pro Labore','6.1.03',null),
('TC','Recebimento Devolução de Adiantamento de Fornecedor','NAO_DRE','operacional'),
('T','Recebimento devolução emprestimo Clara Company','NAO_DRE','grupo'),
('T','Recebimento Devolução Emprestimo Industria Mecanica Clara','NAO_DRE','grupo'),
('TI','Receitas Extraordinarias','3.3.01',null),
('TCI','Reembolso de Despesas','3.3.01',null),
('TCI','Reembolso de Pagamento em Duplicidade','NAO_DRE','operacional'),
('T','Reembolso de Prêmios de Seguros (Sinistro)','3.3.01',null),
('TC','Reembolso Prêmio de Seguro (Sinistro)','3.3.01',null),
('TCI','Rendimentos de Aplicações','7.1.01',null),
('TCI','Repasse de antecipação de recebíveis - Apex','NAO_DRE','financiamento'),
('TC','Repasse de antecipação de Recebíveis - BEX','NAO_DRE','financiamento'),
('TCI','Repasse de antecipação de Recebíveis - Projeção','NAO_DRE','financiamento'),
('TCI','Rescisões','6.1.01',null),
('TCI','Salários','6.1.01',null),
('TCI','Segurança e Monitoramento','6.2.08',null),
('TCI','Seguro de Vida','6.1.04',null),
('TCI','Seguros','6.2.06',null),
('TCI','Serviços Prestados - PJ','6.1.05',null),
('TCI','Simples Nacional (DAS)','NAO_DRE','operacional'),
('TCI','Simples Nacional - DAS','NAO_DRE','operacional'),
('TCI','Software','6.2.07',null),
('TCI','Tarifas Bancárias','7.2.02',null),
('TCI','Taxas Estaduais e Municipais','6.4.01',null),
('TCI','Telefonia','6.2.14',null),
('TCI','Uniformes','5.1.07',null),
('TCI','Vale Alimentação','6.1.04',null),
('TCI','Vale Refeição','6.1.04',null),
('TCI','Vale Transporte','6.1.04',null),
('TI','Veiculos','6.2.11',null),
('TCI','Venda de Ativos','NAO_DRE','investimento'),
('T','Viajens clientes/fornecedores','6.3.05',null),
('C','13o. Salario','6.1.01',null),
('C','Adiantamento de cliente baixa','NAO_DRE','operacional'),
('C','Antecipação de Recebíveis - Bankok','NAO_DRE','financiamento'),
('C','Antecipação de Recebiveis - Ylusa','NAO_DRE','financiamento'),
('CI','Bonificações','6.3.02',null),
('C','C/C Alessandra Borges Silveira','NAO_DRE','financiamento'),
('C','C/C Alex Borges','NAO_DRE','financiamento'),
('C','C/C Alex Borges (Retirada)','NAO_DRE','financiamento'),
('CI','C/C Alex Borges Silveira','NAO_DRE','financiamento'),
('C','C/C Clara Company Steel','NAO_DRE','grupo'),
('C','C/C Clara Steel','NAO_DRE','grupo'),
('C','C/C Sócios','NAO_DRE','financiamento'),
('CI','Compra Materia Prima - ST','5.1.01',null),
('C','CONSORCIOS DIVERSOS','NAO_DRE','financiamento'),
('C','Contas a Classificar','NAO_DRE','outros'),
('C','Cursos e Treinamento','6.2.08',null),
('CI','Devolução de Empréstimo','NAO_DRE','financiamento'),
('C','Devolução de Recebimento Indevido','NAO_DRE','operacional'),
('CI','Devolução de Vendas de Produtos','4.1.07',null),
('C','Devolução Empréstimo Industria Mecânica Clara','NAO_DRE','grupo'),
('C','Emprèstimo Claratec','NAO_DRE','grupo'),
('C','Empréstimo Concedido a Claratec','NAO_DRE','grupo'),
('C','Empréstimo Indústria Mecânica Clara','NAO_DRE','grupo'),
('C','Energia Eletrica (CUSTOS)','5.1.13',null),
('C','Financiamento Aymore','NAO_DRE','financiamento'),
('C','Financiamento Aymore - Fiat Strada','NAO_DRE','financiamento'),
('C','Financiamento Banco Bradesco - Jeep Renegade','NAO_DRE','financiamento'),
('C','Financiamento Banco RCI Brasil S.A','NAO_DRE','financiamento'),
('C','Financiamento Tracker','NAO_DRE','financiamento'),
('C','Impostos e Taxas Diversas','6.4.02',null),
('C','IRRF s/Aplicação Financeira','7.2.24',null),
('C','Recebimento Empréstimo Claratec','NAO_DRE','grupo'),
('C','Recebimento Empréstimo Industria Mecânica Clara','NAO_DRE','grupo'),
('C','Recebimento Indevido','NAO_DRE','operacional'),
('C','Receitas Extraordinárias','3.3.01',null),
('C','Repasse de antecipação Recebiveis - YLUSA','NAO_DRE','financiamento'),
('C','Resgate de aplicação','NAO_DRE','investimento'),
('CI','Simples Nacional (HELP)','7.2.22',null),
('CI','Simples Nacional (PERT)','7.2.22',null),
('C','Telefone (Internet Fibra)','6.2.14',null),
('C','Telefone (Vivo Telefonia)','6.2.14',null),
('C','Veículos','6.2.11',null),
('CI','Veículos (investimento)','NAO_DRE','investimento'),
('I','Antecipação de recebíveis - BEX','NAO_DRE','financiamento'),
('I','Antecipação de Recebíveis - Itaú','NAO_DRE','financiamento'),
('I','Antecipação de Recebíveis - Sicredi','NAO_DRE','financiamento'),
('I','Antecipação de Recebíveis - Ylusa','NAO_DRE','financiamento'),
('I','Assessoria e Consultoria','6.2.08',null),
('I','Assessoria JurIdica','6.2.13',null),
('I','C/C Antonia Ferreira','NAO_DRE','financiamento'),
('I','C/C Antonia Ferreira (Retirada)','NAO_DRE','financiamento'),
('I','C/C Diversos','NAO_DRE','financiamento'),
('I','C/C Emprestimo Claratec','NAO_DRE','grupo'),
('I','C/C Francisco Alves','NAO_DRE','financiamento'),
('I','C/C Francisco Alves (Retirada)','NAO_DRE','financiamento'),
('I','C/C Jose Eugeni','NAO_DRE','financiamento'),
('I','C/C Jose Eugeni (Retirada)','NAO_DRE','financiamento'),
('I','C/C Sócia Antonia Ferreira Borges','NAO_DRE','financiamento'),
('I','C/C Sócio Francisco','NAO_DRE','financiamento'),
('I','C/C Sócio Jose Eugeni Silveira','NAO_DRE','financiamento'),
('I','Clientes - Industria de Terceiros','3.2.02',null),
('I','CONFRATERNIZAÇÃO','6.2.08',null),
('I','Consórcios diversos','NAO_DRE','financiamento'),
('I','Cursos e Treinamentos','6.2.08',null),
('I','Custos com Locação','5.1.15',null),
('I','Despesas c/ Dedetetização','6.2.02',null),
('I','Devolução Emprestimo Claratec','NAO_DRE','grupo'),
('I','EMPRESTIMO A FUNCIONARIOS','NAO_DRE','operacional'),
('I','Empréstimo Clara Company','NAO_DRE','grupo'),
('I','FINANCIAMENTO CRETA AYMORE','NAO_DRE','financiamento'),
('I','Material de Embalegem','5.1.08',null),
('I','Meteria Prima para Industrialização','5.1.01',null),
('I','Previdência Caixa','6.1.04',null),
('I','Protestos','7.2.01',null),
('I','Recebimento de Restituição de Impostos','NAO_DRE','operacional'),
('I','Recebimento Devolução Emprestimo Clara Company','NAO_DRE','grupo'),
('I','Reembolso de Prêmio de Seguro (Sinistro)','3.3.01',null),
('I','Repasse de antecipação de recebíveis - BEX','NAO_DRE','financiamento'),
('I','Repasse de antecipação de Recebiveis  - Ylusa','NAO_DRE','financiamento')
    ) x(empresas, categoria, linha, dfc)
    cross join lateral regexp_split_to_table(x.empresas, '') e
  on conflict (org_id, grupo, sigla, chave) do nothing;
end $$;