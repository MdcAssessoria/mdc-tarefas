-- =====================================================================================================
--  096 · Módulos de cada empresa na licença (fluxo do Edvaldo, 19-20/11/2026)
--
--  O HUB é a origem: cadastra a empresa (CNPJ + Receita), a licença diz o sistema, o pacote e os usuários (um total
--  para o grupo) e a 095 diz quais empresas do grupo usam o sistema. Aqui a MDC escolhe, quando quiser, os módulos de
--  cada empresa (ex.: a ACB só com R&S). Sem escolha = todos os módulos do pacote da licença.
--  O EXato lê por lic_empresas e aplica em "Módulos por empresa" ao receber as empresas (EXato 082).
--
--   1  app.lic_modulos_do_contrato(contrato): módulos do pacote (mesma regra do lic_validar), sem o prefixo do sistema.
--   2  lic_contrato_empresa_modulos (contrato, cliente, modulos[]): só leitura pela API; grava a função 3.
--   3  lic_contrato_empresa_modulos_definir(contrato, cliente, modulos[]): licencas › operar, licença ativa, empresa da
--      licença (o cliente dela ou uma marcada na 095), módulos dentro do pacote; vazio ou o pacote inteiro = todos.
--   4  lic_contrato_modulos(contrato): módulos do pacote com o nome, para a tela (licencas › ver).
--   5  lic_contrato_empresas_definir: tirar a empresa da licença tira também a escolha de módulos dela.
--   6  lic_empresas: devolve os módulos do pacote e, em cada empresa, os módulos dela (null = todos).
--  Testes: supabase/testes/167_modulos_096.sql.
-- =====================================================================================================

-- ------------------------------------------------------------------------------------------- 1 módulos do pacote
create or replace function app.lic_modulos_do_contrato(p_contrato uuid)
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct regexp_replace(pr.slug, '^' || k.sistema || '-', '')
                            order by regexp_replace(pr.slug, '^' || k.sistema || '-', '')), '{}')
    from lic_contratos k
    join lic_produtos pr on pr.org_id = k.org_id and pr.sistema = k.sistema and pr.ativo
   where k.id = p_contrato
     and (k.modalidade = 'full' or exists (select 1 from lic_contrato_produtos cp where cp.contrato_id = k.id and cp.produto_id = pr.id));
$$;
revoke all on function app.lic_modulos_do_contrato(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------------------------------------- 2 tabela
create table if not exists public.lic_contrato_empresa_modulos (
  contrato_id uuid not null references public.lic_contratos(id) on delete restrict,
  cliente_id  uuid not null references public.clientes(id) on delete restrict,
  org_id      uuid not null references public.organizacoes(id) on delete cascade,
  modulos     text[] not null check (cardinality(modulos) > 0),
  por         uuid,
  alterado_em timestamptz not null default now(),
  primary key (contrato_id, cliente_id)
);
comment on table public.lic_contrato_empresa_modulos is
  'Módulos de uma empresa na licença quando não usa o pacote inteiro (096). Sem linha = todos os módulos do pacote.';
alter table public.lic_contrato_empresa_modulos enable row level security;
drop policy if exists lic_ver on public.lic_contrato_empresa_modulos;
create policy lic_ver on public.lic_contrato_empresa_modulos for select to authenticated
  using ((select app.hub_pode(org_id, 'licencas', 'ver')));
revoke insert, update, delete on public.lic_contrato_empresa_modulos from anon, authenticated;

-- ------------------------------------------------------------------------------------------- 3 definir
create or replace function public.lic_contrato_empresa_modulos_definir(p_contrato uuid, p_cliente uuid, p_modulos text[])
returns integer language plpgsql security definer set search_path = public as $$
declare v_k lic_contratos; v_pacote text[]; v_lista text[];
begin
  select * into v_k from lic_contratos where id = p_contrato;
  if v_k.id is null then raise exception 'Licença não encontrada'; end if;
  if not app.hub_pode(v_k.org_id, 'licencas', 'operar') then raise exception 'Sem permissão para mudar os módulos da empresa'; end if;
  if v_k.situacao <> 'ativo' then raise exception 'Licença encerrada não muda os módulos'; end if;
  if p_cliente is distinct from v_k.cliente_id
     and not exists (select 1 from lic_contrato_empresas e where e.contrato_id = v_k.id and e.cliente_id = p_cliente) then
    raise exception 'Esta empresa não está na licença: marque-a antes em Empresas no sistema';
  end if;
  v_pacote := app.lic_modulos_do_contrato(v_k.id);
  select coalesce(array_agg(distinct lower(trim(m)) order by lower(trim(m))), '{}') into v_lista
    from unnest(coalesce(p_modulos, '{}')) m where coalesce(trim(m), '') <> '';
  if exists (select 1 from unnest(v_lista) m where m <> all (v_pacote)) then
    raise exception 'Há módulo fora do pacote desta licença';
  end if;
  if cardinality(v_lista) = 0 or v_lista @> v_pacote then
    delete from lic_contrato_empresa_modulos where contrato_id = v_k.id and cliente_id = p_cliente;
    return cardinality(v_pacote);
  end if;
  insert into lic_contrato_empresa_modulos (contrato_id, cliente_id, org_id, modulos, por)
  values (v_k.id, p_cliente, v_k.org_id, v_lista, auth.uid())
  on conflict (contrato_id, cliente_id) do update set modulos = excluded.modulos, por = excluded.por, alterado_em = now();
  return cardinality(v_lista);
end $$;
revoke all on function public.lic_contrato_empresa_modulos_definir(uuid, uuid, text[]) from public, anon;
grant execute on function public.lic_contrato_empresa_modulos_definir(uuid, uuid, text[]) to authenticated;
comment on function public.lic_contrato_empresa_modulos_definir(uuid, uuid, text[]) is
  'Módulos de uma empresa da licença (licencas › operar); vazio ou o pacote inteiro = todos (096).';

-- ------------------------------------------------------------------------------------------- 4 pacote para a tela
create or replace function public.lic_contrato_modulos(p_contrato uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_k lic_contratos;
begin
  select * into v_k from lic_contratos where id = p_contrato;
  if v_k.id is null or not app.hub_pode(v_k.org_id, 'licencas', 'ver') then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('modulo', m, 'nome', coalesce(
             (select regexp_replace(pr.nome, '^[^·]*·\s*', '') from lic_produtos pr
               where pr.org_id = v_k.org_id and pr.sistema = v_k.sistema and pr.slug = v_k.sistema || '-' || m limit 1), m))
           order by m)
      from unnest(app.lic_modulos_do_contrato(v_k.id)) m), '[]'::jsonb);
