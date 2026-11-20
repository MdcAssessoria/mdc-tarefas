-- BI de Gestão: modelo bi_* e sincronização do Omie.
-- Aplicada direto em produção em 19/11/2026 como "090_bi_gestao_omie" (versão 20261119195249) e trazida ao repositório
-- em 20/11/2026 (ALT-02). Daqui para baixo, o texto é idêntico ao gravado em produção.

-- 090_bi_gestao_omie
-- BI de Gestão (Portal do Cliente): base da Omie sincronizada + lançamentos complementares (Excel/carga)
-- DRE = competência do faturamento (NF-e/NFS-e) e dos títulos; DFC = data do recebimento/pagamento.
-- Escrita das tabelas omie_* só pela Função Edge omie-sincronizar (service_role). Nada se apaga.

insert into public.hub_apps (slug, nome, descricao, icone, rota, status, ordem)
values ('bi_gestao', 'BI de Gestão', 'DRE e DFC gerenciais a partir do ERP do cliente (Omie) e lançamentos complementares', 'grafico', '/bi-gestao', 'ativo', 31)
on conflict (slug) do nothing;

create or replace function app.portal_perm_validas(p_org uuid, p_perm text[])
 returns text[] language plpgsql stable security definer set search_path to 'public' as $function$
declare v_ruins text; v_lista text[];
begin
  if p_perm is null or cardinality(p_perm) = 0 then raise exception 'Marque ao menos uma área do portal'; end if;
  select string_agg(x, ', ') into v_ruins from unnest(p_perm) x
   where x is null or x not in ('demonstrativos', 'rotinas', 'chat', 'documentos', 'societario', 'folha', 'financeiro', 'financeiro_ver',
                                'bi_gestao', 'bi_gestao_lancar');
  if v_ruins is not null then raise exception 'Permissão do portal desconhecida: %', coalesce(v_ruins, '(vazia)'); end if;
  if p_perm && array['financeiro', 'financeiro_ver'] and not app.hub_pode(p_org, 'financeiro', 'gerir') then
    raise exception 'Só quem gere o Financeiro (gerir) pode liberar o Financeiro no Portal';
  end if;
  select array_agg(distinct x order by x) into v_lista from unnest(p_perm) x
   where not (x = 'financeiro_ver' and 'financeiro' = any (p_perm));
  return v_lista;
end $function$;

create or replace function app.bi_pode_ver(p_cliente uuid) returns boolean
 language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from clientes c where c.id = p_cliente and app.hub_pode(c.org_id, 'bi_gestao', 'ver'))
      or app.portal_pode(p_cliente, 'bi_gestao')
$$;

create or replace function app.bi_pode_lancar(p_cliente uuid) returns boolean
 language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from clientes c where c.id = p_cliente and app.hub_pode(c.org_id, 'bi_gestao', 'operar'))
      or app.portal_pode(p_cliente, 'bi_gestao_lancar')
$$;

create table public.bi_grupos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id),
  nome text not null,
  eliminar_intragrupo boolean not null default true,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (org_id, nome)
);
comment on table public.bi_grupos is 'Grupos de empresas do mesmo dono para o BI consolidado (090). eliminar_intragrupo = tira do consolidado notas e títulos entre empresas do grupo.';

create table public.bi_grupo_empresas (
  grupo_id uuid not null references public.bi_grupos(id),
  cliente_id uuid not null references public.clientes(id),
  org_id uuid not null references public.organizacoes(id),
  primary key (grupo_id, cliente_id)
);
comment on table public.bi_grupo_empresas is 'Empresas de cada grupo do BI (090).';

create table public.omie_empresas (
  cliente_id uuid primary key references public.clientes(id),
  org_id uuid not null references public.organizacoes(id),
  credencial text not null check (credencial ~ '^[A-Z0-9_]{3,40}$'),
  ativo boolean not null default true,
  sincronizar_desde date not null default date '2025-01-01',
  carga_completa_feita boolean not null default false,
  pedido_em timestamptz,
  ultima_sync timestamptz,
  ultimo_ok timestamptz,
  ultimo_resultado text,
  criado_em timestamptz not null default now()
);
comment on table public.omie_empresas is 'Empresas ligadas à Omie (090). credencial = nome dos segredos da Função Edge: OMIE_<credencial>_KEY e OMIE_<credencial>_SECRET (cadastrados pelo administrador no painel do Supabase; nunca no banco).';

