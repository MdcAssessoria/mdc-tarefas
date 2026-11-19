-- =====================================================================================================
--  088 · Sistemas: licença por sistema (Ledgra ERP, EXato e os próximos) — pedido do Edvaldo, 18/11/2026
--
--  "No HUB MDC eu cadastro o cliente que usará o sistema, crio a chave. Esse cliente aparece no sistema vinculado à
--  chave… a cobrança vem para a gestão MDC." Modelo de preço aprovado: valor base com usuários incluídos + valor por
--  usuário adicional (a mesma estrutura aceita só fixo ou só por usuário).
--
--   1  lic_sistemas: cadastro dos sistemas que a MDC licencia (slug, nome, prefixo da chave, situação vendendo /
--      em_breve / desligado). Semeados: HUB-MDC, Ledgra ERP e EXato (vendendo); Hub-Team e Acesso remoto (em breve).
--      Grava só por lic_sistema_salvar (licencas › gerir). O menu "Licenças Ledgra" vira "Sistemas".
--   2  lic_produtos.sistema passa a apontar para lic_sistemas (chave composta org + slug) e o EXato ganha os módulos
--      vendáveis exato-* (diaristas, operacao, transporte, auditoria, rs, crm, contratos, faturamento, financeiro,
--      compras, estoque, juridico). Clientes, cadastros, relatórios e administração do EXato vêm sempre.
--   3  lic_contratos: sistema (um contrato ativo por cliente e sistema), usuarios_incluidos, valor_usuario_adicional
--      (valor: só com gerir), excedente ('cobrar' = libera e cobra o usuário a mais; 'bloquear' = o sistema não
--      deixa passar do limite) e recorrente_id (contrato a receber da Gestão que fatura a licença).
--   4  Chave por sistema (tabela lic_ledgra_chaves ganha `sistema`; uma ativa por cliente e sistema), com o prefixo do
--      sistema (LDG-…, EXA-…). lic_chave_gerar(cliente, sistema) e lic_validar(sistema, chave, cnpj); as funções do
--      Ledgra (lic_ledgra_*) continuam e chamam as novas.
--   5  lic_usos + lic_uso_informar(sistema, chave, cnpj, usuarios): o sistema informa, com a chave, quantas pessoas
--      têm acesso; fica o MAIOR número do mês (competência).
--   6  Cobrança do usuário adicional do mês anterior: (a) licença ligada a um contrato a receber da Gestão → entra na
--      conta e na fatura que o contrato gera (app.fin_recorrente_lancar_mes); a mensalidade da licença (lic_cobrancas)
--      deixa de ser gerada para ela, para não cobrar duas vezes; (b) sem ligação → soma na mensalidade da licença.
-- =====================================================================================================

-- ===================================================================================================== 1 sistemas
create table if not exists public.lic_sistemas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z][a-z0-9-]{1,29}$'),
  nome text not null check (length(trim(nome)) between 2 and 60),
  descricao text not null default '',
  prefixo text not null check (prefixo ~ '^[A-Z]{3}$'),
  situacao text not null default 'em_breve' check (situacao in ('vendendo', 'em_breve', 'desligado')),
  ordem int not null default 100,
  criado_em timestamptz not null default now(),
  unique (org_id, slug),
  unique (org_id, prefixo)
);
comment on table public.lic_sistemas is
  'Sistemas que a MDC licencia (088). vendendo = aceita licença nova; em_breve = só cadastro; desligado = fora de venda (licenças antigas seguem).';
alter table public.lic_sistemas enable row level security;
drop policy if exists lic_sistemas_ler on public.lic_sistemas;
create policy lic_sistemas_ler on public.lic_sistemas for select to authenticated using ((select app.hub_pode(org_id, 'licencas', 'ver')));
revoke insert, update, delete, truncate on public.lic_sistemas from anon, authenticated;
grant select on public.lic_sistemas to authenticated;

