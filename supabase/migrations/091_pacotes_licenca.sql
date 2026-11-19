-- 091 · Pacotes de licença (pedido do Edvaldo, 19/11/2026): a MDC monta os pacotes de cada sistema numa tela própria.
-- O plano (lic_planos) vira o PACOTE completo: de qual sistema é, os módulos (lic_plano_produtos), o preço mensal, quantos
-- usuários entram (qualquer número a partir de 1, ou sem limite), o valor de cada usuário a mais e o que fazer com o
-- excedente (cobrar = libera e cobra no mês seguinte; bloquear = não deixa ativar). A licença escolhe um pacote e
-- recebe esses dados como sugestão (editáveis); a licença guarda a própria cópia, então mudar o pacote não muda a
-- licença já fechada.
--   lic_planos            + sistema (FK do sistema), usuarios_incluidos, valor_usuario_adicional, excedente
--   lic_salvar_plano      grava os campos novos; todos os módulos do pacote são do sistema dele; o sistema não muda
--                         depois que o pacote foi usado numa licença
--   lic_valores           devolve também o valor do usuário a mais de cada pacote (só gerir vê valores)

alter table public.lic_planos
  add column if not exists sistema text,
  add column if not exists usuarios_incluidos integer check (usuarios_incluidos is null or usuarios_incluidos >= 1),
  add column if not exists valor_usuario_adicional numeric(15, 2) not null default 0 check (valor_usuario_adicional >= 0),
  add column if not exists excedente text not null default 'cobrar' check (excedente in ('cobrar', 'bloquear'));

-- pacotes que já existem: o sistema dos módulos deles (todos de um sistema só); sem módulo, o HUB
update public.lic_planos pl
   set sistema = coalesce((select pr.sistema from public.lic_plano_produtos pp join public.lic_produtos pr on pr.id = pp.produto_id
                            where pp.plano_id = pl.id group by pr.sistema order by count(*) desc, pr.sistema limit 1), 'hub')
 where pl.sistema is null;
alter table public.lic_planos alter column sistema set not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'lic_planos_sistema_fk') then
    alter table public.lic_planos add constraint lic_planos_sistema_fk
      foreign key (org_id, sistema) references public.lic_sistemas (org_id, slug) on delete restrict;
  end if;
end $$;
create index if not exists lic_planos_sistema on public.lic_planos (org_id, sistema);
comment on column public.lic_planos.sistema is 'Sistema do pacote (Ledgra, EXato…); todos os módulos do pacote são dele.';
comment on column public.lic_planos.usuarios_incluidos is 'Usuários que entram no preço do pacote (vazio = sem limite).';
comment on column public.lic_planos.valor_usuario_adicional is 'Valor mensal de cada usuário além dos incluídos (só gerir vê).';
comment on column public.lic_planos.excedente is 'Usuário além dos incluídos: cobrar (libera e cobra no mês seguinte) ou bloquear.';

-- quem vê licenças lê o sistema, os usuários e a regra do excedente; o valor do adicional, como o preço, só por lic_valores
grant select (sistema, usuarios_incluidos, excedente) on public.lic_planos to authenticated;

/** Cria ou altera um pacote. p: id?, org, nome, descricao, preco, ativo, sistema, produtos (ids), usuarios_incluidos
 * (vazio = sem limite), valor_usuario_adicional, excedente. Só gerir. */
create or replace function public.lic_salvar_plano(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := (p->>'org')::uuid; v_id uuid := nullif(p->>'id', '')::uuid; v_antes jsonb; v_preco numeric; v_antes_sis text;
  v_prods uuid[] := coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(p->'produtos', '[]'::jsonb)) x), '{}');
  v_sistema text; v_incl int := nullif(p->>'usuarios_incluidos', '')::int;
  v_adic numeric := round(coalesce(nullif(p->>'valor_usuario_adicional', '')::numeric, 0), 2);
  v_exc text := coalesce(nullif(p->>'excedente', ''), 'cobrar');