create table public.omie_execucoes (
  id bigint generated always as identity primary key,
  org_id uuid not null,
  cliente_id uuid not null references public.clientes(id),
  inicio timestamptz not null default now(),
  fim timestamptz,
  situacao text not null default 'rodando' check (situacao in ('rodando', 'ok', 'erro')),
  janela_de date,
  janela_ate date,
  contagem jsonb not null default '{}'::jsonb,
  erro text
);
comment on table public.omie_execucoes is 'Histórico de cada sincronização com a Omie (090).';

create table public.omie_categorias (
  cliente_id uuid not null references public.clientes(id),
  org_id uuid not null,
  codigo text not null,
  descricao text,
  categoria_superior text,
  conta_receita boolean,
  conta_despesa boolean,
  totalizadora boolean,
  inativa boolean,
  dados jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  primary key (cliente_id, codigo)
);
comment on table public.omie_categorias is 'Plano de categorias de cada empresa na Omie (090).';

create table public.omie_notas (
  cliente_id uuid not null references public.clientes(id),
  org_id uuid not null,
  modelo text not null check (modelo in ('nfe', 'nfse')),
  id_omie text not null,
  numero text,
  serie text,
  chave text,
  emissao date,
  tipo text check (tipo in ('saida', 'entrada')),
  situacao text not null default 'autorizada' check (situacao in ('autorizada', 'cancelada', 'denegada', 'outra')),
  cnpj_cpf_dest text,
  nome_dest text,
  valor_total numeric(15,2) not null default 0,
  valor_produtos numeric(15,2) not null default 0,
  valor_servicos numeric(15,2) not null default 0,
  valor_desconto numeric(15,2) not null default 0,
  icms numeric(15,2) not null default 0,
  icms_st numeric(15,2) not null default 0,
  ipi numeric(15,2) not null default 0,
  pis numeric(15,2) not null default 0,
  cofins numeric(15,2) not null default 0,
  iss numeric(15,2) not null default 0,
  dados jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  primary key (cliente_id, modelo, id_omie)
);
create index omie_notas_emissao on public.omie_notas (cliente_id, emissao);
comment on table public.omie_notas is 'NF-e e NFS-e emitidas pela empresa na Omie (090). Base da receita da DRE (competência = mês de emissão).';

create table public.omie_nota_cfops (
  cliente_id uuid not null,
  modelo text not null,
  id_omie text not null,
  cfop text not null,
  valor numeric(15,2) not null default 0,
  primary key (cliente_id, modelo, id_omie, cfop),
  foreign key (cliente_id, modelo, id_omie) references public.omie_notas (cliente_id, modelo, id_omie)
);
comment on table public.omie_nota_cfops is 'Valor de cada nota por CFOP (soma dos itens, líquido de desconto) (090). NFS-e entra como CFOP "SERV".';

create table public.omie_movimentos (
  cliente_id uuid not null references public.clientes(id),
  org_id uuid not null,
  chave text not null,
  codigo_titulo text not null,
  natureza text not null check (natureza in ('R', 'P')),
  categoria_codigo text,
  documento text,
  cnpj_cpf text,
  nome text,
  conta_corrente text,
  status text,
  emissao date,
  registro date,
  vencimento date,
  pagamento date,
  valor_documento numeric(15,2) not null default 0,
  valor_pago numeric(15,2) not null default 0,
  dados jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  primary key (cliente_id, chave)
);
create index omie_mov_emissao on public.omie_movimentos (cliente_id, emissao);
create index omie_mov_pagamento on public.omie_movimentos (cliente_id, pagamento);
comment on table public.omie_movimentos is 'Contas a receber (R) e a pagar (P) da Omie, uma linha por título × categoria do rateio (090). DRE pela emissão; DFC pela data de pagamento.';