create or replace function app.lic_semear_sistemas(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into lic_sistemas (org_id, slug, nome, descricao, prefixo, situacao, ordem)
  values
    (p_org, 'hub', 'HUB-MDC', 'Portal do cliente e ferramentas do HUB', 'HUB', 'vendendo', 10),
    (p_org, 'ledgra', 'Ledgra ERP', 'ERP contábil, fiscal e de DP da família Ledgra', 'LDG', 'vendendo', 20),
    (p_org, 'exato', 'EXato', 'Solução em RH: diárias, operação, R&S, CRM e contratos', 'EXA', 'vendendo', 30),
    (p_org, 'hub-team', 'Hub-Team', 'CRM, contratos e RH para empresas de mão de obra', 'HTM', 'em_breve', 40),
    (p_org, 'acesso-remoto', 'Acesso remoto', 'Acesso remoto às estações (tipo AnyDesk)', 'ARM', 'em_breve', 50)
  on conflict (org_id, slug) do nothing;
end $$;
revoke all on function app.lic_semear_sistemas(uuid) from public, anon, authenticated;
select app.lic_semear_sistemas(id) from public.organizacoes;

-- módulos vendáveis do EXato (o código do módulo no EXato é o slug sem "exato-")
create or replace function app.lic_semear_exato(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into lic_produtos (org_id, slug, nome, descricao, sistema, ordem)
  values
    (p_org, 'exato-diaristas', 'EXato · Diaristas', 'Cadastro do diarista pelo celular, conferência, biometria e PIX', 'exato', 400),
    (p_org, 'exato-operacao', 'EXato · Operação', 'Pedido do cliente, pré-lista, dobra de diária e tablet do preposto', 'exato', 410),
    (p_org, 'exato-transporte', 'EXato · Transporte', 'Roteirização, embarque e app do motorista', 'exato', 420),
    (p_org, 'exato-auditoria', 'EXato · Auditoria e lotes', 'Auditoria das diárias e lote de pagamento dos diaristas', 'exato', 430),
    (p_org, 'exato-rs', 'EXato · Recrutamento e seleção', 'Vagas, funil, banco de talentos e portal do candidato', 'exato', 440),
    (p_org, 'exato-crm', 'EXato · CRM', 'Prospecção, oportunidades, propostas e aprovações do jurídico', 'exato', 450),
    (p_org, 'exato-contratos', 'EXato · Contratos e preços', 'Contrato por artigos, formação de preço, minuta e assinatura', 'exato', 460),
    (p_org, 'exato-faturamento', 'EXato · Faturamento', 'Medições, faturas e NFS-e', 'exato', 470),
    (p_org, 'exato-financeiro', 'EXato · Financeiro', 'Contas a pagar e a receber, bancos, conciliação e contabilidade', 'exato', 480),
    (p_org, 'exato-compras', 'EXato · Compras', 'Solicitação, cotação e pedido de compra', 'exato', 490),
    (p_org, 'exato-estoque', 'EXato · Estoque e notas de entrada', 'Depósitos, itens, notas de entrada e notas da SEFAZ', 'exato', 500),
    (p_org, 'exato-juridico', 'EXato · Jurídico', 'Processos, prazos e audiências, provisões pelo CPC 25', 'exato', 510)
  on conflict (org_id, slug) do nothing;
end $$;
revoke all on function app.lic_semear_exato(uuid) from public, anon, authenticated;

-- organização nova: sistemas primeiro (o nome "aa_" faz este gatilho rodar antes dos que semeiam os módulos)
create or replace function app.tg_org_sistemas() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform app.lic_semear_sistemas(new.id);
  return new;
end $$;
revoke all on function app.tg_org_sistemas() from public, anon, authenticated;
drop trigger if exists aa_org_sistemas on public.organizacoes;
create trigger aa_org_sistemas after insert on public.organizacoes for each row execute function app.tg_org_sistemas();

-- o gatilho do Ledgra (org_ledgra) passa a semear também o EXato
create or replace function app.tg_org_ledgra() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform app.lic_semear_ledgra(new.id);
  perform app.lic_semear_exato(new.id);
  return new;
end $$;

create or replace function public.lic_sistema_salvar(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := nullif(p->>'id', '')::uuid; v_antes lic_sistemas; v_org uuid := nullif(p->>'org', '')::uuid;
        v_prefixo text := upper(trim(coalesce(p->>'prefixo', ''))); v_sit text := coalesce(nullif(p->>'situacao', ''), 'em_breve');
begin
  if v_id is not null then
    select * into v_antes from lic_sistemas where id = v_id for update;
    if v_antes.id is null then raise exception 'Sistema não encontrado'; end if;
    v_org := v_antes.org_id;
  end if;
  if v_org is null or not app.hub_pode(v_org, 'licencas', 'gerir') then raise exception 'Sem permissão para cadastrar sistemas'; end if;
  if length(trim(coalesce(p->>'nome', ''))) < 2 then raise exception 'Informe o nome do sistema'; end if;
  if v_prefixo !~ '^[A-Z]{3}$' then raise exception 'Prefixo da chave: 3 letras (ex.: EXA)'; end if;
  if v_sit not in ('vendendo', 'em_breve', 'desligado') then raise exception 'Situação inválida'; end if;
  if exists (select 1 from lic_sistemas where org_id = v_org and prefixo = v_prefixo and id is distinct from v_id) then
    raise exception 'Outro sistema já usa o prefixo %', v_prefixo;
  end if;
  if v_id is null then
    if coalesce(p->>'slug', '') !~ '^[a-z][a-z0-9-]{1,29}$' then
      raise exception 'Código do sistema: de 2 a 30 letras minúsculas, números ou hífen (ex.: exato)';
    end if;
    if exists (select 1 from lic_sistemas where org_id = v_org and slug = p->>'slug') then raise exception 'Já existe um sistema com este código'; end if;
    insert into lic_sistemas (org_id, slug, nome, descricao, prefixo, situacao, ordem)
    values (v_org, p->>'slug', trim(p->>'nome'), coalesce(trim(p->>'descricao'), ''), v_prefixo, v_sit, coalesce((p->>'ordem')::int, 100))
    returning id into v_id;
  else
    update lic_sistemas set nome = trim(p->>'nome'), descricao = coalesce(trim(p->>'descricao'), ''), prefixo = v_prefixo,
           situacao = v_sit, ordem = coalesce((p->>'ordem')::int, ordem)
     where id = v_id;
  end if;
  perform app.registrar(v_org, 'licencas', case when v_antes.id is null then 'criar_sistema' else 'alterar_sistema' end, v_id::text,
    case when v_antes.id is not null then to_jsonb(v_antes) end, (select to_jsonb(x) from lic_sistemas x where x.id = v_id));
  return v_id;
end $$;
comment on function public.lic_sistema_salvar(jsonb) is
  'Cria ou altera um sistema licenciado (gerir). O código (slug) não muda; prefixo de 3 letras único (vai no começo da chave).';
revoke all on function public.lic_sistema_salvar(jsonb) from public, anon;
grant execute on function public.lic_sistema_salvar(jsonb) to authenticated;

update public.hub_apps
   set nome = 'Sistemas', rota = '/licencas/contratos',
       descricao = 'Sistemas que a MDC licencia (Ledgra ERP, EXato…): licenças por cliente, módulos, usuários, chave e receita'
 where slug = 'licencas';

-- ===================================================================================================== 2 módulos por sistema
alter table public.lic_produtos drop constraint if exists lic_produtos_sistema_check;
alter table public.lic_produtos drop constraint if exists lic_produtos_sistema_fk;
alter table public.lic_produtos add constraint lic_produtos_sistema_fk
  foreign key (org_id, sistema) references public.lic_sistemas (org_id, slug) on delete restrict;
comment on column public.lic_produtos.sistema is 'Sistema do módulo (lic_sistemas.slug). Na chave do sistema o módulo vai sem o prefixo "<sistema>-".';
select app.lic_semear_exato(id) from public.organizacoes;

/** Módulo: o sistema é escolhido ao criar e não muda depois. */
create or replace function public.lic_salvar_produto(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid := (p->>'org')::uuid; v_id uuid := nullif(p->>'id', '')::uuid; v_antes lic_produtos; v_preco numeric;
        v_sistema text := coalesce(nullif(p->>'sistema', ''), 'hub');
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
    if not exists (select 1 from lic_sistemas where org_id = v_org and slug = v_sistema) then raise exception 'Sistema não encontrado'; end if;
    if coalesce(p->>'slug', '') !~ '^[a-z0-9_-]{2,30}$' then
      raise exception 'Código do módulo: de 2 a 30 letras minúsculas, números, hífen ou sublinhado (ex.: exato-rs)';
    end if;
    if v_sistema <> 'hub' and left(p->>'slug', length(v_sistema) + 1) <> v_sistema || '-' then
      raise exception 'O código do módulo começa com o código do sistema (ex.: %-financeiro)', v_sistema;
    end if;
    if exists (select 1 from lic_produtos where org_id = v_org and slug = p->>'slug') then raise exception 'Já existe um módulo com este código'; end if;
    insert into lic_produtos (org_id, slug, nome, descricao, preco, ativo, ordem, sistema)
    values (v_org, p->>'slug', trim(p->>'nome'), coalesce(trim(p->>'descricao'), ''), v_preco,
            coalesce((p->>'ativo')::boolean, true), coalesce((p->>'ordem')::int, 100), v_sistema)
    returning id into v_id;
  else
    if (p->>'sistema') is not null and p->>'sistema' <> v_antes.sistema then raise exception 'O módulo não muda de sistema'; end if;
    update lic_produtos set nome = trim(p->>'nome'), descricao = coalesce(trim(p->>'descricao'), ''), preco = v_preco,
           ativo = coalesce((p->>'ativo')::boolean, ativo), ordem = coalesce((p->>'ordem')::int, ordem)
     where id = v_id;
  end if;
  perform app.registrar(v_org, 'licencas', case when v_antes.id is null then 'criar_modulo' else 'alterar_modulo' end, v_id::text,
    case when v_antes.id is not null then to_jsonb(v_antes) end, (select to_jsonb(x) from lic_produtos x where x.id = v_id));
  return v_id;
end $$;
comment on function public.lic_salvar_produto(jsonb) is
  'Cria ou altera um módulo vendável (gerir). Código e sistema não mudam depois de criados; o código começa com o do sistema.';

-- ===================================================================================================== 3 contrato por sistema
alter table public.lic_contratos add column if not exists sistema text;
update public.lic_contratos k
   set sistema = coalesce((select min(pr.sistema) filter (where pr.sistema <> 'hub') from lic_contrato_produtos cp join lic_produtos pr on pr.id = cp.produto_id
                            where cp.contrato_id = k.id),
                          case when k.modalidade = 'full' then 'ledgra' else 'hub' end)
 where k.sistema is null;
alter table public.lic_contratos alter column sistema set not null;
alter table public.lic_contratos drop constraint if exists lic_contratos_sistema_fk;
alter table public.lic_contratos add constraint lic_contratos_sistema_fk
  foreign key (org_id, sistema) references public.lic_sistemas (org_id, slug) on delete restrict;
alter table public.lic_contratos add column if not exists usuarios_incluidos int check (usuarios_incluidos is null or usuarios_incluidos > 0);
alter table public.lic_contratos add column if not exists valor_usuario_adicional numeric(15, 2) not null default 0 check (valor_usuario_adicional >= 0);
alter table public.lic_contratos add column if not exists excedente text not null default 'cobrar' check (excedente in ('cobrar', 'bloquear'));
alter table public.lic_contratos add column if not exists recorrente_id uuid references public.fin_recorrentes(id) on delete restrict;
create unique index if not exists lic_contratos_um_por_sistema on public.lic_contratos (cliente_id, sistema) where situacao = 'ativo';
create unique index if not exists lic_contratos_recorrente on public.lic_contratos (recorrente_id) where recorrente_id is not null and situacao = 'ativo';
comment on column public.lic_contratos.sistema is 'Sistema licenciado (um contrato ativo por cliente e sistema).';
comment on column public.lic_contratos.usuarios_incluidos is 'Usuários incluídos no valor mensal; vazio = sem limite.';
comment on column public.lic_contratos.valor_usuario_adicional is 'Valor por usuário além dos incluídos, cobrado no mês seguinte (só com a permissão de valores).';
comment on column public.lic_contratos.excedente is 'cobrar = libera e cobra o usuário a mais; bloquear = o sistema não deixa cadastrar além do limite.';
comment on column public.lic_contratos.recorrente_id is 'Contrato a receber da Gestão que fatura esta licença (a mensalidade da licença não é gerada).';
grant select (sistema, usuarios_incluidos, excedente, recorrente_id) on public.lic_contratos to authenticated;

-- valores: o valor por usuário adicional entra junto com o valor mensal
create or replace function public.lic_valores(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not app.hub_pode(p_org, 'licencas', 'gerir') then raise exception 'Sem permissão para ver os valores das licenças'; end if;
  return jsonb_build_object(
    'produtos', coalesce((select jsonb_object_agg(id, preco) from lic_produtos where org_id = p_org), '{}'::jsonb),
    'planos', coalesce((select jsonb_object_agg(id, preco) from lic_planos where org_id = p_org), '{}'::jsonb),
    'contratos', coalesce((select jsonb_object_agg(id, jsonb_build_object('valor_mensal', valor_mensal, 'valor_tabela', valor_tabela,
                                                                            'valor_usuario_adicional', valor_usuario_adicional))
                             from lic_contratos where org_id = p_org), '{}'::jsonb));
end $$;

/** Sistema da Gestão (fin_sistemas) com o nome do sistema licenciado, criado na empresa da gestão se faltar. */
create or replace function app.lic_fin_sistema(p_org uuid, p_cliente_gestao uuid, p_sistema text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_nome text; v_id uuid;
begin
  select nome into v_nome from lic_sistemas where org_id = p_org and slug = p_sistema;
  select id into v_id from fin_sistemas where cliente_id = p_cliente_gestao and lower(trim(nome)) = lower(trim(v_nome));
  if v_id is null then
    insert into fin_sistemas (org_id, cliente_id, nome, descricao, por)
    values (p_org, p_cliente_gestao, v_nome, 'Criado pela licença (Sistemas)', auth.uid()) returning id into v_id;
  end if;
  return v_id;
end $$;
revoke all on function app.lic_fin_sistema(uuid, uuid, text) from public, anon, authenticated;

create or replace function public.lic_salvar_contrato(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid; v_antes lic_contratos; v_cli clientes; v_org uuid;
  v_plano uuid := nullif(p->>'plano', '')::uuid; v_prods uuid[]; v_tabela numeric; v_valor numeric := round((p->>'valor_mensal')::numeric, 2);
  v_inicio date := (p->>'inicio')::date; v_fim date := nullif(p->>'fim', '')::date; v_dia int := (p->>'dia_vencimento')::int;
  v_indice text := coalesce(nullif(p->>'reajuste_indice', ''), 'IPCA'); v_mes int := nullif(p->>'reajuste_mes', '')::int;
  v_conflito text; v_antes_prods jsonb; v_full boolean := coalesce(p->>'modalidade', '') = 'full'; v_modal text; v_valores boolean;
  v_sistema text; v_sis lic_sistemas; v_incl int := nullif(p->>'usuarios_incluidos', '')::int;
  v_adic numeric := round(coalesce(nullif(p->>'valor_usuario_adicional', '')::numeric, 0), 2);
  v_exc text := coalesce(nullif(p->>'excedente', ''), 'cobrar'); v_rec uuid; r fin_recorrentes;
begin
  if v_id is not null then
    select * into v_antes from lic_contratos where id = v_id for update;
    if v_antes.id is null then raise exception 'Contrato não encontrado'; end if;
    if v_antes.situacao <> 'ativo' then raise exception 'Contrato encerrado não pode ser alterado'; end if;
    if (p->>'cliente') is not null and (p->>'cliente')::uuid <> v_antes.cliente_id then raise exception 'O contrato não muda de cliente'; end if;
    if (p->>'sistema') is not null and p->>'sistema' <> v_antes.sistema then raise exception 'A licença não muda de sistema; encerre e cadastre outra'; end if;
    select * into v_cli from clientes where id = v_antes.cliente_id;
    select jsonb_agg(produto_id) into v_antes_prods from lic_contrato_produtos where contrato_id = v_id;
    v_sistema := v_antes.sistema;
  else
    select * into v_cli from clientes where id = (p->>'cliente')::uuid;
    if v_cli.id is null then raise exception 'Cliente não encontrado'; end if;
    v_sistema := coalesce(nullif(p->>'sistema', ''), 'ledgra');
  end if;
  v_org := v_cli.org_id;
  if not app.hub_pode(v_org, 'licencas', 'operar') then raise exception 'Sem permissão para cadastrar licenças'; end if;
  v_valores := app.hub_pode(v_org, 'licencas', 'gerir');
  if v_id is null and not v_cli.ativo then raise exception 'Cliente inativo não recebe contrato novo'; end if;
  select * into v_sis from lic_sistemas where org_id = v_org and slug = v_sistema;
  if v_sis.id is null then raise exception 'Sistema não encontrado'; end if;
  if v_id is null and v_sis.situacao <> 'vendendo' then raise exception 'O % ainda não está à venda (situação: %)', v_sis.nome, replace(v_sis.situacao, '_', ' '); end if;
  if v_id is null and exists (select 1 from lic_contratos where cliente_id = v_cli.id and sistema = v_sistema and situacao = 'ativo') then
    raise exception 'O cliente já tem licença ativa do %. Edite aquela licença ou encerre antes', v_sis.nome;
  end if;

  if v_plano is not null and not exists (select 1 from lic_planos where id = v_plano and org_id = v_org) then
    raise exception 'Plano não encontrado';
  end if;
  if v_plano is not null and v_id is null and not exists (select 1 from lic_planos where id = v_plano and ativo) then
    raise exception 'Este plano está inativo';
  end if;
  if v_full then
    -- full: todos os módulos ativos do sistema (os novos entram sozinhos na validação da chave)
    v_plano := null;
    select array_agg(id) into v_prods from lic_produtos where org_id = v_org and sistema = v_sistema and ativo;
    if coalesce(cardinality(v_prods), 0) = 0 then raise exception 'Não há módulo ativo do % para a licença full', v_sis.nome; end if;
  elsif jsonb_typeof(p->'produtos') = 'array' and jsonb_array_length(p->'produtos') > 0 then
    select array_agg(distinct x::uuid) into v_prods from jsonb_array_elements_text(p->'produtos') x;
  elsif v_plano is not null then
    select array_agg(produto_id) into v_prods from lic_plano_produtos where plano_id = v_plano;
  end if;
  if coalesce(cardinality(v_prods), 0) = 0 then raise exception 'Escolha um plano ou ao menos um módulo'; end if;
  if exists (select 1 from unnest(v_prods) u where not exists (select 1 from lic_produtos where id = u and org_id = v_org)) then
    raise exception 'Módulo não encontrado nesta organização';
  end if;
  if exists (select 1 from unnest(v_prods) u join lic_produtos pr on pr.id = u where pr.sistema <> v_sistema) then
    raise exception 'Há módulo de outro sistema na escolha; cada licença é de um sistema só';
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

  -- usuários: limite e regra do excedente (operar); valor por usuário adicional só com a permissão de valores
  if v_incl is not null and v_incl < 1 then raise exception 'Usuários incluídos: 1 ou mais (vazio = sem limite)'; end if;
  if v_exc not in ('cobrar', 'bloquear') then raise exception 'Quando passar do limite: cobrar ou bloquear'; end if;
  if not v_valores then
    v_adic := case when v_id is null then 0 else v_antes.valor_usuario_adicional end;
  end if;
  if v_adic < 0 then raise exception 'O valor por usuário adicional não pode ser negativo'; end if;

  -- sem a permissão de valores (gerir) o valor não vem da tela: licença nova = preço de tabela; alteração = mantém o atual
  if not v_valores then
    v_valor := case when v_id is null
                    then coalesce((select preco from lic_planos where id = v_plano), (select sum(preco) from lic_produtos where id = any (v_prods)), 0)
                    else v_antes.valor_mensal end;
  end if;
  if v_valor is null or v_valor < 0 then raise exception 'Informe o valor mensal (zero para licença gratuita)'; end if;
  if v_dia is null or v_dia < 1 or v_dia > 31 then raise exception 'Dia de vencimento: de 1 a 31'; end if;
  if v_inicio is null then raise exception 'Informe a data de início'; end if;
  if v_fim is not null and v_fim < v_inicio then raise exception 'O fim não pode ser antes do início'; end if;
  if v_indice not in ('IPCA', 'IGP-M', 'INPC', 'fixo', 'nenhum') then raise exception 'Índice de reajuste inválido'; end if;
  if v_indice <> 'nenhum' and (v_mes is null or v_mes not between 1 and 12) then raise exception 'Escolha o mês do reajuste'; end if;
  if v_id is not null and v_inicio <> v_antes.inicio and exists (select 1 from lic_cobrancas where contrato_id = v_id) then
    raise exception 'O início não muda depois que há mensalidade gerada';
  end if;

  -- cobrança pela Gestão: contrato a receber ativo da empresa da gestão (só com a permissão de valores)
  v_rec := case when v_valores then case when p ? 'recorrente' then nullif(p->>'recorrente', '')::uuid else v_antes.recorrente_id end
                else v_antes.recorrente_id end;
  if v_rec is not null and v_rec is distinct from v_antes.recorrente_id then
    select * into r from fin_recorrentes where id = v_rec;
    if r.id is null or r.org_id <> v_org then raise exception 'Contrato a receber não encontrado'; end if;
    if r.tipo <> 'receber' then raise exception 'A licença só se liga a contrato A RECEBER'; end if;
    if r.situacao <> 'ativo' then raise exception 'O contrato a receber escolhido não está ativo'; end if;
    if not app.empresa_gestao(r.cliente_id) then raise exception 'O contrato a receber precisa ser da empresa da gestão'; end if;
    if exists (select 1 from lic_contratos where recorrente_id = v_rec and situacao = 'ativo' and id is distinct from v_id) then
      raise exception 'Este contrato a receber já fatura outra licença';
    end if;
  end if;
  v_modal := case when v_full then 'full' when v_valor = 0 then 'gratuita' else 'pacote' end;

  v_tabela := coalesce((select preco from lic_planos where id = v_plano),
                       (select sum(preco) from lic_produtos where id = any (v_prods)), 0);
  if v_id is null then
    insert into lic_contratos (org_id, cliente_id, plano_id, valor_tabela, valor_mensal, dia_vencimento, inicio, fim, proporcional,
                               reajuste_indice, reajuste_mes, observacao, por, modalidade, sistema, usuarios_incluidos,
                               valor_usuario_adicional, excedente, recorrente_id)
    values (v_org, v_cli.id, v_plano, v_tabela, v_valor, v_dia, v_inicio, v_fim, coalesce((p->>'proporcional')::boolean, false),
            v_indice, case when v_indice = 'nenhum' then null else v_mes end, nullif(trim(p->>'observacao'), ''), auth.uid(), v_modal,
            v_sistema, v_incl, v_adic, v_exc, v_rec)
    returning id into v_id;
  else
    update lic_contratos set plano_id = v_plano, valor_tabela = v_tabela, valor_mensal = v_valor, dia_vencimento = v_dia,
           inicio = v_inicio, fim = v_fim, proporcional = coalesce((p->>'proporcional')::boolean, proporcional),
           reajuste_indice = v_indice, reajuste_mes = case when v_indice = 'nenhum' then null else v_mes end,
           observacao = nullif(trim(p->>'observacao'), ''), modalidade = v_modal, usuarios_incluidos = v_incl,
           valor_usuario_adicional = v_adic, excedente = v_exc, recorrente_id = v_rec
     where id = v_id;
    delete from lic_contrato_produtos where contrato_id = v_id and produto_id <> all (v_prods);
  end if;
  insert into lic_contrato_produtos (contrato_id, produto_id, org_id) select v_id, u, v_org from unnest(v_prods) u on conflict do nothing;
  -- a receita do contrato a receber passa a contar para o sistema (Receita por sistema)
  if v_rec is not null then
    select * into r from fin_recorrentes where id = v_rec;
    update fin_recorrentes set sistema_id = app.lic_fin_sistema(v_org, r.cliente_id, v_sistema) where id = v_rec and sistema_id is null;
  end if;

  perform app.registrar(v_org, 'licencas', case when v_antes.id is null then 'criar_contrato' else 'alterar_contrato' end, v_id::text,
    case when v_antes.id is not null then to_jsonb(v_antes) || jsonb_build_object('produtos', v_antes_prods) end,
    (select to_jsonb(x) from lic_contratos x where x.id = v_id) || jsonb_build_object('produtos', to_jsonb(v_prods)));
  perform app.lic_gerar(v_org, app.hoje(v_org), v_id);
  return v_id;
end $$;
comment on function public.lic_salvar_contrato(jsonb) is
  'Cria ou altera a licença de UM sistema (operar; valores e ligação com a Gestão só com gerir). Um contrato ativo por cliente e sistema; full = todos os módulos ativos do sistema; usuários incluídos e regra do excedente.';

-- ===================================================================================================== 4 chave por sistema
alter table public.lic_ledgra_chaves add column if not exists sistema text not null default 'ledgra';
alter table public.lic_ledgra_chaves drop constraint if exists lic_ledgra_chaves_sistema_fk;
alter table public.lic_ledgra_chaves add constraint lic_ledgra_chaves_sistema_fk
  foreign key (org_id, sistema) references public.lic_sistemas (org_id, slug) on delete restrict;
drop index if exists public.lic_ledgra_chaves_ativa;
create unique index if not exists lic_chaves_ativa on public.lic_ledgra_chaves (cliente_id, sistema) where revogada_em is null;
comment on table public.lic_ledgra_chaves is
  'Chave de licença de cada cliente POR SISTEMA (088; nome antigo mantido). Uma ativa por cliente e sistema; só o hash SHA-256 e o começo.';

create or replace function app.lic_chave_nova(p_cliente uuid, p_sistema text, p_motivo_anterior text)
returns text language plpgsql security definer set search_path = public as $$
declare v_cli clientes; v_hex text; v_chave text; v_id uuid; v_pre text;
begin
  select * into v_cli from clientes where id = p_cliente;
  if v_cli.id is null then raise exception 'Cliente não encontrado'; end if;
  select prefixo into v_pre from lic_sistemas where org_id = v_cli.org_id and slug = p_sistema;
  if v_pre is null then raise exception 'Sistema não encontrado'; end if;
  if coalesce(regexp_replace(v_cli.cnpj, '\D', '', 'g'), '') = '' then raise exception 'Cadastre o CNPJ do cliente antes de gerar a chave'; end if;
  update lic_ledgra_chaves set revogada_em = now(), revogada_por = auth.uid(), revogada_motivo = p_motivo_anterior
   where cliente_id = p_cliente and sistema = p_sistema and revogada_em is null;
  v_hex := upper(encode(extensions.gen_random_bytes(15), 'hex'));
  v_chave := v_pre || '-' || substr(v_hex, 1, 5) || '-' || substr(v_hex, 6, 5) || '-' || substr(v_hex, 11, 5) || '-'
          || substr(v_hex, 16, 5) || '-' || substr(v_hex, 21, 5) || '-' || substr(v_hex, 26, 5);
  insert into lic_ledgra_chaves (org_id, cliente_id, chave_hash, prefixo, criada_por, sistema)
  values (v_cli.org_id, p_cliente, encode(extensions.digest(v_chave, 'sha256'), 'hex'), left(v_chave, 9), auth.uid(), p_sistema)
  returning id into v_id;
  perform app.registrar(v_cli.org_id, 'licencas', 'gerar_chave', v_id::text, null,
    jsonb_build_object('cliente', p_cliente, 'sistema', p_sistema, 'prefixo', left(v_chave, 9), 'origem', p_motivo_anterior));
  return v_chave;
end $$;
revoke all on function app.lic_chave_nova(uuid, text, text) from public, anon, authenticated;

create or replace function app.lic_ledgra_chave_nova(p_cliente uuid, p_motivo_anterior text)
returns text language sql security definer set search_path = public as $$ select app.lic_chave_nova(p_cliente, 'ledgra', p_motivo_anterior) $$;
revoke all on function app.lic_ledgra_chave_nova(uuid, text) from public, anon, authenticated;

create or replace function public.lic_chave_gerar(p_cliente uuid, p_sistema text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from clientes c where c.id = p_cliente and app.hub_pode(c.org_id, 'licencas', 'operar')) then
    if not exists (select 1 from clientes where id = p_cliente) then raise exception 'Cliente não encontrado'; end if;
    raise exception 'Sem permissão para gerar a chave';
  end if;
  return app.lic_chave_nova(p_cliente, p_sistema, 'Chave nova gerada');
end $$;
comment on function public.lic_chave_gerar(uuid, text) is
  'Gera a chave do cliente para um sistema (operar). A anterior do mesmo sistema deixa de valer. Devolve o texto uma única vez.';
revoke all on function public.lic_chave_gerar(uuid, text) from public, anon;
grant execute on function public.lic_chave_gerar(uuid, text) to authenticated;

create or replace function public.lic_ledgra_chave_gerar(p_cliente uuid)
returns text language sql security definer set search_path = public as $$ select public.lic_chave_gerar(p_cliente, 'ledgra') $$;

create or replace function public.lic_ledgra_chave_revogar(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v lic_ledgra_chaves;
begin
  select * into v from lic_ledgra_chaves where id = p_id for update;
  if v.id is null then raise exception 'Chave não encontrada'; end if;
  if not app.hub_pode(v.org_id, 'licencas', 'operar') then raise exception 'Sem permissão para revogar a chave'; end if;
  if v.revogada_em is not null then raise exception 'Esta chave já foi revogada'; end if;
  if char_length(trim(coalesce(p_motivo, ''))) < 5 then raise exception 'Explique o motivo (mínimo 5 letras)'; end if;
  update lic_ledgra_chaves set revogada_em = now(), revogada_por = auth.uid(), revogada_motivo = trim(p_motivo) where id = p_id;
  perform app.registrar(v.org_id, 'licencas', 'revogar_chave', p_id::text, null, jsonb_build_object('motivo', trim(p_motivo), 'sistema', v.sistema));
end $$;

/** Acha a chave ativa do sistema pelo texto (sem espaços, maiúsculas). */
create or replace function app.lic_chave_achar(p_sistema text, p_chave text)
returns public.lic_ledgra_chaves language sql stable security definer set search_path = public as $$
  select * from lic_ledgra_chaves
   where chave_hash = encode(extensions.digest(upper(regexp_replace(coalesce(p_chave, ''), '\s', '', 'g')), 'sha256'), 'hex')
     and sistema = p_sistema and revogada_em is null
$$;
revoke all on function app.lic_chave_achar(text, text) from public, anon, authenticated;

-- o sistema (servidor dele, com a chave pública do HUB) confere a licença: chave + CNPJ → situação, módulos e usuários
create or replace function public.lic_validar(p_sistema text, p_chave text, p_cnpj text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v lic_ledgra_chaves; v_cli clientes; v_hoje date; v_mods text[]; v_k lic_contratos; v_sit text;
begin
  v := app.lic_chave_achar(p_sistema, p_chave);
  if v.id is null then return jsonb_build_object('situacao', 'invalida'); end if;
  select * into v_cli from clientes where id = v.cliente_id;
  if regexp_replace(coalesce(v_cli.cnpj, ''), '\D', '', 'g') <> regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g') then
    update lic_ledgra_chaves set ultimo_uso_em = now(), ultimo_uso_situacao = 'cnpj_diferente' where id = v.id;
    return jsonb_build_object('situacao', 'cnpj_diferente');
  end if;
  v_hoje := app.hoje(v.org_id);
  select * into v_k from lic_contratos k
   where k.cliente_id = v.cliente_id and k.sistema = p_sistema and k.situacao = 'ativo' and k.inicio <= v_hoje and (k.fim is null or k.fim >= v_hoje);
  -- módulos da licença (full = todos os ativos do sistema hoje), sem o prefixo "<sistema>-"
  if v_k.id is not null then
    select array_agg(distinct regexp_replace(pr.slug, '^' || p_sistema || '-', '') order by regexp_replace(pr.slug, '^' || p_sistema || '-', ''))
      into v_mods
      from lic_produtos pr
     where pr.org_id = v_k.org_id and pr.sistema = p_sistema and pr.ativo
       and (v_k.modalidade = 'full' or exists (select 1 from lic_contrato_produtos cp where cp.contrato_id = v_k.id and cp.produto_id = pr.id));
  end if;
  v_sit := case when app.cliente_bloqueado(v.cliente_id) then 'bloqueada' when coalesce(cardinality(v_mods), 0) = 0 then 'sem_contrato' else 'ativa' end;
  update lic_ledgra_chaves set ultimo_uso_em = now(), ultimo_uso_situacao = v_sit where id = v.id;
  return jsonb_build_object('situacao', v_sit, 'sistema', p_sistema, 'modalidade', v_k.modalidade,
    'modulos', case when v_sit = 'ativa' then to_jsonb(v_mods) else '[]'::jsonb end,
    'usuarios_incluidos', v_k.usuarios_incluidos, 'excedente', coalesce(v_k.excedente, 'cobrar'),
    'valido_ate', v_k.fim, 'cliente', coalesce(v_cli.nome_fantasia, v_cli.razao_social), 'verificado_em', now());
end $$;
comment on function public.lic_validar(text, text, text) is
  'Chamada pelo servidor do sistema: sistema + chave + CNPJ → situação (ativa, bloqueada, sem_contrato, cnpj_diferente, invalida), módulos, usuários incluídos e regra do excedente. Registra o último uso.';
revoke all on function public.lic_validar(text, text, text) from public;
grant execute on function public.lic_validar(text, text, text) to anon, authenticated;

create or replace function public.lic_ledgra_validar(p_chave text, p_cnpj text)
returns jsonb language sql security definer set search_path = public as $$ select public.lic_validar('ledgra', p_chave, p_cnpj) $$;

create or replace function public.lic_vincular_cnpj(p_sistema text, p_cnpj text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cnpj text := regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g'); v_cli uuid; v_qtd int; v_nome text;
begin
  if length(v_cnpj) <> 14 then raise exception 'CNPJ inválido'; end if;
  select count(distinct c.id), min(c.id::text)::uuid, min(s.nome) into v_qtd, v_cli, v_nome
    from clientes c
    join lic_contratos k on k.cliente_id = c.id and k.situacao = 'ativo' and k.sistema = p_sistema
    join lic_sistemas s on s.org_id = k.org_id and s.slug = k.sistema
   where regexp_replace(coalesce(c.cnpj, ''), '\D', '', 'g') = v_cnpj and c.ativo;
  if v_qtd = 0 then raise exception 'Não há licença ativa deste sistema para este CNPJ no HUB MDC. Cadastre a licença em Sistemas › Licenças'; end if;
  if v_qtd > 1 then raise exception 'Este CNPJ tem licença em mais de um cliente do HUB; use a chave gerada no HUB'; end if;
  return jsonb_build_object('chave', app.lic_chave_nova(v_cli, p_sistema, 'Ligação pelo CNPJ no ' || v_nome));
end $$;
comment on function public.lic_vincular_cnpj(text, text) is
  'Só o servidor do sistema (chave de serviço): acha a licença ativa do CNPJ naquele sistema e devolve uma chave nova (a anterior é revogada).';
revoke all on function public.lic_vincular_cnpj(text, text) from public, anon, authenticated;
grant execute on function public.lic_vincular_cnpj(text, text) to service_role;

create or replace function public.lic_ledgra_vincular_cnpj(p_cnpj text)
returns jsonb language sql security definer set search_path = public as $$ select public.lic_vincular_cnpj('ledgra', p_cnpj) $$;
revoke all on function public.lic_ledgra_vincular_cnpj(text) from public, anon, authenticated;
grant execute on function public.lic_ledgra_vincular_cnpj(text) to service_role;

-- ===================================================================================================== 5 uso de usuários
create table if not exists public.lic_usos (
  id bigserial primary key,
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  contrato_id uuid not null references public.lic_contratos(id) on delete restrict,
  sistema text not null,
  competencia date not null check (extract(day from competencia) = 1),
  usuarios int not null check (usuarios >= 0),
  informado_em timestamptz not null default now(),
  unique (contrato_id, competencia)
);
create index if not exists lic_usos_org on public.lic_usos (org_id, competencia);
comment on table public.lic_usos is 'Maior número de usuários com acesso informado pelo sistema em cada mês (088). Base do usuário adicional.';
alter table public.lic_usos enable row level security;
drop policy if exists lic_usos_ler on public.lic_usos;
create policy lic_usos_ler on public.lic_usos for select to authenticated using ((select app.hub_pode(org_id, 'licencas', 'ver')));
revoke insert, update, delete, truncate on public.lic_usos from anon, authenticated;
grant select on public.lic_usos to authenticated;

create or replace function public.lic_uso_informar(p_sistema text, p_chave text, p_cnpj text, p_usuarios int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v lic_ledgra_chaves; v_cli clientes; v_k lic_contratos; v_comp date; v_maior int;
begin
  if p_usuarios is null or p_usuarios < 0 or p_usuarios > 100000 then raise exception 'Número de usuários inválido'; end if;
  v := app.lic_chave_achar(p_sistema, p_chave);
  if v.id is null then raise exception 'Chave inválida'; end if;
  select * into v_cli from clientes where id = v.cliente_id;
  if regexp_replace(coalesce(v_cli.cnpj, ''), '\D', '', 'g') <> regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g') then
    raise exception 'O CNPJ não é o da licença';
  end if;
  select * into v_k from lic_contratos where cliente_id = v.cliente_id and sistema = p_sistema and situacao = 'ativo';
  if v_k.id is null then raise exception 'Não há licença ativa deste sistema'; end if;
  v_comp := date_trunc('month', app.hoje(v.org_id))::date;
  insert into lic_usos (org_id, cliente_id, contrato_id, sistema, competencia, usuarios)
  values (v.org_id, v.cliente_id, v_k.id, p_sistema, v_comp, p_usuarios)
  on conflict (contrato_id, competencia) do update
     set usuarios = greatest(lic_usos.usuarios, excluded.usuarios), informado_em = now()
  returning usuarios into v_maior;
  return jsonb_build_object('competencia', v_comp, 'usuarios', v_maior, 'usuarios_incluidos', v_k.usuarios_incluidos,
    'adicionais', greatest(v_maior - coalesce(v_k.usuarios_incluidos, v_maior), 0), 'excedente', v_k.excedente);
end $$;
comment on function public.lic_uso_informar(text, text, text, int) is
  'Chamada pelo servidor do sistema com a chave: informa quantas pessoas têm acesso; guarda o maior número do mês.';
revoke all on function public.lic_uso_informar(text, text, text, int) from public;
grant execute on function public.lic_uso_informar(text, text, text, int) to anon, authenticated;

/** Usuários adicionais de uma licença numa competência: quantidade × valor (só com excedente = cobrar). */
create or replace function app.lic_adicional(p_contrato uuid, p_competencia date)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('quantidade', q, 'valor', round(q * k.valor_usuario_adicional, 2), 'competencia', c)
    from lic_contratos k
    cross join lateral (select date_trunc('month', p_competencia)::date as c) cc
    cross join lateral (
      select case when k.usuarios_incluidos is null or k.excedente <> 'cobrar' or k.valor_usuario_adicional <= 0 then 0
                  else greatest(coalesce((select u.usuarios from lic_usos u where u.contrato_id = k.id and u.competencia = cc.c), 0)
                                - k.usuarios_incluidos, 0) end as q) qq
   where k.id = p_contrato
$$;
revoke all on function app.lic_adicional(uuid, date) from public, anon, authenticated;

-- ===================================================================================================== 6 cobrança
alter table public.lic_cobrancas add column if not exists usuarios_adicionais int not null default 0 check (usuarios_adicionais >= 0);
alter table public.lic_cobrancas add column if not exists valor_adicionais numeric(15, 2) not null default 0 check (valor_adicionais >= 0);
comment on column public.lic_cobrancas.usuarios_adicionais is 'Usuários além dos incluídos no MÊS ANTERIOR, cobrados nesta mensalidade (088).';

/** Texto da mensalidade: "Licença Ledgra ERP 11/2026 · Plano Gestão" (o sistema no lugar do antigo "HUB"). */
create or replace function app.lic_descricao(p_contrato uuid, p_competencia date)
returns text language sql stable security definer set search_path = public as $$
  select 'Licença ' || coalesce((select s.nome from lic_contratos k join lic_sistemas s on s.org_id = k.org_id and s.slug = k.sistema
                                  where k.id = p_contrato), 'HUB') || ' ' || to_char(p_competencia, 'MM/YYYY') || ' · ' ||
         coalesce((select 'Plano ' || pl.nome from lic_contratos k join lic_planos pl on pl.id = k.plano_id where k.id = p_contrato),
                  (select case when k.modalidade = 'full' then 'todos os módulos' end from lic_contratos k where k.id = p_contrato),
                  (select string_agg(p.nome, ', ' order by p.ordem, p.nome)
                     from lic_contrato_produtos cp join lic_produtos p on p.id = cp.produto_id where cp.contrato_id = p_contrato),
                  'módulos')
$$;
revoke all on function app.lic_descricao(uuid, date) from public, anon, authenticated;

/**
 * Mensalidades da competência (idempotente). Novidades da 088: licença faturada por contrato a receber da Gestão não
 * gera mensalidade aqui (a Gestão cobra); o usuário adicional do mês anterior soma na mensalidade.
 */
create or replace function app.lic_gerar(p_org uuid, p_competencia date, p_contrato uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_comp date := date_trunc('month', p_competencia)::date;
  v_fim date := (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date;
  n int;
begin
  insert into lic_cobrancas (org_id, cliente_id, contrato_id, competencia, vencimento, descricao, valor, usuarios_adicionais, valor_adicionais)
  select k.org_id, k.cliente_id, k.id, v_comp, app.lic_vencimento(v_comp, k.dia_vencimento),
         app.lic_descricao(k.id, v_comp) || case when (a->>'quantidade')::int > 0
           then format(' + %s usuário(s) adicional(is) de %s', a->>'quantidade', to_char((v_comp - interval '1 month')::date, 'MM/YYYY')) else '' end,
         app.lic_valor_mes(k.valor_mensal, k.inicio, k.fim, k.proporcional, v_comp) + (a->>'valor')::numeric,
         (a->>'quantidade')::int, (a->>'valor')::numeric
    from lic_contratos k
    cross join lateral (select app.lic_adicional(k.id, (v_comp - interval '1 month')::date) as a) ad
   where k.org_id = p_org and (p_contrato is null or k.id = p_contrato) and k.recorrente_id is null
     and k.situacao = 'ativo' and k.inicio <= v_fim and (k.fim is null or k.fim >= v_comp)
     and app.lic_valor_mes(k.valor_mensal, k.inicio, k.fim, k.proporcional, v_comp) + (a->>'valor')::numeric > 0
  on conflict (contrato_id, competencia) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function app.lic_gerar(uuid, date, uuid) from public, anon, authenticated;

/**
 * Lança o mês de UM contrato já travado (045). 088: se o contrato a receber fatura uma licença, o usuário adicional do
 * mês anterior entra no valor da conta e da fatura, com a quantidade no texto.
 */
create or replace function app.fin_recorrente_lancar_mes(p_contrato uuid, p_mes date, p_venc date default null, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  k fin_recorrentes; v_mes date := date_trunc('month', p_mes)::date; v_hoje date; v_venc date; r jsonb; v_titulo uuid;
  v_fatura uuid; v_ano int; v_seq int; v_numero text; v_fin text := current_setting('app.fin_interno', true);
  v_conteudo text[]; v_canal text; v_sit_envio text; v_destino text; v_sit text;
  v_lic uuid; v_ad jsonb; v_valor numeric; v_extra text := '';
begin
  select * into k from fin_recorrentes where id = p_contrato;
  v_hoje := app.hoje(k.org_id);
  v_venc := coalesce(p_venc, app.fin_recorrente_vencimento(v_mes, k.tipo, k.dia_geracao, k.dia_vencimento));
  -- usuário adicional da licença ligada (mês anterior ao da competência)
  v_valor := k.valor;
  if k.tipo = 'receber' then
    select id into v_lic from lic_contratos where recorrente_id = k.id and situacao = 'ativo';
    if v_lic is not null then
      v_ad := app.lic_adicional(v_lic, (v_mes - interval '1 month')::date);
      if (v_ad->>'quantidade')::int > 0 and (v_ad->>'valor')::numeric > 0 then
        v_valor := k.valor + (v_ad->>'valor')::numeric;
        v_extra := format(' + %s usuário(s) adicional(is) de %s', v_ad->>'quantidade', to_char((v_mes - interval '1 month')::date, 'MM/YYYY'));
      end if;
    end if;
  end if;
  if k.tipo = 'receber' then
    -- número sem repetir: uma trava por organização e ano (mesmo jeito da 038)
    v_ano := extract(year from v_hoje)::int;
    perform pg_advisory_xact_lock(hashtext('fin_fatura_numero:' || k.org_id::text || ':' || v_ano));
    select coalesce(max(sequencia), 0) + 1 into v_seq from fin_faturas where org_id = k.org_id and ano = v_ano;
    v_numero := v_ano || '/' || lpad(v_seq::text, 5, '0');
  end if;
  r := app.fin_lancar_titulos(jsonb_build_object(
    'cliente', k.cliente_id, 'tipo', k.tipo, 'pessoa', k.pessoa_id, 'categoria', k.categoria_id,
    'centro', k.centro_id, 'conta_prevista', k.conta_prevista_id,
    'descricao', k.descricao || ' · ' || to_char(v_mes, 'MM/YYYY') || v_extra,
    'documento', case when v_numero is not null then 'Fatura ' || v_numero end,
    'emissao', case when v_numero is not null then v_hoje end,
    'vencimento', v_venc, 'valor', v_valor, 'parcelas', 1,
    'observacao', case when p_motivo is null then 'Lançada pelo contrato fixo' else 'Lançada à mão pelo contrato fixo: ' || p_motivo end));
  v_titulo := (r->'titulos'->>0)::uuid;
  perform set_config('app.fin_interno', '1', true);
  update fin_titulos set recorrente_id = k.id, competencia = v_mes where id = v_titulo;
  perform set_config('app.fin_interno', coalesce(v_fin, ''), true);
  update fin_recorrentes set ultima_competencia = greatest(ultima_competencia, v_mes) where id = k.id;
  perform app.registrar(k.org_id, 'financeiro', 'recorrente_gerar', k.id::text, null,
    jsonb_build_object('competencia', v_mes, 'titulo', v_titulo, 'valor', v_valor, 'adicionais', v_ad, 'manual', p_motivo is not null, 'motivo', p_motivo));
  perform app.fin_recorrente_evento(k.id, 'conta', format('Conta de %s lançada em %s (%s)%s%s', to_char(v_mes, 'MM/YYYY'),
    case when k.tipo = 'pagar' then 'Contas a pagar' else 'Contas a receber' end, app.fin_brl(v_valor), v_extra,
    case when p_motivo is not null then ' à mão: ' || p_motivo else '' end),
    jsonb_build_object('titulo', v_titulo, 'competencia', v_mes));

  if k.tipo = 'receber' then
    insert into fin_faturas (org_id, cliente_id, recorrente_id, titulo_id, pessoa_id, cliente_carteira_id, ano, sequencia, numero,
                             competencia, emissao, vencimento, valor, descricao, servico_codigo, iss_aliquota, documento, envio,
                             situacao, nfse_situacao, boleto_situacao, origem, motivo_manual, por)
    values (k.org_id, k.cliente_id, k.id, v_titulo, k.pessoa_id, k.cliente_carteira_id, v_ano, v_seq, v_numero,
            v_mes, v_hoje, v_venc, v_valor,
            coalesce(k.servico_descricao, k.descricao) || ' · ' || to_char(v_mes, 'MM/YYYY') || v_extra,
            k.servico_codigo, k.iss_aliquota, k.documento, k.envio, 'gerada',
            case when k.documento = 'nfse' then 'a_emitir' else 'nao_se_aplica' end,
            case when k.envio = 'fatura' then 'nao_se_aplica' else 'a_definir' end,
            case when p_motivo is null then 'rotina' else 'manual' end, p_motivo, auth.uid())
    returning id into v_fatura;
    -- o que vai em cada envio: "boleto depois" (nf_fatura) manda NF + fatura agora; o boleto sai num envio futuro
    v_conteudo := case k.envio when 'nf_fatura_boleto' then array['nfse', 'fatura', 'boleto'] when 'nf_fatura' then array['nfse', 'fatura']
                               when 'fatura_boleto' then array['fatura', 'boleto'] else array['fatura'] end;
    foreach v_canal in array k.canais loop
      v_destino := case v_canal when 'email' then k.email_envio when 'whatsapp' then k.whatsapp_envio
                                when 'portal' then k.cliente_carteira_id::text end;
      continue when v_destino is null;
      v_sit_envio := case when v_canal = 'portal' then 'pendente' else 'aguardando_configuracao' end;
      insert into fin_envios (org_id, cliente_id, fatura_id, canal, destino, conteudo, situacao)
      values (k.org_id, k.cliente_id, v_fatura, v_canal, v_destino, v_conteudo, v_sit_envio);
    end loop;
    v_sit := app.fin_fatura_processar(v_fatura);
    perform app.registrar(k.org_id, 'contratos', 'fatura_gerar', v_fatura::text, null,
      jsonb_build_object('numero', v_numero, 'contrato', k.id, 'competencia', v_mes, 'valor', v_valor, 'vencimento', v_venc,
                         'documento', k.documento, 'envio', k.envio, 'canais', k.canais, 'manual', p_motivo is not null, 'motivo', p_motivo));
    perform app.fin_recorrente_evento(k.id, 'fatura', format('Fatura %s de %s gerada (%s, vence %s)', v_numero, to_char(v_mes, 'MM/YYYY'),
      app.fin_brl(v_valor), to_char(v_venc, 'DD/MM/YYYY')), jsonb_build_object('fatura', v_fatura, 'numero', v_numero));
  end if;
  return jsonb_build_object('titulo', v_titulo, 'fatura', v_fatura, 'numero', v_numero, 'vencimento', v_venc, 'situacao', v_sit);
end $$;
revoke all on function app.fin_recorrente_lancar_mes(uuid, date, date, text) from public, anon, authenticated;
