-- =====================================================================================================
--  067 · Licença do ERP Ledgra pelo HUB (pedido do Edvaldo, 10/11/2026)
--
--  "Cada empresa do Ledgra precisa ter o vínculo de chave do Ledgra com o HUB MDC, onde garante a MDC receber pela
--  locação da ferramenta. No HUB a licença pode ser gratuita (eu defino quais módulos), por pacote (onde defino
--  valores) e full (onde tem todos os módulos)."
--
--  lic_produtos.sistema     'hub' (módulos do HUB/Portal) ou 'ledgra' (módulos do ERP Ledgra: ledgra-financeiro,
--                           ledgra-compras, ledgra-vendas, ledgra-estoque, ledgra-producao, ledgra-auditor)
--  lic_contratos.modalidade gratuita (valor zero, módulos escolhidos) · pacote (plano ou módulos com valor) ·
--                           full (todos os módulos ativos do Ledgra, inclusive os que forem criados depois)
--  lic_ledgra_chaves        a chave de cada cliente (uma ativa por vez). Guarda só o hash SHA-256 e o começo da
--                           chave; o texto aparece UMA vez, ao gerar. Revogar pede motivo; nada se apaga.
--  lic_ledgra_validar       chamada pelo servidor do Ledgra (chave pública do HUB) com a chave e o CNPJ: devolve
--                           situação (ativa, bloqueada, sem_contrato, cnpj_diferente, invalida), modalidade, módulos e
--                           validade. O Ledgra só libera aos usuários do cliente o que vier aqui.
-- =====================================================================================================

-- ------------------------------------------------------------------------------------- colunas
alter table public.lic_produtos add column if not exists sistema text not null default 'hub';
alter table public.lic_produtos drop constraint if exists lic_produtos_sistema_check;
alter table public.lic_produtos add constraint lic_produtos_sistema_check check (sistema in ('hub', 'ledgra'));
comment on column public.lic_produtos.sistema is 'hub = módulo do HUB/Portal; ledgra = módulo do ERP Ledgra (liberado pela chave do Ledgra).';

alter table public.lic_contratos add column if not exists modalidade text not null default 'pacote';
alter table public.lic_contratos drop constraint if exists lic_contratos_modalidade_check;
alter table public.lic_contratos add constraint lic_contratos_modalidade_check check (modalidade in ('gratuita', 'pacote', 'full'));
update public.lic_contratos set modalidade = 'gratuita' where valor_mensal = 0 and modalidade = 'pacote';
comment on column public.lic_contratos.modalidade is
  'gratuita = valor zero e módulos escolhidos; pacote = plano ou módulos com valor; full = todos os módulos ativos do Ledgra (os novos entram sozinhos).';