create table public.bi_linhas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizacoes(id),
  relatorio text not null check (relatorio in ('dre', 'dfc')),
  codigo text not null check (codigo ~ '^[a-z0-9_]{2,40}$'),
  nome text not null,
  ordem integer not null,
  natureza text check (natureza in ('R', 'P')),
  soma text[],
  ativo boolean not null default true
);
create unique index bi_linhas_unica on public.bi_linhas (coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid), relatorio, codigo);
comment on table public.bi_linhas is 'Linhas da DRE e da DFC gerenciais (090). org_id nulo = padrão MDC. natureza R = entrada (+), P = saída (−); soma preenchido = subtotal das linhas listadas.';

create table public.bi_mapa_categorias (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id),
  cliente_id uuid references public.clientes(id),
  prefixo text not null,
  linha_dre text,
  entra_dre boolean not null default true,
  linha_dfc text,
  entra_dfc boolean not null default true,
  atualizado_em timestamptz not null default now()
);
create unique index bi_mapa_unico on public.bi_mapa_categorias (org_id, coalesce(cliente_id, '00000000-0000-0000-0000-000000000000'::uuid), prefixo);
comment on table public.bi_mapa_categorias is 'Categoria da Omie → linha da DRE/DFC por prefixo do código (vale o prefixo mais longo; regra da empresa antes da regra geral) (090). Despesa sem regra cai em "Não classificado"; receita de título sem regra não entra na DRE (a receita vem das notas).';

create table public.bi_cfop_regras (
  cfop text primary key check (cfop ~ '^([1-7][0-9]{3}|SERV)$'),
  linha_dre text not null,
  observacao text
);
comment on table public.bi_cfop_regras is 'CFOPs que formam a receita bruta (ou devoluções) da DRE (090). CFOP fora da lista (remessas, retornos, transferências) não entra.';

create table public.bi_complementar_lotes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id),
  arquivo_nome text,
  origem text not null default 'excel' check (origem in ('excel', 'manual', 'carga')),
  linhas integer not null default 0,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);
comment on table public.bi_complementar_lotes is 'Cada carga de lançamentos complementares do BI (090).';

create table public.bi_complementares (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizacoes(id),
  cliente_id uuid not null references public.clientes(id),
  lote_id uuid references public.bi_complementar_lotes(id),
  competencia date not null check (competencia = date_trunc('month', competencia)::date),
  data_caixa date,
  linha_dre text,
  linha_dfc text,
  historico text not null,
  valor numeric(15,2) not null check (valor <> 0),
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  cancelado_em timestamptz,
  cancelado_por uuid,
  motivo_cancelamento text,
  check (linha_dre is not null or linha_dfc is not null),
  check (linha_dfc is null or data_caixa is not null)
);
create index bi_comp_cliente on public.bi_complementares (cliente_id, competencia);
comment on table public.bi_complementares is 'Lançamentos que não estão na Omie (provisões, ajustes, despesas fora do ERP) (090). valor positivo = no sentido da linha; negativo = ajuste contra. DRE pela competência, DFC pela data_caixa. Cancelar marca, não apaga.';

create trigger bi_comp_sem_apagar before delete on public.bi_complementares for each row execute function app.tg_nada_se_apaga('lançamento complementar: cancele com motivo');
create trigger omie_notas_sem_apagar before delete on public.omie_notas for each row execute function app.tg_nada_se_apaga('nota da Omie');
create trigger omie_mov_sem_apagar before delete on public.omie_movimentos for each row execute function app.tg_nada_se_apaga('título da Omie');

alter table public.bi_grupos enable row level security;
alter table public.bi_grupo_empresas enable row level security;
alter table public.omie_empresas enable row level security;
alter table public.omie_execucoes enable row level security;
alter table public.omie_categorias enable row level security;
alter table public.omie_notas enable row level security;
alter table public.omie_nota_cfops enable row level security;
alter table public.omie_movimentos enable row level security;
alter table public.bi_linhas enable row level security;
alter table public.bi_mapa_categorias enable row level security;
alter table public.bi_cfop_regras enable row level security;
alter table public.bi_complementar_lotes enable row level security;
alter table public.bi_complementares enable row level security;