end $$;
revoke all on function public.lic_contrato_modulos(uuid) from public, anon;
grant execute on function public.lic_contrato_modulos(uuid) to authenticated;

-- ------------------------------------------------------------------------------------------- 5 tirar empresa tira a escolha
create or replace function public.lic_contrato_empresas_definir(p_contrato uuid, p_clientes uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare v_k lic_contratos; v_lista uuid[]; v_n integer;
begin
  select * into v_k from lic_contratos where id = p_contrato;
  if v_k.id is null then raise exception 'Licença não encontrada'; end if;
  if not app.hub_pode(v_k.org_id, 'licencas', 'operar') then raise exception 'Sem permissão para mudar as empresas da licença'; end if;
  if v_k.situacao <> 'ativo' then raise exception 'Licença encerrada não muda as empresas'; end if;
  select coalesce(array_agg(distinct x), '{}') into v_lista
    from unnest(coalesce(p_clientes, '{}')) x where x is not null and x <> v_k.cliente_id;
  if cardinality(v_lista) > 200 then raise exception 'São muitas empresas numa licença (até 200)'; end if;
  if exists (select 1 from unnest(v_lista) x
              where not exists (select 1 from clientes c where c.id = x and c.org_id = v_k.org_id and c.ativo)) then
    raise exception 'Há empresa que não é cliente ativo desta organização';
  end if;
  delete from lic_contrato_empresa_modulos
   where contrato_id = v_k.id and cliente_id <> v_k.cliente_id and cliente_id <> all (v_lista);
  delete from lic_contrato_empresas where contrato_id = v_k.id and cliente_id <> all (v_lista);
  insert into lic_contrato_empresas (contrato_id, cliente_id, org_id, por)
  select v_k.id, x, v_k.org_id, auth.uid() from unnest(v_lista) x
  on conflict (contrato_id, cliente_id) do nothing;
  select count(*) into v_n from lic_contrato_empresas where contrato_id = v_k.id;
  return v_n;
end $$;

-- ------------------------------------------------------------------------------------------- 6 o sistema lê
create or replace function public.lic_empresas(p_sistema text, p_chave text, p_cnpj text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v lic_ledgra_chaves; v_cli clientes; v_hoje date; v_k lic_contratos;
begin
  v := app.lic_chave_achar(p_sistema, p_chave);
  if v.id is null then return jsonb_build_object('situacao', 'invalida'); end if;
  select * into v_cli from clientes where id = v.cliente_id;
  if regexp_replace(coalesce(v_cli.cnpj, ''), '\D', '', 'g') <> regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g') then
    return jsonb_build_object('situacao', 'cnpj_diferente');
  end if;
  if app.cliente_bloqueado(v.cliente_id) then return jsonb_build_object('situacao', 'bloqueada'); end if;
  v_hoje := app.hoje(v.org_id);
  select * into v_k from lic_contratos k
   where k.cliente_id = v.cliente_id and k.sistema = p_sistema and k.situacao = 'ativo'
     and k.inicio <= v_hoje and (k.fim is null or k.fim >= v_hoje)
   order by k.inicio desc limit 1;
  if v_k.id is null then return jsonb_build_object('situacao', 'sem_contrato'); end if;
  return jsonb_build_object('situacao', 'ativa', 'modulos', to_jsonb(app.lic_modulos_do_contrato(v_k.id)),
    'usuarios_incluidos', v_k.usuarios_incluidos, 'empresas', coalesce((
    select jsonb_agg(jsonb_build_object(
             'razao_social', c.razao_social, 'nome_fantasia', c.nome_fantasia,
             'cnpj', regexp_replace(coalesce(c.cnpj, ''), '\D', '', 'g'), 'regime', c.regime::text,
             'cidade', c.cidade, 'uf', c.uf, 'codigo_dominio', c.codigo_dominio,
             'da_licenca', c.id = v_k.cliente_id,
             'modulos', (select to_jsonb(em.modulos) from lic_contrato_empresa_modulos em
                          where em.contrato_id = v_k.id and em.cliente_id = c.id))
           order by c.id <> v_k.cliente_id, c.razao_social, c.cnpj)
      from clientes c
     where c.org_id = v_k.org_id and c.ativo
       and (c.id = v_k.cliente_id
            or exists (select 1 from lic_contrato_empresas e where e.contrato_id = v_k.id and e.cliente_id = c.id))), '[]'::jsonb));
end $$;
comment on function public.lic_empresas(text, text, text) is
  'Chamada pelo servidor do sistema com a chave da licença: chave + CNPJ → módulos do pacote, usuários e as empresas '
  '(o cliente da licença e as marcadas), cada uma com os módulos dela (null = todos) (095/096).';
