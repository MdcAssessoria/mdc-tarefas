-- =====================================================================================================
--  095 · Empresas que usam o sistema em cada licença (pedido do Edvaldo, 19/11/2026)
--
--  A licença é de UM cliente (o CNPJ que confere a chave), mas o EXato atende o grupo inteiro (ex.: EXRH, TEAM
--  Leasing, ACB…). Aqui a MDC marca, em cada licença, as empresas do cadastro de clientes que vão usar aquele sistema.
--  O EXato, na tela "Nova empresa", traz do HUB SÓ essas empresas (nunca a carteira da MDC).
--
--   1  lic_contrato_empresas (contrato, cliente): empresas além do próprio cliente da licença. Sem escrita direta.
--   2  lic_contrato_empresas_definir(contrato, clientes[]): troca a lista inteira (licencas › operar), licença ativa,
--      só clientes ativos da mesma organização; o cliente da própria licença não precisa entrar (já vale sempre).
--   3  lic_empresas(sistema, chave, cnpj): chamada pelo SERVIDOR do sistema com a chave da licença (igual a
--      lic_validar). Chave + CNPJ conferidos e licença ativa → o cliente da licença + as empresas marcadas, só os campos
--      do cadastro (razão, fantasia, CNPJ, regime, cidade, UF, código do Domínio). Sem chave válida: nada.
--  Testes: supabase/testes/166_empresas_095.sql (base em 159_base_088.sql e 11_dados_licencas.sql).
-- =====================================================================================================

-- ------------------------------------------------------------------------------------------- 1 tabela
create table if not exists public.lic_contrato_empresas (
  contrato_id uuid not null references public.lic_contratos(id) on delete restrict,
  cliente_id  uuid not null references public.clientes(id) on delete restrict,
  org_id      uuid not null references public.organizacoes(id) on delete cascade,
  por         uuid,
  criado_em   timestamptz not null default now(),
  primary key (contrato_id, cliente_id)
);
create index if not exists lic_contrato_empresas_cliente on public.lic_contrato_empresas (cliente_id);
comment on table public.lic_contrato_empresas is
  'Empresas (clientes) que usam o sistema da licença além do próprio cliente dela; o sistema traz só estas (095).';

alter table public.lic_contrato_empresas enable row level security;
drop policy if exists lic_ver on public.lic_contrato_empresas;
create policy lic_ver on public.lic_contrato_empresas for select to authenticated
  using ((select app.hub_pode(org_id, 'licencas', 'ver')));
revoke insert, update, delete on public.lic_contrato_empresas from anon, authenticated;
-- sem políticas de escrita: só pela função abaixo.

-- ------------------------------------------------------------------------------------------- 2 definir a lista
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
  delete from lic_contrato_empresas where contrato_id = v_k.id and cliente_id <> all (v_lista);
  insert into lic_contrato_empresas (contrato_id, cliente_id, org_id, por)
  select v_k.id, x, v_k.org_id, auth.uid() from unnest(v_lista) x
  on conflict (contrato_id, cliente_id) do nothing;
  select count(*) into v_n from lic_contrato_empresas where contrato_id = v_k.id;
  return v_n;
end $$;
revoke all on function public.lic_contrato_empresas_definir(uuid, uuid[]) from public, anon;
grant execute on function public.lic_contrato_empresas_definir(uuid, uuid[]) to authenticated;
comment on function public.lic_contrato_empresas_definir(uuid, uuid[]) is
  'Troca a lista de empresas que usam o sistema da licença (licencas › operar; licença ativa; clientes ativos da mesma organização) (095).';

-- ------------------------------------------------------------------------------------------- 3 o sistema lê
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
  return jsonb_build_object('situacao', 'ativa', 'empresas', coalesce((
    select jsonb_agg(jsonb_build_object(
             'razao_social', c.razao_social, 'nome_fantasia', c.nome_fantasia,
             'cnpj', regexp_replace(coalesce(c.cnpj, ''), '\D', '', 'g'), 'regime', c.regime::text,
             'cidade', c.cidade, 'uf', c.uf, 'codigo_dominio', c.codigo_dominio,
             'da_licenca', c.id = v_k.cliente_id)
           order by c.id <> v_k.cliente_id, c.razao_social, c.cnpj)
      from clientes c
     where c.org_id = v_k.org_id and c.ativo
       and (c.id = v_k.cliente_id
            or exists (select 1 from lic_contrato_empresas e where e.contrato_id = v_k.id and e.cliente_id = c.id))), '[]'::jsonb));
end $$;
revoke all on function public.lic_empresas(text, text, text) from public;
grant execute on function public.lic_empresas(text, text, text) to anon, authenticated;
comment on function public.lic_empresas(text, text, text) is
  'Chamada pelo servidor do sistema com a chave da licença: chave + CNPJ → o cliente da licença e as empresas marcadas '
  'para usar o sistema (só razão, fantasia, CNPJ, regime, cidade, UF e código do Domínio) (095).';