create policy bi_grupos_ver on public.bi_grupos for select using (
  app.hub_pode(org_id, 'bi_gestao', 'ver')
  or exists (select 1 from bi_grupo_empresas g where g.grupo_id = bi_grupos.id and app.portal_pode(g.cliente_id, 'bi_gestao')));
create policy bi_grupos_gerir on public.bi_grupos for all using (app.hub_pode(org_id, 'bi_gestao', 'gerir')) with check (app.hub_pode(org_id, 'bi_gestao', 'gerir'));
create policy bi_grupo_emp_ver on public.bi_grupo_empresas for select using (app.bi_pode_ver(cliente_id));
create policy bi_grupo_emp_gerir on public.bi_grupo_empresas for all using (app.hub_pode(org_id, 'bi_gestao', 'gerir'))
  with check (app.hub_pode(org_id, 'bi_gestao', 'gerir') and app.cliente_da_org(cliente_id, org_id));

create policy omie_emp_ver on public.omie_empresas for select using (app.bi_pode_ver(cliente_id));
create policy omie_emp_gerir on public.omie_empresas for all using (app.papel(org_id) = 'admin')
  with check (app.papel(org_id) = 'admin' and app.cliente_da_org(cliente_id, org_id));
create policy omie_exec_ver on public.omie_execucoes for select using (app.hub_pode(org_id, 'bi_gestao', 'ver'));
create policy omie_cat_ver on public.omie_categorias for select using (app.bi_pode_ver(cliente_id));
create policy omie_notas_ver on public.omie_notas for select using (app.bi_pode_ver(cliente_id));
create policy omie_cfops_ver on public.omie_nota_cfops for select using (app.bi_pode_ver(cliente_id));
create policy omie_mov_ver on public.omie_movimentos for select using (app.bi_pode_ver(cliente_id));

create policy bi_linhas_ver on public.bi_linhas for select using (auth.uid() is not null);
create policy bi_linhas_gerir on public.bi_linhas for all using (org_id is not null and app.hub_pode(org_id, 'bi_gestao', 'gerir'))
  with check (org_id is not null and app.hub_pode(org_id, 'bi_gestao', 'gerir'));
create policy bi_mapa_ver on public.bi_mapa_categorias for select using (app.hub_pode(org_id, 'bi_gestao', 'ver') or (cliente_id is not null and app.portal_pode(cliente_id, 'bi_gestao')));
create policy bi_mapa_gerir on public.bi_mapa_categorias for all using (app.hub_pode(org_id, 'bi_gestao', 'operar'))
  with check (app.hub_pode(org_id, 'bi_gestao', 'operar') and (cliente_id is null or app.cliente_da_org(cliente_id, org_id)));
create policy bi_cfop_ver on public.bi_cfop_regras for select using (auth.uid() is not null);

create policy bi_lotes_ver on public.bi_complementar_lotes for select using (
  app.hub_pode(org_id, 'bi_gestao', 'ver') or criado_por = auth.uid());
create policy bi_comp_ver on public.bi_complementares for select using (app.bi_pode_ver(cliente_id));

create or replace function public.bi_complementar_importar(p_arquivo text, p_linhas jsonb, p_origem text default 'excel')
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_org uuid; v_lote uuid; r jsonb; i int := 0; v_cli uuid; v_cnpj text; v_comp date; v_caixa date;
  v_dre text; v_dfc text; v_valor numeric; v_hist text; v_erros text[] := '{}'; v_ok int := 0;
