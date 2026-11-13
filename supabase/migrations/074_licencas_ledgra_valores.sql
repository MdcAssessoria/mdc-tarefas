-- =====================================================================================================
--  074 · Licenças Ledgra: cadastro aberto à equipe, valores guardados (pedido do Edvaldo, 13/11/2026)
--
--  O módulo `licencas` volta ao menu como "Licenças Ledgra" (só Licenças e Produtos e planos; a cobrança mensal segue em
--  Gestão › Contratos, decisão de 05/11). Níveis da permissão do módulo:
--    ver    = vê as licenças (cliente, módulos, modalidade, vigência, situação, chave) SEM nenhum valor;
--    operar = cadastra e altera licenças, gera e revoga a chave do Ledgra;
--    gerir  = "Valores": preço dos módulos e planos, valor do contrato, mensalidades, recebimentos e reajustes.
--  Os valores ficam protegidos NO BANCO: as colunas de preço/valor saem do select do navegador e só voltam pela
--  `lic_valores(org)` (gerir); mensalidades, recebimentos e reajustes só com gerir.
--  Ligação pelo CNPJ (sem copiar e colar): o servidor do Ledgra chama `lic_ledgra_vincular_cnpj` com a chave de
--  serviço do HUB e recebe uma chave nova da licença ativa daquele CNPJ.
-- =====================================================================================================

update public.hub_apps
   set status = 'ativo', nome = 'Licenças Ledgra', rota = '/licencas/contratos',
       descricao = 'Licenças do ERP Ledgra: clientes, módulos liberados e a chave de cada empresa'
 where slug = 'licencas';

-- ------------------------------------------------------------------------------------- colunas de valor fora do navegador
revoke select on public.lic_produtos, public.lic_planos, public.lic_contratos from anon, authenticated;
grant select (id, org_id, slug, nome, descricao, ativo, ordem, criado_em, sistema) on public.lic_produtos to authenticated;
grant select (id, org_id, nome, descricao, ativo, criado_em) on public.lic_planos to authenticated;
grant select (id, org_id, cliente_id, plano_id, dia_vencimento, inicio, fim, proporcional, reajuste_indice, reajuste_mes,
              ultimo_reajuste, situacao, encerrado_em, encerrado_motivo, observacao, por, criado_em, modalidade)
  on public.lic_contratos to authenticated;

-- mensalidades, recebimentos e reajustes: só com a permissão de valores
drop policy if exists lic_ver on public.lic_cobrancas;
drop policy if exists lic_ver on public.lic_baixas;
drop policy if exists lic_ver on public.lic_reajustes;
create policy lic_ver on public.lic_cobrancas for select to authenticated using ((select app.hub_pode(org_id, 'licencas', 'gerir')));
create policy lic_ver on public.lic_baixas for select to authenticated using ((select app.hub_pode(org_id, 'licencas', 'gerir')));
create policy lic_ver on public.lic_reajustes for select to authenticated using ((select app.hub_pode(org_id, 'licencas', 'gerir')));