begin
  if v_id is not null then
    select org_id, sistema into v_org, v_antes_sis from lic_planos where id = v_id for update;
    if v_org is null then raise exception 'Pacote não encontrado'; end if;
    select to_jsonb(x) || jsonb_build_object('produtos', (select jsonb_agg(produto_id) from lic_plano_produtos where plano_id = v_id))
      into v_antes from lic_planos x where x.id = v_id;
  end if;
  if v_org is null or not app.hub_pode(v_org, 'licencas', 'gerir') then raise exception 'Sem permissão para cadastrar pacotes'; end if;
  if coalesce(trim(p->>'nome'), '') = '' then raise exception 'Informe o nome do pacote'; end if;
  if cardinality(v_prods) = 0 then raise exception 'Marque ao menos um módulo no pacote'; end if;
  if exists (select 1 from unnest(v_prods) u where not exists (select 1 from lic_produtos where id = u and org_id = v_org)) then
    raise exception 'Módulo não encontrado nesta organização';
  end if;
  -- sistema: o informado; sem ele, o do pacote; sem os dois, o dos módulos
  v_sistema := coalesce(nullif(p->>'sistema', ''), v_antes_sis,
                        (select min(pr.sistema) from lic_produtos pr where pr.id = any (v_prods)));
  if not exists (select 1 from lic_sistemas where org_id = v_org and slug = v_sistema) then
    raise exception 'Sistema não encontrado';
  end if;
  if exists (select 1 from unnest(v_prods) u join lic_produtos pr on pr.id = u where pr.sistema <> v_sistema) then
    raise exception 'Há módulo de outro sistema no pacote; cada pacote é de um sistema só';
  end if;
  if v_antes_sis is not null and v_sistema <> v_antes_sis and exists (select 1 from lic_contratos where plano_id = v_id) then
    raise exception 'O pacote já foi usado numa licença e não muda de sistema; crie outro pacote';
  end if;
  v_preco := round(coalesce(nullif(p->>'preco', '')::numeric, 0), 2);
  if v_preco < 0 then raise exception 'O preço não pode ser negativo'; end if;
  if v_incl is not null and v_incl < 1 then raise exception 'Usuários incluídos: 1 ou mais (vazio = sem limite)'; end if;
  if v_adic < 0 then raise exception 'O valor por usuário a mais não pode ser negativo'; end if;
  if v_exc not in ('cobrar', 'bloquear') then raise exception 'Quando passar do limite: cobrar ou bloquear'; end if;
  if exists (select 1 from lic_planos where org_id = v_org and lower(nome) = lower(trim(p->>'nome')) and id is distinct from v_id) then
    raise exception 'Já existe um pacote com este nome';
  end if;
  if v_id is null then
    insert into lic_planos (org_id, nome, descricao, preco, ativo, sistema, usuarios_incluidos, valor_usuario_adicional, excedente)
    values (v_org, trim(p->>'nome'), coalesce(trim(p->>'descricao'), ''), v_preco, coalesce((p->>'ativo')::boolean, true),
            v_sistema, v_incl, v_adic, v_exc)
    returning id into v_id;
  else
    update lic_planos set nome = trim(p->>'nome'), descricao = coalesce(trim(p->>'descricao'), ''), preco = v_preco,
           ativo = coalesce((p->>'ativo')::boolean, ativo), sistema = v_sistema, usuarios_incluidos = v_incl,
           valor_usuario_adicional = v_adic, excedente = v_exc
     where id = v_id;
  end if;
  -- composição do pacote: as licenças já fechadas guardam a própria cópia dos módulos e dos valores
  delete from lic_plano_produtos where plano_id = v_id and produto_id <> all (v_prods);
  insert into lic_plano_produtos (plano_id, produto_id, org_id) select v_id, u, v_org from unnest(v_prods) u on conflict do nothing;
  perform app.registrar(v_org, 'licencas', case when v_antes is null then 'criar_plano' else 'alterar_plano' end, v_id::text, v_antes,
    (select to_jsonb(x) from lic_planos x where x.id = v_id) || jsonb_build_object('produtos', to_jsonb(v_prods)));
  return v_id;
end $$;
comment on function public.lic_salvar_plano(jsonb) is
  'Cria ou altera um pacote de licença: sistema, módulos, preço, usuários incluídos, adicional e excedente (gerir, 091).';

/** Valores das licenças (só gerir): preço de cada módulo e pacote, valor do usuário a mais de cada pacote e os
 * valores de cada licença. */
create or replace function public.lic_valores(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not app.hub_pode(p_org, 'licencas', 'gerir') then raise exception 'Sem permissão para ver os valores das licenças'; end if;
  return jsonb_build_object(
    'produtos', coalesce((select jsonb_object_agg(id, preco) from lic_produtos where org_id = p_org), '{}'::jsonb),
    'planos', coalesce((select jsonb_object_agg(id, preco) from lic_planos where org_id = p_org), '{}'::jsonb),
    'planos_adicional', coalesce((select jsonb_object_agg(id, valor_usuario_adicional) from lic_planos where org_id = p_org), '{}'::jsonb),
    'contratos', coalesce((select jsonb_object_agg(id, jsonb_build_object('valor_mensal', valor_mensal, 'valor_tabela', valor_tabela,
                                                                            'valor_usuario_adicional', valor_usuario_adicional))
                             from lic_contratos where org_id = p_org), '{}'::jsonb));
end $$;