begin
  if auth.uid() is null then raise exception 'Faça login de novo.'; end if;
  if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) = 0 then raise exception 'A planilha está vazia.'; end if;
  if jsonb_array_length(p_linhas) > 5000 then raise exception 'Máximo de 5.000 linhas por carga.'; end if;
  if p_origem not in ('excel', 'manual', 'carga') then raise exception 'Origem inválida.'; end if;

  for r in select * from jsonb_array_elements(p_linhas) loop
    i := i + 1;
    begin
      v_cnpj := app.so_digitos(r->>'cnpj');
      select c.id, c.org_id into v_cli, v_org from clientes c
       where app.so_digitos(c.cnpj) = v_cnpj and app.bi_pode_lancar(c.id) limit 1;
      if v_cli is null then raise exception 'empresa % não encontrada ou sem permissão', coalesce(r->>'cnpj', '(vazio)'); end if;
      v_comp := date_trunc('month', (r->>'competencia')::date)::date;
      v_caixa := nullif(r->>'data_caixa', '')::date;
      v_dre := nullif(trim(r->>'linha_dre'), ''); v_dfc := nullif(trim(r->>'linha_dfc'), '');
      v_valor := round((r->>'valor')::numeric, 2);
      v_hist := nullif(trim(r->>'historico'), '');
      if v_dre is null and v_dfc is null then raise exception 'informe a linha da DRE e/ou da DFC'; end if;
      if v_dre is not null and not exists (select 1 from bi_linhas l where l.relatorio = 'dre' and l.codigo = v_dre and l.soma is null and l.ativo and (l.org_id is null or l.org_id = v_org)) then
        raise exception 'linha da DRE "%" não existe ou é subtotal', v_dre; end if;
      if v_dfc is not null and not exists (select 1 from bi_linhas l where l.relatorio = 'dfc' and l.codigo = v_dfc and l.soma is null and l.ativo and (l.org_id is null or l.org_id = v_org)) then
        raise exception 'linha da DFC "%" não existe ou é subtotal', v_dfc; end if;
      if v_dfc is not null and v_caixa is null then raise exception 'lançamento de DFC precisa da data do caixa'; end if;
      if v_valor is null or v_valor = 0 then raise exception 'valor vazio ou zero'; end if;
      if v_hist is null then raise exception 'histórico vazio'; end if;
    exception when others then
      v_erros := v_erros || format('Linha %s: %s', i + 1, sqlerrm);
    end;
  end loop;
  if cardinality(v_erros) > 0 then
    return jsonb_build_object('ok', false, 'erros', to_jsonb(v_erros[1:50]), 'total_erros', cardinality(v_erros));
  end if;

  select c.org_id into v_org from clientes c where app.so_digitos(c.cnpj) = app.so_digitos(p_linhas->0->>'cnpj') limit 1;
  insert into bi_complementar_lotes (org_id, arquivo_nome, origem, linhas)
  values (v_org, left(p_arquivo, 200), p_origem, jsonb_array_length(p_linhas)) returning id into v_lote;
  for r in select * from jsonb_array_elements(p_linhas) loop
    select c.id, c.org_id into v_cli, v_org from clientes c
     where app.so_digitos(c.cnpj) = app.so_digitos(r->>'cnpj') and app.bi_pode_lancar(c.id) limit 1;
    insert into bi_complementares (org_id, cliente_id, lote_id, competencia, data_caixa, linha_dre, linha_dfc, historico, valor)
    values (v_org, v_cli, v_lote, date_trunc('month', (r->>'competencia')::date)::date, nullif(r->>'data_caixa', '')::date,
            nullif(trim(r->>'linha_dre'), ''), nullif(trim(r->>'linha_dfc'), ''), left(trim(r->>'historico'), 500),
            round((r->>'valor')::numeric, 2));
    v_ok := v_ok + 1;
  end loop;
  perform app.registrar(v_org, 'bi_gestao', 'importar_complementares', v_lote::text, null, jsonb_build_object('arquivo', p_arquivo, 'linhas', v_ok));
  return jsonb_build_object('ok', true, 'lote', v_lote, 'linhas', v_ok);
end $$;