-- ------------------------------------------------------------------------------------- módulos do Ledgra
create or replace function app.lic_semear_ledgra(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into lic_produtos (org_id, slug, nome, descricao, sistema, ordem)
  values
    (p_org, 'ledgra-financeiro', 'Ledgra · Financeiro', 'Contas a pagar e a receber, bancos, conciliação do extrato e resultados', 'ledgra', 200),
    (p_org, 'ledgra-compras', 'Ledgra · Compras e notas de entrada', 'Solicitação, cotação, pedido com aprovação, recebimento e XML das notas de compra', 'ledgra', 210),
    (p_org, 'ledgra-vendas', 'Ledgra · Vendas e notas de saída', 'Pedido de venda e emissão de NF-e e NFS-e', 'ledgra', 220),
    (p_org, 'ledgra-estoque', 'Ledgra · Estoque', 'Depósitos, lotes e validade, transferências e posição do estoque', 'ledgra', 230),
    (p_org, 'ledgra-producao', 'Ledgra · Produção', 'Estrutura de produto, ordens de produção e baixa da produção com IA', 'ledgra', 240),
    (p_org, 'ledgra-auditor', 'Ledgra · Auditor', 'Base de legislação, NCM/TIPI e auditoria de SPED', 'ledgra', 250)
  on conflict (org_id, slug) do update set sistema = 'ledgra';
end $$;
revoke all on function app.lic_semear_ledgra(uuid) from public, anon, authenticated;
comment on function app.lic_semear_ledgra(uuid) is 'Cria os módulos do Ledgra (preço zero; a MDC define em Produtos e planos). Repetir não duplica.';

select app.lic_semear_ledgra(id) from public.organizacoes;

-- organização nova já nasce com os módulos do Ledgra
create or replace function app.tg_org_ledgra() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform app.lic_semear_ledgra(new.id);
  return new;
end $$;
drop trigger if exists org_ledgra on public.organizacoes;
create trigger org_ledgra after insert on public.organizacoes for each row execute function app.tg_org_ledgra();

-- ------------------------------------------------------------------------------------- contrato com modalidade
create or replace function public.lic_salvar_contrato(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid; v_antes lic_contratos; v_cli clientes; v_org uuid;
  v_plano uuid := nullif(p->>'plano', '')::uuid; v_prods uuid[]; v_tabela numeric; v_valor numeric := round((p->>'valor_mensal')::numeric, 2);
  v_inicio date := (p->>'inicio')::date; v_fim date := nullif(p->>'fim', '')::date; v_dia int := (p->>'dia_vencimento')::int;
  v_indice text := coalesce(nullif(p->>'reajuste_indice', ''), 'IPCA'); v_mes int := nullif(p->>'reajuste_mes', '')::int;
  v_conflito text; v_antes_prods jsonb; v_full boolean := coalesce(p->>'modalidade', '') = 'full'; v_modal text;
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
  if not app.hub_pode(v_org, 'licencas', 'gerir') then raise exception 'Sem permissão para cadastrar contratos de licença'; end if;
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
  'Cria ou altera contrato de licença (gerir). Modalidade: full (todos os módulos do Ledgra), gratuita (valor zero) ou pacote. Módulo não repete em dois contratos ativos do cliente; gera a mensalidade do mês se já valer.';

-- ------------------------------------------------------------------------------------- chave do Ledgra
create table if not exists public.lic_ledgra_chaves (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  chave_hash text not null unique,
  prefixo text not null,
  criada_em timestamptz not null default now(),
  criada_por uuid,
  revogada_em timestamptz,
  revogada_por uuid,
  revogada_motivo text,
  ultimo_uso_em timestamptz,
  ultimo_uso_situacao text,
  check (revogada_em is null or coalesce(trim(revogada_motivo), '') <> '')
);
create unique index if not exists lic_ledgra_chaves_ativa on public.lic_ledgra_chaves (cliente_id) where revogada_em is null;
create index if not exists lic_ledgra_chaves_org on public.lic_ledgra_chaves (org_id, criada_em desc);
alter table public.lic_ledgra_chaves enable row level security;
drop policy if exists lic_ledgra_chaves_ler on public.lic_ledgra_chaves;
create policy lic_ledgra_chaves_ler on public.lic_ledgra_chaves for select to authenticated
  using ((select app.hub_pode(org_id, 'licencas', 'ver')));
revoke insert, update, delete on public.lic_ledgra_chaves from anon, authenticated;
comment on table public.lic_ledgra_chaves is
  'Chave do ERP Ledgra de cada cliente (uma ativa). Só o hash SHA-256 e o começo; o texto aparece uma vez ao gerar.';

create or replace function public.lic_ledgra_chave_gerar(p_cliente uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_cli clientes; v_hex text; v_chave text; v_id uuid;
begin
  select * into v_cli from clientes where id = p_cliente;
  if v_cli.id is null then raise exception 'Cliente não encontrado'; end if;
  if not app.hub_pode(v_cli.org_id, 'licencas', 'gerir') then raise exception 'Sem permissão para gerar a chave do Ledgra'; end if;
  if coalesce(regexp_replace(v_cli.cnpj, '\D', '', 'g'), '') = '' then raise exception 'Cadastre o CNPJ do cliente antes de gerar a chave'; end if;
  update lic_ledgra_chaves set revogada_em = now(), revogada_por = auth.uid(), revogada_motivo = 'Chave nova gerada'
   where cliente_id = p_cliente and revogada_em is null;
  v_hex := upper(encode(extensions.gen_random_bytes(15), 'hex'));
  v_chave := 'LDG-' || substr(v_hex, 1, 5) || '-' || substr(v_hex, 6, 5) || '-' || substr(v_hex, 11, 5) || '-'
          || substr(v_hex, 16, 5) || '-' || substr(v_hex, 21, 5) || '-' || substr(v_hex, 26, 5);
  insert into lic_ledgra_chaves (org_id, cliente_id, chave_hash, prefixo, criada_por)
  values (v_cli.org_id, p_cliente, encode(extensions.digest(v_chave, 'sha256'), 'hex'), left(v_chave, 9), auth.uid())
  returning id into v_id;
  perform app.registrar(v_cli.org_id, 'licencas', 'gerar_chave_ledgra', v_id::text, null, jsonb_build_object('cliente', p_cliente, 'prefixo', left(v_chave, 9)));
  return v_chave;
end $$;
comment on function public.lic_ledgra_chave_gerar(uuid) is
  'Gera a chave do Ledgra do cliente (gerir). A anterior é revogada. Devolve o texto uma única vez; o banco guarda só o hash.';

create or replace function public.lic_ledgra_chave_revogar(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v lic_ledgra_chaves;
begin
  select * into v from lic_ledgra_chaves where id = p_id for update;
  if v.id is null then raise exception 'Chave não encontrada'; end if;
  if not app.hub_pode(v.org_id, 'licencas', 'gerir') then raise exception 'Sem permissão para revogar a chave do Ledgra'; end if;
  if v.revogada_em is not null then raise exception 'Esta chave já foi revogada'; end if;
  if char_length(trim(coalesce(p_motivo, ''))) < 5 then raise exception 'Explique o motivo (mínimo 5 letras)'; end if;
  update lic_ledgra_chaves set revogada_em = now(), revogada_por = auth.uid(), revogada_motivo = trim(p_motivo) where id = p_id;
  perform app.registrar(v.org_id, 'licencas', 'revogar_chave_ledgra', p_id::text, null, jsonb_build_object('motivo', trim(p_motivo)));
end $$;

-- o Ledgra chama esta função com a chave e o CNPJ da empresa (chave pública do HUB; a chave é o segredo)
create or replace function public.lic_ledgra_validar(p_chave text, p_cnpj text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v lic_ledgra_chaves; v_cli clientes; v_hoje date; v_mods text[]; v_modal text; v_fim date; v_sit text;
begin
  select * into v from lic_ledgra_chaves
   where chave_hash = encode(extensions.digest(upper(regexp_replace(coalesce(p_chave, ''), '\s', '', 'g')), 'sha256'), 'hex')
     and revogada_em is null;
  if v.id is null then return jsonb_build_object('situacao', 'invalida'); end if;
  select * into v_cli from clientes where id = v.cliente_id;
  if regexp_replace(coalesce(v_cli.cnpj, ''), '\D', '', 'g') <> regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g') then
    update lic_ledgra_chaves set ultimo_uso_em = now(), ultimo_uso_situacao = 'cnpj_diferente' where id = v.id;
    return jsonb_build_object('situacao', 'cnpj_diferente');
  end if;
  v_hoje := app.hoje(v.org_id);
  -- módulos do Ledgra nos contratos ativos e vigentes (full = todos os ativos do Ledgra hoje)
  select array_agg(distinct m order by m), max(fim_k) filter (where fim_k is not null),
         (array_agg(modal order by case modal when 'full' then 1 when 'pacote' then 2 else 3 end))[1]
    into v_mods, v_fim, v_modal
    from (
      select replace(pr.slug, 'ledgra-', '') as m, k.fim as fim_k, k.modalidade as modal
        from lic_contratos k
        join lic_produtos pr on pr.org_id = k.org_id and pr.sistema = 'ledgra' and pr.ativo
       where k.cliente_id = v.cliente_id and k.situacao = 'ativo' and k.inicio <= v_hoje and (k.fim is null or k.fim >= v_hoje)
         and (k.modalidade = 'full' or exists (select 1 from lic_contrato_produtos cp where cp.contrato_id = k.id and cp.produto_id = pr.id))
    ) s;
  v_sit := case when app.cliente_bloqueado(v.cliente_id) then 'bloqueada' when coalesce(cardinality(v_mods), 0) = 0 then 'sem_contrato' else 'ativa' end;
  update lic_ledgra_chaves set ultimo_uso_em = now(), ultimo_uso_situacao = v_sit where id = v.id;
  return jsonb_build_object('situacao', v_sit, 'modalidade', v_modal,
    'modulos', case when v_sit = 'ativa' then to_jsonb(v_mods) else '[]'::jsonb end,
    'valido_ate', v_fim, 'cliente', coalesce(v_cli.nome_fantasia, v_cli.razao_social), 'verificado_em', now());
end $$;
comment on function public.lic_ledgra_validar(text, text) is
  'Chamada pelo servidor do ERP Ledgra: chave + CNPJ → situação, modalidade e módulos liberados. Registra o último uso.';

revoke all on function public.lic_ledgra_chave_gerar(uuid), public.lic_ledgra_chave_revogar(uuid, text), public.lic_ledgra_validar(text, text) from public;
grant execute on function public.lic_ledgra_chave_gerar(uuid), public.lic_ledgra_chave_revogar(uuid, text) to authenticated;
grant execute on function public.lic_ledgra_validar(text, text) to anon, authenticated;
