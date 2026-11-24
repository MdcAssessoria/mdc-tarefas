-- =====================================================================================================
--  116 · BI de Gestão › Projeção: estudo da DRE para os anos seguintes (pedido do Edvaldo, 23/11/2026)
--
--  O estudo parte do realizado do ano-base (Omie) e projeta até 5 anos por premissas: crescimento da receita,
--  inflação para as despesas e linhas que acompanham a receita (% da receita), com taxa e valor ajustáveis linha a
--  linha e ano a ano. O cálculo é da tela (regras puras em web/src/dominios/bi/projecao.ts, com teste); o banco guarda
--  o estudo e "provisiona": grava os anos projetados no orçamento (bi_orcamento_gravar, mês a mês pela sazonalidade
--  do ano-base), numa transação só, e marca quando e por quem.
--
--  bi_projecoes: vários estudos por empresa (cenários), nome único por empresa. Leitura = quem vê o BI da empresa;
--  gravação só por bi_projecao_salvar / bi_projecao_excluir / bi_projecao_provisionar (nível operar no BI).
-- =====================================================================================================

create table if not exists public.bi_projecoes (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id      uuid not null references public.clientes(id) on delete cascade,
  nome            text not null check (length(btrim(nome)) between 3 and 80),
  ano_base        int not null check (ano_base between 2000 and 2100),
  premissas       jsonb not null check (jsonb_typeof(premissas) = 'object'),
  provisionado_em timestamptz,
  provisionado_por uuid references auth.users(id) on delete set null,
  provisionado_anos int[],
  criado_por      uuid references auth.users(id) on delete set null default auth.uid(),
  criado_em       timestamptz not null default now(),
  atualizado_por  uuid references auth.users(id) on delete set null default auth.uid(),
  atualizado_em   timestamptz not null default now(),
  unique (cliente_id, nome)
);
create index if not exists bi_projecoes_cliente on public.bi_projecoes (cliente_id, atualizado_em desc);
comment on table public.bi_projecoes is
  'Estudo de projeção da DRE por empresa (116): ano-base + premissas (jsonb). Grava só por bi_projecao_* (operar no BI).';

alter table public.bi_projecoes enable row level security;
drop policy if exists bi_projecoes_ver on public.bi_projecoes;
create policy bi_projecoes_ver on public.bi_projecoes for select to authenticated using ((select app.bi_pode_ver(cliente_id)));
revoke all on public.bi_projecoes from anon, authenticated;
grant select on public.bi_projecoes to authenticated;