create or replace function public.bi_complementar_cancelar(p_id bigint, p_motivo text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v bi_complementares;
begin
  select * into v from bi_complementares where id = p_id for update;
  if v.id is null or not app.bi_pode_lancar(v.cliente_id) then raise exception 'Lançamento não encontrado.'; end if;
  if v.cancelado_em is not null then raise exception 'Este lançamento já está cancelado.'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo do cancelamento.'; end if;
  update bi_complementares set cancelado_em = now(), cancelado_por = auth.uid(), motivo_cancelamento = left(trim(p_motivo), 300) where id = p_id;
  perform app.registrar(v.org_id, 'bi_gestao', 'cancelar_complementar', p_id::text, to_jsonb(v), jsonb_build_object('motivo', p_motivo));
end $$;

create or replace function public.bi_complementar_cancelar_lote(p_lote uuid, p_motivo text)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare v_qtd int := 0; v_id bigint;
begin
  for v_id in select id from bi_complementares where lote_id = p_lote and cancelado_em is null loop
    perform bi_complementar_cancelar(v_id, p_motivo); v_qtd := v_qtd + 1;
  end loop;
  if v_qtd = 0 then raise exception 'Nada a cancelar neste lote.'; end if;
  return v_qtd;
end $$;

create or replace function public.omie_pedir_sincronizacao(p_cliente uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not exists (select 1 from omie_empresas e where e.cliente_id = p_cliente and e.ativo
                  and app.hub_pode(e.org_id, 'bi_gestao', 'operar')) then
    raise exception 'Empresa não ligada à Omie ou sem permissão.';
  end if;
  update omie_empresas set pedido_em = now() where cliente_id = p_cliente;
end $$;

create or replace function public.omie_token_confere(p_token text) returns boolean
 language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'omie_sync_token' and decrypted_secret = p_token)
$$;

create or replace function public.bi_relatorio(p_relatorio text, p_clientes uuid[], p_inicio date, p_fim date, p_eliminar boolean default true)
returns table (codigo text, nome text, ordem integer, subtotal boolean, natureza text, competencia date, valor numeric)
language plpgsql stable security invoker set search_path to 'public' as $$
#variable_conflict use_column
declare v_org uuid; v_cnpjs text[]; v_elim boolean;
begin
  if p_relatorio not in ('dre', 'dfc') then raise exception 'Relatório inválido.'; end if;
  if p_inicio is null or p_fim is null or p_fim < p_inicio then raise exception 'Período inválido.'; end if;
  if p_fim - p_inicio > 1100 then raise exception 'Período máximo de 3 anos.'; end if;
  select c.org_id into v_org from clientes c where c.id = any (p_clientes) and app.bi_pode_ver(c.id) limit 1;
  if v_org is null then raise exception 'Sem acesso às empresas informadas.'; end if;
  select array_agg(app.so_digitos(c.cnpj)) into v_cnpjs from clientes c where c.id = any (p_clientes);
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
       and not (v_elim and app.so_digitos(m.cnpj_cpf) = any (v_cnpjs))
  ),
  base as (
    select r.linha_dre as linha, date_trunc('month', n.emissao)::date as comp, c.valor as v, null::text as nat_mov
      from omie_notas n
      join omie_nota_cfops c using (cliente_id, modelo, id_omie)
      join bi_cfop_regras r on r.cfop = c.cfop
     where p_relatorio = 'dre' and n.cliente_id = any (p_clientes) and n.situacao = 'autorizada'
       and n.emissao between p_inicio and p_fim
       and not (v_elim and app.so_digitos(n.cnpj_cpf_dest) = any (v_cnpjs))
    union all
    select 'deducoes', date_trunc('month', n.emissao)::date, (n.icms + n.pis + n.cofins + n.iss), null
      from omie_notas n
     where p_relatorio = 'dre' and n.cliente_id = any (p_clientes) and n.situacao = 'autorizada'
       and n.emissao between p_inicio and p_fim
       and exists (select 1 from omie_nota_cfops c join bi_cfop_regras r on r.cfop = c.cfop and r.linha_dre = 'receita_bruta'
                    where c.cliente_id = n.cliente_id and c.modelo = n.modelo and c.id_omie = n.id_omie)
       and not (v_elim and app.so_digitos(n.cnpj_cpf_dest) = any (v_cnpjs))
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

revoke all on function public.bi_complementar_importar(text, jsonb, text) from public, anon;
revoke all on function public.bi_complementar_cancelar(bigint, text) from public, anon;
revoke all on function public.bi_complementar_cancelar_lote(uuid, text) from public, anon;
revoke all on function public.omie_pedir_sincronizacao(uuid) from public, anon;
revoke all on function public.bi_relatorio(text, uuid[], date, date, boolean) from public, anon;
revoke all on function public.omie_token_confere(text) from public, anon, authenticated;
grant execute on function public.bi_complementar_importar(text, jsonb, text) to authenticated;
grant execute on function public.bi_complementar_cancelar(bigint, text) to authenticated;
grant execute on function public.bi_complementar_cancelar_lote(uuid, text) to authenticated;
grant execute on function public.omie_pedir_sincronizacao(uuid) to authenticated;
grant execute on function public.bi_relatorio(text, uuid[], date, date, boolean) to authenticated;
grant execute on function public.omie_token_confere(text) to service_role;
revoke all on function app.bi_pode_ver(uuid) from public, anon;
revoke all on function app.bi_pode_lancar(uuid) from public, anon;
grant execute on function app.bi_pode_ver(uuid) to authenticated, service_role;
grant execute on function app.bi_pode_lancar(uuid) to authenticated, service_role;
revoke insert, update, delete on public.omie_empresas, public.omie_execucoes, public.omie_categorias, public.omie_notas,
  public.omie_nota_cfops, public.omie_movimentos, public.bi_cfop_regras, public.bi_complementares, public.bi_complementar_lotes from anon, authenticated;
grant insert, update on public.omie_empresas to authenticated;

insert into public.bi_linhas (org_id, relatorio, codigo, nome, ordem, natureza, soma) values
 (null, 'dre', 'receita_bruta', 'Receita bruta de vendas e serviços', 10, 'R', null),
 (null, 'dre', 'devolucoes', '(−) Devoluções de vendas', 20, 'P', null),
 (null, 'dre', 'deducoes', '(−) Impostos sobre o faturamento', 30, 'P', null),
 (null, 'dre', 'receita_liquida', 'Receita líquida', 40, null, array['receita_bruta', 'devolucoes', 'deducoes']),
 (null, 'dre', 'custos', '(−) Custo dos produtos e serviços', 50, 'P', null),
 (null, 'dre', 'lucro_bruto', 'Lucro bruto', 60, null, array['receita_liquida', 'custos']),
 (null, 'dre', 'despesas_pessoal', '(−) Despesas com pessoal', 70, 'P', null),
 (null, 'dre', 'despesas_administrativas', '(−) Despesas administrativas', 80, 'P', null),
 (null, 'dre', 'despesas_comerciais', '(−) Despesas comerciais', 90, 'P', null),
 (null, 'dre', 'outras_receitas', 'Outras receitas operacionais', 100, 'R', null),
 (null, 'dre', 'nao_classificado', 'Não classificado (conferir categoria)', 105, null, null),
 (null, 'dre', 'resultado_operacional', 'Resultado operacional', 110, null, array['lucro_bruto', 'despesas_pessoal', 'despesas_administrativas', 'despesas_comerciais', 'outras_receitas', 'nao_classificado']),
 (null, 'dre', 'receitas_financeiras', 'Receitas financeiras', 120, 'R', null),
 (null, 'dre', 'despesas_financeiras', '(−) Despesas financeiras', 130, 'P', null),
 (null, 'dre', 'resultado_antes_ir', 'Resultado antes do IRPJ e da CSLL', 140, null, array['resultado_operacional', 'receitas_financeiras', 'despesas_financeiras']),
 (null, 'dre', 'irpj_csll', '(−) IRPJ e CSLL', 150, 'P', null),
 (null, 'dre', 'resultado_liquido', 'Resultado líquido', 160, null, array['resultado_antes_ir', 'irpj_csll']),
 (null, 'dfc', 'rec_clientes', 'Recebimentos de clientes', 10, 'R', null),
 (null, 'dfc', 'outros_recebimentos', 'Outros recebimentos', 20, 'R', null),
 (null, 'dfc', 'pag_fornecedores', '(−) Pagamentos a fornecedores', 30, 'P', null),
 (null, 'dfc', 'pag_pessoal', '(−) Pagamentos de pessoal', 40, 'P', null),
 (null, 'dfc', 'pag_impostos', '(−) Pagamentos de impostos', 50, 'P', null),
 (null, 'dfc', 'pag_despesas', '(−) Pagamentos de despesas operacionais', 60, 'P', null),
 (null, 'dfc', 'fluxo_operacional', 'Caixa das operações', 70, null, array['rec_clientes', 'outros_recebimentos', 'pag_fornecedores', 'pag_pessoal', 'pag_impostos', 'pag_despesas']),
 (null, 'dfc', 'investimentos', 'Investimentos (máquinas, equipamentos, imóveis)', 80, null, null),
 (null, 'dfc', 'financiamentos', 'Empréstimos e financiamentos', 90, null, null),
 (null, 'dfc', 'socios', 'Retiradas e aportes de sócios', 100, null, null),
 (null, 'dfc', 'nao_classificado', 'Não classificado (conferir categoria)', 105, null, null),
 (null, 'dfc', 'variacao_caixa', 'Variação do caixa no período', 110, null, array['fluxo_operacional', 'investimentos', 'financiamentos', 'socios', 'nao_classificado']);

insert into public.bi_cfop_regras (cfop, linha_dre, observacao)
select d || s, 'receita_bruta', 'venda/industrialização/serviço'
  from unnest(array['5', '6', '7']) d,
       unnest(array['101', '102', '103', '104', '105', '106', '107', '108', '109', '110', '111', '113', '114', '115', '116', '117', '118', '119', '120', '122', '123', '124', '125', '401', '402', '403', '404', '405', '933']) s
 where not (d = '7' and s in ('103', '104', '107', '108', '109', '110', '111', '113', '114', '115', '116', '117', '118', '119', '120', '122', '123', '124', '125', '401', '402', '403', '404', '405'))
on conflict do nothing;
insert into public.bi_cfop_regras (cfop, linha_dre, observacao)
select d || s, 'devolucoes', 'devolução de venda'
  from unnest(array['1', '2', '3']) d, unnest(array['201', '202', '203', '204', '410', '411']) s
on conflict do nothing;
insert into public.bi_cfop_regras (cfop, linha_dre, observacao) values ('SERV', 'receita_bruta', 'NFS-e (serviços)') on conflict do nothing;

do $$
declare v_org uuid; v_grupo uuid;
begin
  select org_id into v_org from clientes where app.so_digitos(cnpj) = '14012035000155';
  if v_org is null then return; end if;
  insert into bi_grupos (org_id, nome) values (v_org, 'Grupo Clara') on conflict (org_id, nome) do update set nome = excluded.nome returning id into v_grupo;
  insert into bi_grupo_empresas (grupo_id, cliente_id, org_id)
  select v_grupo, c.id, v_org from clientes c where app.so_digitos(c.cnpj) in ('14012035000155', '55462907000164', '47755820000157')
  on conflict do nothing;
  insert into omie_empresas (cliente_id, org_id, credencial)
  select c.id, v_org, case app.so_digitos(c.cnpj) when '14012035000155' then 'CLARA_COMPANY'
                                                  when '55462907000164' then 'MECANICA_CLARA'
                                                  else 'CLARATEC' end
    from clientes c where app.so_digitos(c.cnpj) in ('14012035000155', '55462907000164', '47755820000157')
  on conflict do nothing;
  insert into bi_mapa_categorias (org_id, prefixo, linha_dre, entra_dre, linha_dfc) values
   (v_org, '1', null, false, 'rec_clientes'),
   (v_org, '2', null, true, 'pag_despesas')
  on conflict do nothing;
end $$;