create or replace function public.lic_valores(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not app.hub_pode(p_org, 'licencas', 'gerir') then raise exception 'Sem permissão para ver os valores das licenças'; end if;
  return jsonb_build_object(
    'produtos', coalesce((select jsonb_object_agg(id, preco) from lic_produtos where org_id = p_org), '{}'::jsonb),
    'planos', coalesce((select jsonb_object_agg(id, preco) from lic_planos where org_id = p_org), '{}'::jsonb),
    'contratos', coalesce((select jsonb_object_agg(id, jsonb_build_object('valor_mensal', valor_mensal, 'valor_tabela', valor_tabela))
                             from lic_contratos where org_id = p_org), '{}'::jsonb));
end $$;
comment on function public.lic_valores(uuid) is 'Preços dos módulos e planos e valores dos contratos de licença (só gerir = permissão de valores).';
revoke all on function public.lic_valores(uuid) from public, anon;
grant execute on function public.lic_valores(uuid) to authenticated;

-- ------------------------------------------------------------------------------------- cadastro da licença com operar
create or replace function public.lic_salvar_contrato(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid; v_antes lic_contratos; v_cli clientes; v_org uuid;
  v_plano uuid := nullif(p->>'plano', '')::uuid; v_prods uuid[]; v_tabela numeric; v_valor numeric := round((p->>'valor_mensal')::numeric, 2);
  v_inicio date := (p->>'inicio')::date; v_fim date := nullif(p->>'fim', '')::date; v_dia int := (p->>'dia_vencimento')::int;
  v_indice text := coalesce(nullif(p->>'reajuste_indice', ''), 'IPCA'); v_mes int := nullif(p->>'reajuste_mes', '')::int;
  v_conflito text; v_antes_prods jsonb; v_full boolean := coalesce(p->>'modalidade', '') = 'full'; v_modal text; v_valores boolean;
begin
  if v_id is not null then
    select * into v_antes from lic_contratos where id = v_id for update;
    if v_antes.id is null then raise exception 'Contrato não encontrado'; end if;
    if v_antes.situacao <> 'ativo' then raise exception 'Contrato encerrado não pode ser alterado'; end if;
    if (p->>'cliente') is not null and (p->>'cliente')::uuid <> v_antes.cliente_id then raise exception 'O contrato não muda de cliente'; end if;
    select * into v_cli from clientes where id = v_antes.cliente_id;
    select jsonb_agg(produto_id) into v_antes_prods from lic_contrato_produtos where contrato_id = v_id;
  else
    select * into v_cli from clientes where id = (p->>'cliente')::uuid;
    if v_cli.id is null then raise exception 'Cliente não encontrado'; end if;
  end if;
  v_org := v_cli.org_id;
  if not app.hub_pode(v_org, 'licencas', 'operar') then raise exception 'Sem permissão para cadastrar licenças do Ledgra'; end if;
  v_valores := app.hub_pode(v_org, 'licencas', 'gerir');
  if v_id is null and not v_cli.ativo then raise exception 'Cliente inativo não recebe contrato novo'; end if;

  if v_plano is not null and not exists (select 1 from lic_planos where id = v_plano and org_id = v_org) then
    raise exception 'Plano não encontrado';
  end if;
  if v_plano is not null and v_id is null and not exists (select 1 from lic_planos where id = v_plano and ativo) then
    raise exception 'Este plano está inativo';
  end if;
  if v_full then
    -- full: todos os módulos ativos do Ledgra (os do HUB, se vierem, entram junto)
    v_plano := null;
    select array_agg(distinct x) into v_prods from (
      select id as x from lic_produtos where org_id = v_org and sistema = 'ledgra' and ativo
      union select u::uuid from jsonb_array_elements_text(case when jsonb_typeof(p->'produtos') = 'array' then p->'produtos' else '[]' end) u
        join lic_produtos pr on pr.id = u::uuid and pr.sistema = 'hub') s;
    if coalesce(cardinality(v_prods), 0) = 0 then raise exception 'Não há módulo ativo do Ledgra para o contrato full'; end if;
  elsif jsonb_typeof(p->'produtos') = 'array' and jsonb_array_length(p->'produtos') > 0 then
    select array_agg(distinct x::uuid) into v_prods from jsonb_array_elements_text(p->'produtos') x;
  elsif v_plano is not null then
    select array_agg(produto_id) into v_prods from lic_plano_produtos where plano_id = v_plano;
  end if;
  if coalesce(cardinality(v_prods), 0) = 0 then raise exception 'Escolha um plano ou ao menos um módulo'; end if;
  if exists (select 1 from unnest(v_prods) u where not exists (select 1 from lic_produtos where id = u and org_id = v_org)) then
    raise exception 'Módulo não encontrado nesta organização';
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
  v_modal := case when v_full then 'full' when v_valor = 0 then 'gratuita' else 'pacote' end;

  v_tabela := coalesce((select preco from lic_planos where id = v_plano),
                       (select sum(preco) from lic_produtos where id = any (v_prods)), 0);
  if v_id is null then
    insert into lic_contratos (org_id, cliente_id, plano_id, valor_tabela, valor_mensal, dia_vencimento, inicio, fim, proporcional,
                               reajuste_indice, reajuste_mes, observacao, por, modalidade)
    values (v_org, v_cli.id, v_plano, v_tabela, v_valor, v_dia, v_inicio, v_fim, coalesce((p->>'proporcional')::boolean, false),
            v_indice, case when v_indice = 'nenhum' then null else v_mes end, nullif(trim(p->>'observacao'), ''), auth.uid(), v_modal)
    returning id into v_id;
  else
    update lic_contratos set plano_id = v_plano, valor_tabela = v_tabela, valor_mensal = v_valor, dia_vencimento = v_dia,
           inicio = v_inicio, fim = v_fim, proporcional = coalesce((p->>'proporcional')::boolean, proporcional),
           reajuste_indice = v_indice, reajuste_mes = case when v_indice = 'nenhum' then null else v_mes end,
           observacao = nullif(trim(p->>'observacao'), ''), modalidade = v_modal
     where id = v_id;
    delete from lic_contrato_produtos where contrato_id = v_id and produto_id <> all (v_prods);
  end if;
  insert into lic_contrato_produtos (contrato_id, produto_id, org_id) select v_id, u, v_org from unnest(v_prods) u on conflict do nothing;

  perform app.registrar(v_org, 'licencas', case when v_antes.id is null then 'criar_contrato' else 'alterar_contrato' end, v_id::text,
    case when v_antes.id is not null then to_jsonb(v_antes) || jsonb_build_object('produtos', v_antes_prods) end,
    (select to_jsonb(x) from lic_contratos x where x.id = v_id) || jsonb_build_object('produtos', to_jsonb(v_prods)));
  perform app.lic_gerar(v_org, app.hoje(v_org), v_id);
  return v_id;
end $$;
comment on function public.lic_salvar_contrato(jsonb) is
  'Cria ou altera a licença do Ledgra (operar; o valor só com gerir = permissão de valores). Modalidade: full (todos os módulos do Ledgra), gratuita (valor zero) ou pacote. Módulo não repete em dois contratos ativos do cliente; gera a mensalidade do mês se já valer.';


-- chave do Ledgra: quem cadastra licença (operar) gera e revoga
create or replace function public.lic_ledgra_chave_gerar(p_cliente uuid)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from clientes c where c.id = p_cliente and app.hub_pode(c.org_id, 'licencas', 'operar')) then
    if not exists (select 1 from clientes where id = p_cliente) then raise exception 'Cliente não encontrado'; end if;
    raise exception 'Sem permissão para gerar a chave do Ledgra';
  end if;
  return app.lic_ledgra_chave_nova(p_cliente, 'Chave nova gerada');
end $$;

create or replace function app.lic_ledgra_chave_nova(p_cliente uuid, p_motivo_anterior text)
returns text language plpgsql security definer set search_path = public as $$
declare v_cli clientes; v_hex text; v_chave text; v_id uuid;
begin
  select * into v_cli from clientes where id = p_cliente;
  if v_cli.id is null then raise exception 'Cliente não encontrado'; end if;
  if coalesce(regexp_replace(v_cli.cnpj, '\D', '', 'g'), '') = '' then raise exception 'Cadastre o CNPJ do cliente antes de gerar a chave'; end if;
  update lic_ledgra_chaves set revogada_em = now(), revogada_por = auth.uid(), revogada_motivo = p_motivo_anterior
   where cliente_id = p_cliente and revogada_em is null;
  v_hex := upper(encode(extensions.gen_random_bytes(15), 'hex'));
  v_chave := 'LDG-' || substr(v_hex, 1, 5) || '-' || substr(v_hex, 6, 5) || '-' || substr(v_hex, 11, 5) || '-'
          || substr(v_hex, 16, 5) || '-' || substr(v_hex, 21, 5) || '-' || substr(v_hex, 26, 5);
  insert into lic_ledgra_chaves (org_id, cliente_id, chave_hash, prefixo, criada_por)
  values (v_cli.org_id, p_cliente, encode(extensions.digest(v_chave, 'sha256'), 'hex'), left(v_chave, 9), auth.uid())
  returning id into v_id;
  perform app.registrar(v_cli.org_id, 'licencas', 'gerar_chave_ledgra', v_id::text, null,
    jsonb_build_object('cliente', p_cliente, 'prefixo', left(v_chave, 9), 'origem', p_motivo_anterior));
  return v_chave;
end $$;
revoke all on function app.lic_ledgra_chave_nova(uuid, text) from public, anon, authenticated;

create or replace function public.lic_ledgra_chave_revogar(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v lic_ledgra_chaves;
begin
  select * into v from lic_ledgra_chaves where id = p_id for update;
  if v.id is null then raise exception 'Chave não encontrada'; end if;
  if not app.hub_pode(v.org_id, 'licencas', 'operar') then raise exception 'Sem permissão para revogar a chave do Ledgra'; end if;
  if v.revogada_em is not null then raise exception 'Esta chave já foi revogada'; end if;
  if char_length(trim(coalesce(p_motivo, ''))) < 5 then raise exception 'Explique o motivo (mínimo 5 letras)'; end if;
  update lic_ledgra_chaves set revogada_em = now(), revogada_por = auth.uid(), revogada_motivo = trim(p_motivo) where id = p_id;
  perform app.registrar(v.org_id, 'licencas', 'revogar_chave_ledgra', p_id::text, null, jsonb_build_object('motivo', trim(p_motivo)));
end $$;

-- ------------------------------------------------------------------------------------- ligação pelo CNPJ (servidor do Ledgra)
create or replace function public.lic_ledgra_vincular_cnpj(p_cnpj text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cnpj text := regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g'); v_cli uuid; v_qtd int;
begin
  if length(v_cnpj) <> 14 then raise exception 'CNPJ inválido'; end if;
  select count(distinct c.id), min(c.id::text)::uuid into v_qtd, v_cli
    from clientes c
   where regexp_replace(coalesce(c.cnpj, ''), '\D', '', 'g') = v_cnpj and c.ativo
     and exists (select 1 from lic_contratos k
                  join lic_contrato_produtos cp on cp.contrato_id = k.id
                  join lic_produtos pr on pr.id = cp.produto_id and pr.sistema = 'ledgra'
                 where k.cliente_id = c.id and k.situacao = 'ativo');
  if v_qtd = 0 then raise exception 'Não há licença do Ledgra ativa para este CNPJ no HUB MDC. Cadastre a licença em Licenças Ledgra'; end if;
  if v_qtd > 1 then raise exception 'Este CNPJ tem licença em mais de um cliente do HUB; use a chave gerada no HUB'; end if;
  return jsonb_build_object('chave', app.lic_ledgra_chave_nova(v_cli, 'Ligação pelo CNPJ no Ledgra'));
end $$;
comment on function public.lic_ledgra_vincular_cnpj(text) is
  'Só o servidor do Ledgra (chave de serviço): acha a licença ativa do CNPJ e devolve uma chave nova (a anterior é revogada).';
revoke all on function public.lic_ledgra_vincular_cnpj(text) from public, anon, authenticated;
grant execute on function public.lic_ledgra_vincular_cnpj(text) to service_role;