/** Grava o estudo (p_id nulo = novo). Devolve o id. */
create or replace function public.bi_projecao_salvar(p_id uuid, p_cliente uuid, p_nome text, p_ano_base int, p_premissas jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_id uuid; v_anos int; v_nome text := btrim(coalesce(p_nome, ''));
begin
  if auth.uid() is null then raise exception 'Faça login de novo.'; end if;
  select c.org_id into v_org from public.clientes c where c.id = p_cliente;
  if v_org is null or not app.bi_pode_lancar(p_cliente) then
    raise exception 'Você não tem permissão para gravar projeções desta empresa (nível operar no BI).';
  end if;
  if length(v_nome) < 3 or length(v_nome) > 80 then raise exception 'Dê um nome ao estudo (de 3 a 80 letras).'; end if;
  if p_ano_base is null or p_ano_base < 2000 or p_ano_base > 2100 then raise exception 'Ano-base inválido.'; end if;
  if p_premissas is null or jsonb_typeof(p_premissas) <> 'object' then raise exception 'Premissas inválidas.'; end if;
  if length(p_premissas::text) > 200000 then raise exception 'O estudo ficou grande demais para gravar.'; end if;
  v_anos := (p_premissas ->> 'anos')::int;
  if v_anos is null or v_anos < 1 or v_anos > 5 then raise exception 'O estudo projeta de 1 a 5 anos.'; end if;

  if p_id is null then
    insert into public.bi_projecoes (org_id, cliente_id, nome, ano_base, premissas)
    values (v_org, p_cliente, v_nome, p_ano_base, p_premissas)
    returning id into v_id;
  else
    update public.bi_projecoes
       set nome = v_nome, ano_base = p_ano_base, premissas = p_premissas, atualizado_por = auth.uid(), atualizado_em = now()
     where id = p_id and cliente_id = p_cliente
    returning id into v_id;
    if v_id is null then raise exception 'Estudo não encontrado nesta empresa.'; end if;
  end if;
  perform app.registrar(v_org, 'bi_gestao', 'salvar_projecao', v_id::text, null,
                        jsonb_build_object('nome', v_nome, 'ano_base', p_ano_base, 'anos', v_anos));
  return v_id;
exception
  when unique_violation then raise exception 'Já existe um estudo com este nome nesta empresa. Use outro nome.';
  when invalid_text_representation then raise exception 'Premissas inválidas.';
end $$;

create or replace function public.bi_projecao_excluir(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.bi_projecoes;
begin
  select * into r from public.bi_projecoes where id = p_id;
  if r.id is null then raise exception 'Estudo não encontrado.'; end if;
  if not app.bi_pode_lancar(r.cliente_id) then raise exception 'Você não tem permissão para excluir projeções desta empresa.'; end if;
  delete from public.bi_projecoes where id = p_id;
  perform app.registrar(r.org_id, 'bi_gestao', 'excluir_projecao', r.id::text, to_jsonb(r), null);
end $$;

/**
 * Provisiona: grava os anos projetados no orçamento da empresa (bi_orcamento_gravar, tudo ou nada) e marca o estudo.
 * p_linhas = [{cnpj, relatorio:'dre', linha, competencia, valor}] só da empresa do estudo e só dos anos depois do base.
 */
create or replace function public.bi_projecao_provisionar(p_id uuid, p_linhas jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.bi_projecoes; v_cnpj text; v_res jsonb; v_anos int[];
begin
  select * into r from public.bi_projecoes where id = p_id for update;
  if r.id is null then raise exception 'Estudo não encontrado. Grave o estudo antes de provisionar.'; end if;
  if not app.bi_pode_lancar(r.cliente_id) then raise exception 'Você não tem permissão para gravar o orçamento desta empresa.'; end if;
  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) = 0 then
    raise exception 'Nada para provisionar.';
  end if;
  select app.so_digitos(c.cnpj) into v_cnpj from public.clientes c where c.id = r.cliente_id;
  if v_cnpj is null or length(v_cnpj) <> 14 then raise exception 'A empresa do estudo não tem CNPJ cadastrado.'; end if;
  if exists (select 1 from jsonb_array_elements(p_linhas) e
              where coalesce(app.so_digitos(e ->> 'cnpj'), '') <> v_cnpj
                 or lower(coalesce(e ->> 'relatorio', '')) <> 'dre'
                 or coalesce(extract(year from (e ->> 'competencia')::date)::int, 0) not between r.ano_base + 1 and r.ano_base + 5) then
    raise exception 'O provisionamento só grava a DRE desta empresa nos anos depois de %.', r.ano_base;
  end if;
  select array_agg(distinct extract(year from (e ->> 'competencia')::date)::int order by extract(year from (e ->> 'competencia')::date)::int)
    into v_anos from jsonb_array_elements(p_linhas) e;
  v_res := public.bi_orcamento_gravar(p_linhas, 'Projeção: ' || r.nome);
  if coalesce((v_res ->> 'ok')::boolean, false) then
    update public.bi_projecoes set provisionado_em = now(), provisionado_por = auth.uid(), provisionado_anos = v_anos
     where id = p_id;
  end if;
  return v_res;
exception when invalid_datetime_format or datetime_field_overflow then
  raise exception 'Mês inválido no provisionamento.';
end $$;

revoke all on function public.bi_projecao_salvar(uuid, uuid, text, int, jsonb) from public, anon;
revoke all on function public.bi_projecao_excluir(uuid) from public, anon;
revoke all on function public.bi_projecao_provisionar(uuid, jsonb) from public, anon;
grant execute on function public.bi_projecao_salvar(uuid, uuid, text, int, jsonb) to authenticated;
grant execute on function public.bi_projecao_excluir(uuid) to authenticated;
grant execute on function public.bi_projecao_provisionar(uuid, jsonb) to authenticated;
